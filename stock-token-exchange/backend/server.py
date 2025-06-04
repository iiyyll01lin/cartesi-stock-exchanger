from flask import Flask, request, jsonify, Blueprint
import logging
import json
import os
import sys
import time
import stat
import traceback
import uuid  # Added for request tracking
from web3 import Web3  # Uncommented for blockchain interaction
from dotenv import load_dotenv  # For loading environment variables securely
from web3.middleware import geth_poa_middleware
from pathlib import Path
from flask_cors import CORS
from web3.exceptions import ContractLogicError # Add this

# Import error handling utilities
try:
    # Fix the import paths for utils modules
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from utils.errors import error_response
    from utils.error_types import ErrorType
    from utils.logger import log_error
    from utils.circuit_breaker import blockchain_breaker
    from utils.validation import validate_ethereum_address, validate_amount, validate_order_data
    logger = logging.getLogger(__name__)
    logger.info("Successfully imported utility modules")
except Exception as e:
    # Configure logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    logger = logging.getLogger(__name__)
    logger.error(f"Error importing utility modules: {e}")
    
    # Fallback implementations in case of import error
    def error_response(error_type, message, status_code=400, details=None):
        response = {"status": "error", "message": message}
        if details:
            response["details"] = details
        return jsonify(response), status_code
    
    def log_error(message, error=None, context=None):
        if error:
            logger.error(f"{message}: {str(error)}")
        else:
            logger.error(message)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app) # Enable CORS for frontend interaction

# Add middleware for request tracking
@app.before_request
def before_request():
    request.id = str(uuid.uuid4())
    request.start_time = time.time()
    logger.info(f"Request {request.id}: {request.method} {request.path}")

@app.after_request
def after_request(response):
    if hasattr(request, 'start_time'):
        duration = time.time() - request.start_time
        response.headers['X-Request-Time'] = str(duration)
        response.headers['X-Request-ID'] = request.id
        logger.info(f"Request {request.id} completed in {duration:.4f}s with status {response.status_code}")
    return response

# --- Secure Configuration Management ---

# Function to securely load private key with multiple methods
def load_admin_private_key():
    """
    Securely load admin private key with the following priority:
    1. Docker secret (most secure for production)
    2. External file specified by ADMIN_KEY_FILE env var (good for prod/staging)
    3. Environment variable ADMIN_PRIVATE_KEY (convenient for development)
    
    Returns the key if found, None otherwise.
    """
    # Method 1: Try Docker secret first (most secure for production)
    docker_secret_path = "/run/secrets/admin_private_key"
    if os.path.exists(docker_secret_path):
        # Check file permissions - should be restricted
        st = os.stat(docker_secret_path)
        if bool(st.st_mode & (stat.S_IRWXG | stat.S_IRWXO)):  # Group/other has any permission
            logger.warning("⚠️ Docker secret file has too open permissions! Should be 400 (read-only for owner).")
        
        try:
            with open(docker_secret_path, 'r') as f:
                key = f.read().strip()
                if validate_private_key(key):
                    logger.info("Admin private key loaded from Docker secret.")
                    return key
                else:
                    logger.warning(f"Invalid private key format in Docker secret: {docker_secret_path}")
        except Exception as e:
            logger.error(f"Error reading Docker secret {docker_secret_path}: {e}")

    # Method 2: Try environment variable ADMIN_PRIVATE_KEY
    key_env = os.getenv("ADMIN_PRIVATE_KEY")
    if key_env:
        if validate_private_key(key_env):
            logger.info("Admin private key loaded from ADMIN_PRIVATE_KEY environment variable.")
            return key_env
        else:
            logger.warning("Invalid private key format in ADMIN_PRIVATE_KEY environment variable.")

    # Method 3: Try environment variable ADMIN_KEY_FILE pointing to a file
    key_file_path_env = os.getenv("ADMIN_KEY_FILE")
    if key_file_path_env:
        if os.path.exists(key_file_path_env):
            try:
                with open(key_file_path_env, "r") as f:
                    key = f.read().strip()
                    if validate_private_key(key):
                        logger.info(f"Admin private key loaded from file specified by ADMIN_KEY_FILE: {key_file_path_env}")
                        return key
                    else:
                        logger.warning(f"Invalid private key format in file: {key_file_path_env}")
            except Exception as e:
                logger.error(f"Error reading private key file {key_file_path_env}: {e}")
        else:
            logger.warning(f"Admin private key file specified by ADMIN_KEY_FILE not found: {key_file_path_env}")
    
    logger.error("Admin private key not found or invalid. Please set it via Docker secret, ADMIN_PRIVATE_KEY env var, or ADMIN_KEY_FILE env var.")
    return None

# Validate private key format
def validate_private_key(key):
    """Validate that a private key is in the correct format"""
    if key is None:
        return False
    key = key.strip()
    if key.startswith("0x"):
        key = key[2:]
    if len(key) == 64 and all(c in "0123456789abcdefABCDEF" for c in key):
        return True
    logger.warning(f"Private key validation failed for key: {'*' * (len(key) - 4) + key[-4:] if len(key) > 4 else '***'}")
    return False

# --- Configuration ---
# Get values from environment variables for security
EXCHANGE_CONTRACT_ADDRESS = os.getenv("EXCHANGE_CONTRACT_ADDRESS", "YOUR_CONTRACT_ADDRESS")
STOCK_TOKEN_ADDRESS = os.getenv("STOCK_TOKEN_ADDRESS", "YOUR_CONTRACT_ADDRESS")
NODE_URL = os.getenv("NODE_URL", "http://localhost:8545")  # e.g., Hardhat node
MAX_ORDERS_PER_BATCH = int(os.getenv("MAX_ORDERS_PER_BATCH", "100"))  # Limit orders per batch

# Load admin private key securely
ADMIN_PRIVATE_KEY = load_admin_private_key()
if not ADMIN_PRIVATE_KEY:
    logger.critical("CRITICAL: Admin private key could not be loaded. Backend may not function correctly for admin operations.")

# --- Global Variables ---
w3 = None
exchange_contract = None
stock_token_contract = None
exchange_address = None
stock_token_address = None
exchange_abi = None
stock_token_abi = None
node_url = None
max_orders_per_batch = 100 # Default value

# --- Web3 Setup ---
def load_contract_abi(contract_name):
    """Loads ABI from the deployment artifact JSON file."""
    try:
        # Path relative to the backend directory where server.py is located
        artifact_path = Path(__file__).parent.parent / f"deployments/localhost/{contract_name}.json"
        if not artifact_path.exists():
            logger.error(f"ABI artifact not found at {artifact_path}")
            return None
        with open(artifact_path, 'r') as f:
            artifact = json.load(f)
            return artifact.get('abi')
    except Exception as e:
        logger.error(f"Error loading ABI for {contract_name}: {e}")
        return None

def setup_web3():
    """Initializes Web3 connection and contract instances."""
    # Declare globals that this function will assign or use from module scope
    global w3, exchange_contract, stock_token_contract, exchange_address, stock_token_address
    global exchange_abi, stock_token_abi, node_url, max_orders_per_batch
    # Note: We use ADMIN_PRIVATE_KEY (uppercase) that is loaded at module level

    # Explicitly load the .env file from the /app directory
    # This ensures that even during Flask reloads, we are loading the correct .env
    # Assumes server.py is in /app/backend, so .parent.parent is /app
    dotenv_path = Path(__file__).resolve().parent.parent / '.env'
    if dotenv_path.exists():
        logger.info(f"Attempting to load .env file from: {dotenv_path}")
        load_dotenv(dotenv_path=dotenv_path, override=True)
    else:
        logger.warning(f".env file not found at {dotenv_path}, relying on existing environment variables or defaults.")
        # Still call load_dotenv without path to try default locations, or rely on Docker env vars
        load_dotenv(override=True)


    # Read configuration from environment AFTER load_dotenv
    # Assign to global 'node_url' and 'max_orders_per_batch'
    node_url = os.getenv('NODE_URL', 'http://localhost:8545') # Default if not set
    max_orders_per_batch = int(os.getenv('MAX_ORDERS_PER_BATCH', 100)) # Load from env with default
    
    # These are read here to be logged and then potentially updated in the loop below
    exchange_address_env = os.getenv('EXCHANGE_CONTRACT_ADDRESS')
    stock_token_address_env = os.getenv('STOCK_TOKEN_ADDRESS')

    logger.info(f"--- Backend Configuration (after load_dotenv in setup_web3) ---")
    logger.info(f"NODE_URL from os.getenv: {node_url}") # Log the actual value being used
    logger.info(f"EXCHANGE_CONTRACT_ADDRESS (from env): {exchange_address_env}")
    logger.info(f"STOCK_TOKEN_ADDRESS (from env): {stock_token_address_env}")
    logger.info(f"MAX_ORDERS_PER_BATCH: {max_orders_per_batch}")
    # Log status of the module-level ADMIN_PRIVATE_KEY (uppercase)
    logger.info(f"Admin PK loaded (module scope): {'Yes' if ADMIN_PRIVATE_KEY else 'No'}")
    logger.info(f"-----------------------------")

    # --- Wait for Deployment ---
    # Check if the address from env is valid (not None and not zero address)
    # Give the deployer some time to update the .env file if needed.
    max_wait_time = 60 # seconds
    start_time = time.time()
    zero_address = "0x" + "0" * 40
    valid_address_found = False

    # Use the initially read values for the loop's first check.
    # These will be updated inside the loop if .env changes.
    current_exchange_address_from_env = exchange_address_env
    current_stock_token_address_from_env = stock_token_address_env

    while time.time() - start_time < max_wait_time:
        # Reload .env in case it was updated after initial load (e.g., by deployer script)
        load_dotenv(override=True)
        # Re-read contract addresses after this load_dotenv
        current_exchange_address_from_env = os.getenv('EXCHANGE_CONTRACT_ADDRESS')
        current_stock_token_address_from_env = os.getenv('STOCK_TOKEN_ADDRESS')
        # Optional: Re-read node_url if it could change during this specific loop,
        # though the main concern was its value on Flask reload (handled by load_dotenv at function start).
        # node_url = os.getenv('NODE_URL', node_url) # Updates global node_url

        if current_exchange_address_from_env and current_exchange_address_from_env != zero_address and \
           current_stock_token_address_from_env and current_stock_token_address_from_env != zero_address:
            logger.info("Valid contract addresses found in environment variables.")
            try:
                # Assign to global variables (declared global at the start of setup_web3)
                exchange_address = Web3.to_checksum_address(current_exchange_address_from_env)
                stock_token_address = Web3.to_checksum_address(current_stock_token_address_from_env)
                valid_address_found = True
                logger.info(f"Using Exchange: {exchange_address}, Token: {stock_token_address}")
                break  # Exit loop once valid addresses are found and processed
            except Exception as e:
                logger.error(f"Error checksumming address ({current_exchange_address_from_env}, {current_stock_token_address_from_env}): {e}. Will retry.")
                valid_address_found = False # Ensure we retry if checksumming fails
        else:
            logger.warning(f"Waiting for valid contract addresses in .env... (found: Exchange={current_exchange_address_from_env}, Token={current_stock_token_address_from_env})")
        
        time.sleep(5) # Wait 5 seconds before checking again

    if not valid_address_found:
        logger.error("FATAL: Timed out waiting for valid contract addresses in .env file. Backend cannot start.")
        # Optionally raise an exception or exit
        raise RuntimeError("Could not find valid contract addresses in environment after waiting.")
        # return # Or simply return if you want the app to run but endpoints to fail

    # --- Load ABIs ---
    exchange_abi = load_contract_abi("Exchange")
    stock_token_abi = load_contract_abi("StockToken")

    if not exchange_abi or not stock_token_abi:
        logger.error("FATAL: Could not load contract ABIs. Check deployment artifacts.")
        raise RuntimeError("Failed to load contract ABIs.")
        # return

    # --- Initialize Web3 ---
    try:
        w3 = Web3(Web3.HTTPProvider(node_url))
        
        # Add POA middleware for compatibility with networks like Goerli, BSC, etc.
        # This is required when connecting to most PoA (Proof of Authority) networks
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        
        if not w3.is_connected():
            logger.error(f"Failed to connect to blockchain node at {node_url}")
            return # Cannot proceed without connection
        logger.info(f"Successfully connected to blockchain node at {node_url} (Chain ID: {w3.eth.chain_id})")
    except Exception as e:
        logger.error(f"Error connecting to Web3 provider: {e}")
        return

    # --- Initialize Contracts ---
    try:
        exchange_contract = w3.eth.contract(address=exchange_address, abi=exchange_abi)
        stock_token_contract = w3.eth.contract(address=stock_token_address, abi=stock_token_abi)
        logger.info(f"Exchange contract initialized at {exchange_address}")
        logger.info(f"StockToken contract initialized at {stock_token_address}")
    except Exception as e:
        logger.error(f"Error initializing contract instances: {e}")
        # Reset contract variables if initialization fails
        exchange_contract = None
        stock_token_contract = None
        return

# Call setup function at module level to initialize on import
setup_web3()

# --- Mock Data (if not connected to blockchain) ---
# Placeholder data store (for development/testing)
mock_db = {
    "orders": {},  # Store orders by ID: { 1: {"id": 1, ...}, 2: {...} }
    "next_order_id": 1
}

# --- Blockchain State Query Functions ---

def get_order_from_blockchain(order_id):
    """
    Fetch a specific order directly from the blockchain.
    Returns None if order not found or if blockchain connection is unavailable.
    """
    if not w3.is_connected() or not exchange_contract:
        logger.warning(f"Cannot fetch order {order_id} from blockchain: Web3 setup incomplete")
        return None
    
    try:
        # Call the getOrder function from Exchange.sol
        order = exchange_contract.functions.getOrder(order_id).call()
        
        # Format into the structure used by the API
        return {
            "id": order_id,  # Using the input order_id to avoid any type conversion issues
            "user": order[1],  # Assuming order[0] is id, order[1] is user, etc.
            "token": order[2],
            "amount": int(order[3]),
            "price": int(order[4]),
            "isBuyOrder": bool(order[5]),
            "active": bool(order[6])
        }
    except Exception as e:
        logger.error(f"Error fetching order {order_id} from blockchain: {str(e)}")
        return None

def get_user_token_balance(user_address, token_address):
    """
    Fetch token balance for a user directly from the blockchain.
    Returns 0 if balance cannot be fetched or if blockchain connection is unavailable.
    """
    if not w3.is_connected() or not exchange_contract:
        logger.warning(f"Cannot fetch token balance: Web3 setup incomplete")
        return 0
    
    try:
        # Ensure addresses are checksummed
        user = Web3.to_checksum_address(user_address)
        token = Web3.to_checksum_address(token_address)
        
        # Call the getUserTokenBalance function from Exchange.sol
        balance = exchange_contract.functions.getUserTokenBalance(user, token).call()
        return int(balance)
    except Exception as e:
        logger.error(f"Error fetching token balance for {user_address}: {str(e)}")
        return 0

def get_user_eth_balance(user_address):
    """
    Fetch ETH balance for a user directly from the blockchain.
    Returns 0 if balance cannot be fetched or if blockchain connection is unavailable.
    """
    if not w3.is_connected() or not exchange_contract:
        logger.warning(f"Cannot fetch ETH balance: Web3 setup incomplete")
        return 0
    
    try:
        # Ensure address is checksummed
        user = Web3.to_checksum_address(user_address)
        
        # Call the getUserEthBalance function from Exchange.sol
        balance = exchange_contract.functions.getUserEthBalance(user).call()
        return int(balance)
    except Exception as e:
        logger.error(f"Error fetching ETH balance for {user_address}: {str(e)}")
        return 0

def fetch_all_active_orders():
    """
    Fetches all active orders from the blockchain.
    """
    logger.info("Fetching active order IDs from blockchain...")
    try:
        if exchange_contract:
            # Ensure that w3 is available and connected
            if not w3 or not w3.is_connected():
                logger.error("Web3 is not initialized or connected.")
                return []
            
            try:
                # Check if the getActiveOrderIds function exists in the contract
                if hasattr(exchange_contract.functions, 'getActiveOrderIds'):
                    active_order_ids = exchange_contract.functions.getActiveOrderIds().call()
                    logger.info(f"Successfully retrieved {len(active_order_ids)} active order IDs from blockchain")
                else:
                    logger.warning("getActiveOrderIds function not found in contract ABI. Using fallback method.")
                    # Fallback: We'll try to iterate through orders by ID until we find None or hit an error
                    active_order_ids = []
                    # Assuming order IDs start at 1 and are sequential
                    max_orders_to_check = 100  # Reasonable limit to avoid infinite loop
                    for i in range(1, max_orders_to_check + 1):
                        try:
                            order = exchange_contract.functions.getOrder(i).call()
                            if order and order[6]:  # Check if order exists and is active (index 6 is active status)
                                active_order_ids.append(i)
                        except Exception as e:
                            if "revert" in str(e).lower():
                                # Likely reached an ID that doesn't exist yet
                                break
                            else:
                                # Some other error occurred
                                logger.error(f"Error checking order ID {i}: {e}")
                                continue
                    logger.info(f"Fallback method found {len(active_order_ids)} active order IDs")
                
                active_orders = []
                for order_id in active_order_ids:
                    if order_id == 0:  # Skip if order_id is 0 (unlikely, but good practice)
                        continue
                    order_data = get_order_from_blockchain(order_id)
                    # Ensure order_data is not None and is active
                    if order_data and order_data.get("active", False):
                        active_orders.append(order_data)
                logger.info(f"Fetched {len(active_orders)} active orders from blockchain.")
                return active_orders
            except Exception as e:
                logger.error(f"Error fetching active orders: {e}")
                return []
        else:
            logger.warning("Exchange contract not initialized, cannot fetch active orders.")
            return []
    except Exception as e:
        logger.error(f"Unexpected error in fetch_all_active_orders: {e}")
        return []

def estimate_order_count_from_events(blocks_to_check=1000):
    """
    Estimate the number of orders by looking for OrderPlaced events.
    This is a fallback method if getOrderCount function is not available.
    """
    try:
        # Get current block
        current_block = w3.eth.block_number
        start_block = max(0, current_block - blocks_to_check)
        
        # Check if OrderPlaced event exists in the ABI
        event_exists = any(item.get('name') == 'OrderPlaced' and item.get('type') == 'event' 
                          for item in exchange_contract.abi)
        
        if not event_exists:
            logger.warning("OrderPlaced event not found in contract ABI. Cannot estimate order count from events.")
            return None
        
        # Create filter for OrderPlaced events
        order_filter = exchange_contract.events.OrderPlaced.create_filter(
            fromBlock=start_block,
            toBlock='latest'
        )
        
        # Get all events
        events = order_filter.get_all_entries()
        
        # If we have events, find the highest order ID
        if events:
            # Different contracts might have different argument names, try both common patterns
            highest_id = None
            for event in events:
                order_id = None
                # Try orderId
                if 'orderId' in event['args']:
                    order_id = event['args']['orderId']
                # Try id
                elif 'id' in event['args']:
                    order_id = event['args']['id']
                # Try order.id pattern
                elif 'order' in event['args'] and hasattr(event['args']['order'], 'id'):
                    order_id = event['args']['order'].id
                
                if order_id is not None and (highest_id is None or order_id > highest_id):
                    highest_id = order_id
            
            return highest_id
        
        return None
    except Exception as e:
        logger.error(f"Error estimating order count from events: {str(e)}")
        return None

def sync_mock_db_with_blockchain():
    """
    Synchronize the mock database with the current blockchain state.
    Useful for development and when switching between mock/real modes.
    """
    if not w3.is_connected() or not exchange_contract:
        logger.warning("Cannot sync with blockchain: Web3 setup incomplete")
        return False
    
    try:
        logger.info("Syncing mock database with blockchain state...")
        
        # 1. Fetch all orders
        active_orders = fetch_all_active_orders()
        if active_orders:
            # Update mock_db with fetched orders
            mock_db["orders"] = {order["id"]: order for order in active_orders}
            
            # Update next_order_id based on highest id found
            highest_id = max(order["id"] for order in active_orders) if active_orders else 0
            mock_db["next_order_id"] = highest_id + 1
            
            logger.info(f"Synced {len(active_orders)} active orders. Next order ID: {mock_db['next_order_id']}")
            return True
        else:
            logger.info("No active orders found on blockchain")
            return False
    except Exception as e:
        logger.error(f"Error syncing with blockchain: {str(e)}")
        return False

# Add a route to trigger manual sync
@app.route('/admin/sync-blockchain', methods=['POST'])
def admin_sync_blockchain():
    """Admin endpoint to manually trigger a sync with blockchain state"""
    success = sync_mock_db_with_blockchain()
    if success:
        return jsonify({"status": "success", "message": "Synced mock DB with blockchain state"})
    else:
        return jsonify({"status": "error", "message": "Failed to sync with blockchain state"}), 500

# --- API Endpoints ---

@app.route('/')
def hello():
    return jsonify({"message": "Stock Exchange Backend API"})

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get the status of the backend services"""
    status = {
        "ethereum_node": w3.is_connected() if w3 else False,
        "exchange_contract": exchange_contract is not None,
        "stock_token_contract": stock_token_contract is not None,
        "admin_private_key_loaded": ADMIN_PRIVATE_KEY is not None,
        "mock_db_order_count": len(mock_db["orders"]),
        "max_orders_per_batch": MAX_ORDERS_PER_BATCH
    }
    return jsonify(status)

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint that reports on the status of various components
    """
    def check_blockchain_health():
        if not w3:
            return {"healthy": False, "reason": "Web3 instance not initialized"}
        
        try:
            connected = w3.is_connected()
            if connected:
                # Try to get the current block to verify deeper connectivity
                current_block = w3.eth.block_number
                return {
                    "healthy": True,
                    "block_number": current_block,
                    "chain_id": w3.eth.chain_id
                }
            else:
                return {"healthy": False, "reason": "Not connected to Ethereum node"}
        except Exception as e:
            log_error("Error checking blockchain health", e)
            return {"healthy": False, "reason": str(e)}
    
    def check_contracts_health():
        if not exchange_contract or not stock_token_contract:
            return {
                "healthy": False, 
                "reason": "Contracts not initialized", 
                "exchange_contract": bool(exchange_contract), 
                "stock_token_contract": bool(stock_token_contract)
            }
        
        try:
            # Try to call a view function on each contract
            result = {
                "exchange": {"healthy": False},
                "token": {"healthy": False}
            }
            
            if exchange_contract:
                try:
                    # Get order count as a simple view call to test contract
                    exchange_contract.functions.getActiveOrderCount().call()
                    result["exchange"] = {"healthy": True}
                except Exception as e:
                    result["exchange"] = {"healthy": False, "reason": str(e)}
            
            if stock_token_contract:
                try:
                    # Get token name as a simple view call to test contract
                    token_name = stock_token_contract.functions.name().call()
                    result["token"] = {"healthy": True, "name": token_name}
                except Exception as e:
                    result["token"] = {"healthy": False, "reason": str(e)}
            
            overall_health = all(component.get("healthy", False) for component in result.values())
            return {"healthy": overall_health, **result}
        except Exception as e:
            log_error("Error checking contract health", e)
            return {"healthy": False, "reason": str(e)}
    
    # Combine all health checks
    blockchain_health = check_blockchain_health()
    contracts_health = check_contracts_health()
    
    health = {
        "status": "healthy",
        "components": {
            "blockchain": blockchain_health,
            "contracts": contracts_health
        }
    }
    
    # If any component is unhealthy, mark the overall status as degraded
    if not all(component.get("healthy", False) for component in health["components"].values()):
        health["status"] = "degraded"
        return jsonify(health), 503
    
    return jsonify(health)

# --- Order Book ---
@app.route('/api/orders', methods=['GET', 'POST'])
def handle_orders():
    """Handles order submissions and retrievals"""
    if request.method == 'GET':
        """Returns active orders, combining blockchain data and mock database entries"""
        blockchain_orders = []
        mock_db_orders = []
        
        # Try to get orders from blockchain first
        if w3.is_connected() and exchange_contract:
            try:
                # Attempt to fetch active orders directly from blockchain
                blockchain_orders = fetch_all_active_orders()
                logger.info(f"Fetched {len(blockchain_orders)} active orders from blockchain")
            except Exception as e:
                log_error("Error fetching orders from blockchain", e, {
                    "request_id": getattr(request, 'id', None)
                })
        else:
            logger.warning("Web3 setup incomplete. Using mock database only.")
        
        # Always include mock database entries
        mock_db_orders = [order for order in mock_db["orders"].values() if order.get("active", False)]
        logger.info(f"Found {len(mock_db_orders)} active orders in mock database")
        
        # Combine orders from both sources, giving preference to blockchain for duplicates
        # Create a dictionary with order IDs as keys to handle potential duplicates
        all_orders = {order["id"]: order for order in blockchain_orders}
        # Update with mock database orders (won't overwrite blockchain orders with same ID)
        all_orders.update({order["id"]: order for order in mock_db_orders if order["id"] not in all_orders})
        
        # Convert back to a list
        combined_orders = list(all_orders.values())
        logger.info(f"Returning {len(combined_orders)} combined active orders")
        
        return jsonify({
            "status": "success",
            "data": combined_orders
        })
    elif request.method == 'POST':
        """Submits an order to the blockchain and caches in mock_db"""
        try:
            order_data = request.json
            if not order_data:
                return error_response(
                    ErrorType.VALIDATION_ERROR.value,
                    "Missing request body",
                    status_code=400
                )
                
            logger.info(f"Received order submission: {order_data}")

            user = order_data.get("user") or order_data.get("userAddress")
            token_address_str = order_data.get("token") or order_data.get("tokenAddress")
            amount_str = order_data.get("amount")
            price_str = order_data.get("price")
            is_buy_order_val = order_data.get("isBuyOrder")
            
            if is_buy_order_val is None:
                is_buy_order_val = order_data.get("isBuy") # Handle 'isBuy'

            # Validate required fields
            missing_fields = []
            if not user:
                missing_fields.append("user/userAddress")
            if not token_address_str:
                missing_fields.append("token/tokenAddress")
            if not amount_str:
                missing_fields.append("amount")
            if not price_str:
                missing_fields.append("price")
            if is_buy_order_val is None:
                missing_fields.append("isBuyOrder/isBuy")
                
            if missing_fields:
                return error_response(
                    ErrorType.VALIDATION_ERROR.value,
                    "Missing required fields in order data",
                    status_code=400,
                    details={"missing_fields": missing_fields}
                )

            # Validate field formats
            try:
                # Validate Ethereum address
                is_valid, error_msg = validate_ethereum_address(user)
                if not is_valid:
                    return error_response(
                        ErrorType.VALIDATION_ERROR.value,
                        f"Invalid user address: {error_msg}",
                        status_code=400
                    )
                    
                # Convert to checksum address
                token_address = Web3.to_checksum_address(token_address_str)
                
                # Validate amount
                is_valid, error_msg = validate_amount(amount_str)
                if not is_valid:
                    return error_response(
                        ErrorType.VALIDATION_ERROR.value,
                        f"Invalid amount: {error_msg}",
                        status_code=400
                    )
                amount = int(float(amount_str))
                
                # Validate price
                is_valid, error_msg = validate_amount(price_str)
                if not is_valid:
                    return error_response(
                        ErrorType.VALIDATION_ERROR.value,
                        f"Invalid price: {error_msg}",
                        status_code=400
                    )
                
                # Determine price: if price_str is integer (wei), use directly, else treat as ETH
                try:
                    price_in_wei = int(price_str)
                    price_in_eth = price_in_wei / 1e18
                except Exception:
                    price_in_eth = float(price_str)
                    price_in_wei = w3.to_wei(price_in_eth, 'ether')
                    
                is_buy_order = bool(is_buy_order_val)
            except ValueError as e:
                log_error("Invalid order data format", e, {"order_data": order_data})
                return error_response(
                    ErrorType.VALIDATION_ERROR.value,
                    f"Invalid order data format: {str(e)}",
                    status_code=400
                )

            # Validate blockchain connection
            if not w3 or not w3.is_connected() or not exchange_contract:
                log_error("Web3 not connected or contract not initialized", 
                         context={"connected": bool(w3 and w3.is_connected()), "contract_initialized": bool(exchange_contract)})
                return error_response(
                    ErrorType.SERVICE_UNAVAILABLE.value,
                    "Backend not ready to interact with blockchain",
                    status_code=503
                )

            # Validate admin key
            if not ADMIN_PRIVATE_KEY: # Using admin to sign for now
                log_error("Admin private key not available for signing transaction")
                return error_response(
                    ErrorType.INTERNAL_ERROR.value,
                    "Admin private key not configured",
                    status_code=500
                )

            # Place order on blockchain
            try:
                admin_account = w3.eth.account.from_key(ADMIN_PRIVATE_KEY)
                
                logger.info(f"Placing order on chain: Token={token_address}, Amount={amount}, PriceWei={price_in_wei}, IsBuy={is_buy_order}, FromAccount={admin_account.address}")

                nonce = w3.eth.get_transaction_count(admin_account.address)
                
                tx_data = exchange_contract.functions.placeOrder(
                    token_address,
                    amount,
                    price_in_wei,
                    is_buy_order
                ).build_transaction({
                    'from': admin_account.address,
                    'nonce': nonce,
                    'gas': 1000000, 
                    'gasPrice': w3.eth.gas_price
                })

                signed_tx = w3.eth.account.sign_transaction(tx_data, ADMIN_PRIVATE_KEY)
                # Send raw transaction using correct attribute
                raw_tx = getattr(signed_tx, 'rawTransaction', None) or getattr(signed_tx, 'raw_transaction', None)
                if not raw_tx:
                    raise AttributeError(f"Cannot find raw transaction data attribute. Available attrs: {dir(signed_tx)}")
                tx_hash = w3.eth.send_raw_transaction(raw_tx)
                receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

                if receipt.status != 1:
                    log_error("On-chain order placement failed", context={
                        "tx_hash": tx_hash.hex(),
                        "receipt_status": receipt.status
                    })
                    return error_response(
                        ErrorType.BLOCKCHAIN_ERROR.value,
                        "Order placement transaction failed on-chain",
                        status_code=500,
                        details={"tx_hash": tx_hash.hex()}
                    )

                order_id_on_chain = None
                try:
                    logs = exchange_contract.events.OrderPlaced().process_receipt(receipt)
                    if logs and logs[0] and 'args' in logs[0] and 'orderId' in logs[0]['args']:
                        order_id_on_chain = logs[0]['args']['orderId']
                        logger.info(f"Order placed on-chain successfully. TxHash: {tx_hash.hex()}, OrderID: {order_id_on_chain}")
                    else:
                        logger.warning(f"Could not extract orderId from OrderPlaced event. Logs: {logs}")
                        order_id_on_chain = mock_db["next_order_id"] # Fallback, not ideal
                except Exception as e:
                    log_error("Error processing OrderPlaced event", e)
                    order_id_on_chain = mock_db["next_order_id"] # Fallback

                order_id_for_mock = order_id_on_chain
                if order_id_on_chain is None: # Should not happen if event processed correctly
                     order_id_for_mock = mock_db["next_order_id"]
                     mock_db["next_order_id"] +=1
                elif order_id_on_chain >= mock_db["next_order_id"]:
                     mock_db["next_order_id"] = order_id_on_chain + 1


                new_order_mock = {
                    "id": order_id_for_mock,
                    "user": user, 
                    "token": token_address_str,
                    "amount": amount, 
                    "price": price_in_eth, # Store price in ETH in mock_db
                    "isBuyOrder": is_buy_order,
                    "active": True,
                    "txHash_placeOrder": tx_hash.hex()
                }
                mock_db["orders"][order_id_for_mock] = new_order_mock
                
                logger.info(f"Order {order_id_for_mock} (on-chain ID: {order_id_on_chain}) also cached in mock_db.")

                return jsonify({
                    "status": "success", 
                    "data": {
                        "message": "Order placed on-chain and cached",
                        "order": new_order_mock,
                        "txHash": tx_hash.hex(),
                        "orderId_on_chain": order_id_on_chain
                    }
                }), 201

            except ContractLogicError as e:
                log_error("Contract logic error placing order", e, {
                    "user": user, 
                    "token": token_address_str,
                    "amount": amount,
                    "price": price_in_eth,
                    "is_buy_order": is_buy_order
                })
                
                error_message = str(e)
                if e.args and isinstance(e.args[0], dict) and 'message' in e.args[0]:
                    error_message = e.args[0]['message']
                elif hasattr(e, 'message'):
                    error_message = e.message
                    
                return error_response(
                    ErrorType.CONTRACT_LOGIC_ERROR.value,
                    "Order placement failed due to contract logic",
                    status_code=500,
                    details={"error_message": error_message}
                )
            except Exception as e:
                # On-chain order placement failed, fallback to mock database only
                log_error("Chain error placing order, falling back to mock only", e, {
                    "user": user, 
                    "token": token_address_str,
                    "amount": amount,
                    "price": price_in_eth,
                    "is_buy_order": is_buy_order
                })
                # Generate mock order ID
                order_id_for_mock = mock_db["next_order_id"]
                mock_db["next_order_id"] += 1
                # Create mock order entry
                new_order_mock = {
                    "id": order_id_for_mock,
                    "user": user,
                    "token": token_address_str,
                    "amount": amount,
                    "price": price_in_eth,
                    "isBuyOrder": is_buy_order,
                    "active": True,
                    "txHash_placeOrder": None
                }
                mock_db["orders"][order_id_for_mock] = new_order_mock
                return jsonify({
                    "status": "success",
                    "data": {
                        "message": "Order cached in mock database only",
                        "order": new_order_mock,
                        "txHash": None,
                        "orderId_on_chain": None
                    }
                }), 201
        except Exception as e:
            log_error("Unexpected error processing order", e)
            return error_response(
                ErrorType.INTERNAL_ERROR.value,
                "An unexpected error occurred while processing the order",
                status_code=500
            )

@app.route('/api/orders/<int:order_id>', methods=['GET'])
def get_order(order_id):
    """Get a specific order by ID, trying blockchain first"""
    try:
        # Try to get order from blockchain first
        if w3.is_connected() and exchange_contract:
            try:
                order = get_order_from_blockchain(order_id)
                if order:
                    return jsonify({"status": "success", "data": order})
            except Exception as e:
                log_error(f"Error fetching order {order_id} from blockchain", e)
                # Log and continue to mock database
        else:
            logger.info("Web3 setup incomplete. Using mock database.")
        
        # Fallback to mock database
        order = mock_db["orders"].get(order_id)
        if order:
            return jsonify({"status": "success", "data": order})
        else:
            return error_response(
                ErrorType.RESOURCE_NOT_FOUND.value,
                f"Order with ID {order_id} not found",
                status_code=404
            )
    except Exception as e:
        log_error(f"Unexpected error getting order {order_id}", e)
        return error_response(
            ErrorType.INTERNAL_ERROR.value,
            "An unexpected error occurred",
            status_code=500
        )

@app.route('/trigger-matching', methods=['POST'])
def trigger_matching():
    """
    Endpoint to trigger the off-chain order matching process.
    Calls the smart contract triggerCartesiComputation function.
    """
    # Check preconditions
    if not w3 or not w3.is_connected() or not exchange_contract:
        # Mock implementation for testing
        log_error("Blockchain connection unavailable for matching", context={"w3_connected": bool(w3 and w3.is_connected())})
        return error_response(
            ErrorType.SERVICE_UNAVAILABLE.value,
            "Blockchain connection unavailable, using mock implementation",
            status_code=503,
            details={
                "mock": True,
                "txHash": "0x" + "0" * 64,
                "blockNumber": 0,
                "cartesiIndex": 0
            }
        )
    
    if not ADMIN_PRIVATE_KEY:
        log_error("Admin private key not available for signing transaction")
        return error_response(
            ErrorType.AUTHENTICATION_ERROR.value,
            "Admin private key not configured",
            status_code=500
        )
        
    try:
        # Fetch all active orders
        all_orders_list = fetch_all_active_orders()
        logger.info(f"Fetched {len(all_orders_list)} active orders")
        
        # Separate into buy and sell orders and format for JSON
        buy_orders_json = []
        sell_orders_json = []
        for order_dict in all_orders_list:
            if order_dict.get("active"):
                order_data_for_json = {
                    "id": order_dict["id"],
                    "user": order_dict["user"],
                    "token": order_dict["token"],
                    "amount": order_dict["amount"],
                    "price": order_dict["price"],
                    "timestamp": order_dict.get("timestamp", 0),
                }
                if order_dict["isBuyOrder"]:
                    buy_orders_json.append(order_data_for_json)
                else:
                    sell_orders_json.append(order_data_for_json)

        cartesi_input_data = {
            "buy_orders": buy_orders_json,
            "sell_orders": sell_orders_json
        }
        cartesi_input_json_string = json.dumps(cartesi_input_data)
        cartesi_input_bytes = cartesi_input_json_string.encode('utf-8')

        logger.info(f"Prepared Cartesi input (first 200 chars): {cartesi_input_json_string[:200]}")

        admin_account = w3.eth.account.from_key(ADMIN_PRIVATE_KEY)
        nonce = w3.eth.get_transaction_count(admin_account.address)

        # Check available functions in contract
        contract_functions = [fn for fn in dir(exchange_contract.functions) if not fn.startswith('_')]
        logger.info(f"Available contract functions: {contract_functions}")
        
        # Let's determine which function to call based on what's available
        if hasattr(exchange_contract.functions, 'triggerCartesiComputation'):
            logger.info("Using triggerCartesiComputation function")
            try:
                tx_data = exchange_contract.functions.triggerCartesiComputation(cartesi_input_bytes).build_transaction({
                    'from': admin_account.address,
                    'nonce': nonce,
                    'gas': 3000000, 
                    'gasPrice': w3.eth.gas_price
                })
            except Exception as e:
                logger.error(f"Error building transaction: {e}", exc_info=True)
                return jsonify({
                    "status": "error", 
                    "message": f"Failed to build transaction: {str(e)}"
                }), 500
        elif hasattr(exchange_contract.functions, 'triggerOrderMatching'):
            logger.info("Using triggerOrderMatching function")
            # Based on contract, this function takes max_orders and token_addresses
            max_orders = MAX_ORDERS_PER_BATCH  # Use the defined constant
            token_addresses = []  # Empty list for the second parameter
            try:
                tx_data = exchange_contract.functions.triggerOrderMatching(max_orders, token_addresses).build_transaction({
                    'from': admin_account.address,
                    'nonce': nonce,
                    'gas': 3000000, 
                    'gasPrice': w3.eth.gas_price
                })
            except Exception as e:
                logger.error(f"Error building transaction: {e}", exc_info=True)
                return jsonify({
                    "status": "error", 
                    "message": f"Failed to build transaction: {str(e)}"
                }), 500
        else:
            logger.error("Neither triggerCartesiComputation nor triggerOrderMatching functions found in contract ABI")
            return jsonify({
                "status": "error",
                "message": "Required function not found in contract ABI"
            }), 500
        
        try:
            # Custom function to sign and send a transaction
            def sign_and_send_transaction(web3_instance, transaction, private_key):
                try:
                    # Ensure private key has 0x prefix
                    if not private_key.startswith('0x'):
                        private_key = '0x' + private_key
                        
                    # Get account info
                    account = web3_instance.eth.account.from_key(private_key)
                    logger.info(f"Transaction from: {account.address}")
                    
                    # Manually sign the transaction
                    try:
                        # Use a different approach with eth_account directly
                        try:
                            from eth_account import Account
                            # Sign the transaction
                            signed = Account.sign_transaction(transaction, private_key)
                            logger.info("Transaction signed successfully with Account.sign_transaction")
                        except ImportError:
                            logger.error("Failed to import eth_account. Please install the package.")
                            logger.info("Attempting to use web3.eth.account directly...")
                            # Fall back to web3.eth.account
                            signed = web3_instance.eth.account.sign_transaction(transaction, private_key)
                        
                        # Use raw_transaction instead of rawTransaction (different attribute name in newer versions)
                        if hasattr(signed, 'raw_transaction'):
                            logger.info("Using raw_transaction attribute")
                            tx_hash = web3_instance.eth.send_raw_transaction(signed.raw_transaction)
                        elif hasattr(signed, 'rawTransaction'):
                            logger.info("Using rawTransaction attribute")
                            tx_hash = web3_instance.eth.send_raw_transaction(signed.rawTransaction)
                        else:
                            # Try to inspect the signed transaction object
                            logger.error(f"Neither raw_transaction nor rawTransaction found. Available attributes: {dir(signed)}")
                            raise AttributeError("Cannot find raw transaction data attribute")
                        
                        logger.info(f"Transaction sent with hash: {tx_hash.hex()}")
                        return tx_hash
                    except Exception as e:
                        logger.error(f"Error in eth_account direct signing: {e}", exc_info=True)
                        raise
                    
                except Exception as e:
                    logger.error(f"Error in sign_and_send_transaction: {e}", exc_info=True)
                    raise
                    
            # Use our custom function
            tx_hash = sign_and_send_transaction(w3, tx_data, ADMIN_PRIVATE_KEY)
            logger.info(f"Sent triggerCartesiComputation transaction: {tx_hash.hex()}")
            
            # Wait for transaction receipt (with timeout)
            try:
                receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
                logger.info(f"Transaction receipt received: {receipt}")
                
                if receipt.status == 1:
                    logger.info(f"Transaction succeeded, block number: {receipt.blockNumber}")
                    
                    # Extract cartesiIndex from events if possible
                    cartesi_index = 0
                    try:
                        # For triggerCartesiComputation, the event is ComputationRequested(uint256,bytes)
                        logs = exchange_contract.events.ComputationRequested().process_receipt(receipt)
                        if logs and logs[0]:
                            # The function returns the index which should be included in the event
                            cartesi_index = logs[0].args.cartesiIndex
                            logger.info(f"Extracted cartesiIndex: {cartesi_index}")
                    except Exception as e:
                        logger.warning(f"Could not extract cartesiIndex from events: {e}")
                        # Just use a dummy value if we can't extract it
                        cartesi_index = 1  # Use 1 as a default value
                    
                    return jsonify({
                        "status": "success",
                        "message": "Order matching triggered successfully",
                        "txHash": tx_hash.hex(),
                        "blockNumber": receipt.blockNumber,
                        "cartesiIndex": cartesi_index
                    })
                else:
                    logger.error(f"Transaction failed, status: {receipt.status}")
                    return jsonify({
                        "status": "error",
                        "message": "Transaction failed on-chain",
                        "txHash": tx_hash.hex(),
                        "status": receipt.status
                    }), 500
            except Exception as e:
                logger.error(f"Error getting transaction receipt: {e}")
                return jsonify({
                    "status": "error",
                    "message": f"Transaction sent but receipt not available: {str(e)}",
                    "txHash": tx_hash.hex()
                }), 500
                
        except Exception as e:
            logger.error(f"Error sending transaction: {e}")
            return jsonify({
                "status": "error",
                "message": f"Failed to send transaction: {str(e)}"
            }), 500
            
    except Exception as e:
        logger.error(f"Unexpected error in trigger_matching: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": f"An unexpected error occurred: {str(e)}"
        }), 500

@app.route('/api/balance/<user_address>', methods=['GET'])
def get_balance(user_address):
    """Get the balance for a user"""
    # For testing, prioritize using mock data
    if "balances" in mock_db and user_address in mock_db["balances"]:
        user_balances = mock_db["balances"][user_address]
        token_balances = user_balances.get("tokens", {})
        token_balance = token_balances.get(stock_token_address, 0) if stock_token_address else 0
        
        return jsonify({
            "eth": user_balances.get("eth", 0),
            "token": token_balance,
            "exchange_eth": user_balances.get("eth", 0),  # For mock, assume exchange balance = wallet balance
            "exchange_token": token_balance
        })
    
    # If no mock data, try to get from blockchain
    elif w3 and w3.is_connected() and exchange_contract and stock_token_contract:
        try:
            # Ensure address is checksummed
            checksummed_address = Web3.to_checksum_address(user_address)
            
            eth_balance = w3.eth.get_balance(checksummed_address)
            token_balance = 0
            
            if stock_token_address:
                token_balance = stock_token_contract.functions.balanceOf(checksummed_address).call()
            
            # Also get exchange balances (deposits)
            exchange_eth = 0
            exchange_token = 0
            
            try:
                # Check available functions for debugging
                contract_functions = dir(exchange_contract.functions)
                logger.debug(f"Available contract functions: {contract_functions}")
                
                # Try getUserEthBalance first (correct function name)
                if hasattr(exchange_contract.functions, 'getUserEthBalance'):
                    exchange_eth = exchange_contract.functions.getUserEthBalance(checksummed_address).call()
                    logger.debug(f"Retrieved ETH balance with getUserEthBalance: {exchange_eth}")
                # Fallback to getEthBalance if needed
                elif hasattr(exchange_contract.functions, 'getEthBalance'):
                    exchange_eth = exchange_contract.functions.getEthBalance(checksummed_address).call()
                    logger.debug(f"Retrieved ETH balance with getEthBalance: {exchange_eth}")
                else:
                    logger.warning("No ETH balance retrieval function found on contract")
                
                if stock_token_address:
                    # Try getUserTokenBalance first (correct function name)
                    if hasattr(exchange_contract.functions, 'getUserTokenBalance'):
                        exchange_token = exchange_contract.functions.getUserTokenBalance(
                            checksummed_address, 
                            stock_token_address
                        ).call()
                        logger.debug(f"Retrieved token balance with getUserTokenBalance: {exchange_token}")
                    # Fallback to getTokenBalance if needed
                    elif hasattr(exchange_contract.functions, 'getTokenBalance'):
                        exchange_token = exchange_contract.functions.getTokenBalance(
                            checksummed_address, 
                            stock_token_address
                        ).call()
                        logger.debug(f"Retrieved token balance with getTokenBalance: {exchange_token}")
                    else:
                        logger.warning("No token balance retrieval function found on contract")
            except Exception as e:
                logger.error(f"Error getting exchange balances: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
            
            return jsonify({
                "eth": eth_balance,
                "token": token_balance,
                "exchange_eth": exchange_eth,
                "exchange_token": exchange_token
            })
        except Exception as e:
            logger.error(f"Error getting blockchain balances: {e}")
            # Fall back to mock data
    
    # Initialize empty balances for new user if neither mock nor blockchain data is available
    if "balances" not in mock_db:
        mock_db["balances"] = {}
    
    # Create initial balance entry for this user
    mock_db["balances"][user_address] = {"eth": 0, "tokens": {}}
    
    return jsonify({
        "eth": 0,
        "token": 0,
        "exchange_eth": 0,
        "exchange_token": 0
    })


@app.route('/api/orders/<int:order_id>/cancel', methods=['POST'])
def cancel_order_endpoint(order_id):
    """Cancel an active order by ID"""
    if request.method == 'POST':
        # For now, just mark the order as inactive in the mock DB
        order = mock_db["orders"].get(order_id)
        if order and order.get("active"):
            order["active"] = False
            return jsonify({"status": "success", "message": f"Order {order_id} has been canceled"}), 200
        else:
            return jsonify({"status": "error", "message": "Order not found or already inactive"}), 404


@app.route('/api/deposit', methods=['POST'])
def deposit_endpoint_primary():
    """Deposit ETH or tokens to the user's account"""
    data = request.json
    
    # Handle both field name formats (from test script and from frontend)
    user_address = data.get("user") or data.get("userAddress")
    amount = data.get("amount")
    is_eth = data.get("isEth", True)  # Default to ETH
    token = "ETH" if is_eth else data.get("token") or data.get("tokenAddress")
    
    # Convert addresses to checksum format if needed
    if user_address and token != "ETH" and not is_eth:
        try:
            user_address = Web3.to_checksum_address(user_address)
            if token:
                token = Web3.to_checksum_address(token)
        except Exception as e:
            logger.warning(f"Could not convert addresses to checksum format: {e}")
    
    # For now, just simulate a deposit by adjusting mock DB values
    if token == "ETH" or is_eth:
        # Deposit ETH (increased balance)
        try:
            # Initialize balances if they don't exist
            if "balances" not in mock_db:
                mock_db["balances"] = {}
            if user_address not in mock_db["balances"]:
                mock_db["balances"][user_address] = {"eth": 0, "tokens": {}}
            
            # Update balance
            mock_db["balances"][user_address]["eth"] += amount

            return jsonify({"status": "success", "message": f"Deposited {amount} ETH to {user_address}"}), 200
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to deposit ETH: {str(e)}"}), 500
    else:
        # For token deposits, use the token_address
        try:
            # Initialize balances if they don't exist
            if "balances" not in mock_db:
                mock_db["balances"] = {}
            if user_address not in mock_db["balances"]:
                mock_db["balances"][user_address] = {"eth": 0, "tokens": {}}
            
            # Initialize token balance if it doesn't exist
            if "tokens" not in mock_db["balances"][user_address]:
                mock_db["balances"][user_address]["tokens"] = {}
            
            if token not in mock_db["balances"][user_address]["tokens"]:
                mock_db["balances"][user_address]["tokens"][token] = 0
            
            # Update token balance
            mock_db["balances"][user_address]["tokens"][token] += amount
            
            return jsonify({"status": "success", "message": f"Deposited {amount} tokens to {user_address}"}), 200
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to deposit tokens: {str(e)}"}), 500


@app.route('/api/withdraw', methods=['POST'])
def withdraw_endpoint():
    """Withdraw ETH or tokens from the user's account"""
    data = request.json
    
    # Handle both field name formats (from test script and from frontend)
    user_address = data.get("user") or data.get("userAddress")
    amount = data.get("amount")
    is_eth = data.get("isEth", True)  # Default to ETH
    token = "ETH" if is_eth else data.get("token") or data.get("tokenAddress")
    
    # Convert addresses to checksum format if needed
    if user_address and token != "ETH" and not is_eth:
        try:
            user_address = Web3.to_checksum_address(user_address)
            if token:
                token = Web3.to_checksum_address(token)
        except Exception as e:
            logger.warning(f"Could not convert addresses to checksum format: {e}")
    
    # For now, just simulate a withdrawal by adjusting mock DB values
    if token == "ETH" or is_eth:
        # Withdraw ETH (decreased balance)
        try:
            # Initialize balances if they don't exist
            if "balances" not in mock_db:
                mock_db["balances"] = {}
            if user_address not in mock_db["balances"]:
                mock_db["balances"][user_address] = {"eth": 0, "tokens": {}}
            
            # Check if user has enough balance
            current_balance = mock_db["balances"][user_address]["eth"]
            if current_balance >= amount:
                # Update balance
                mock_db["balances"][user_address]["eth"] -= amount
                return jsonify({"status": "success", "message": f"Withdrew {amount} ETH from {user_address}"}), 200
            else:
                return jsonify({"status": "error", "message": "Insufficient balance"}), 400
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to withdraw ETH: {str(e)}"}), 500
    else:
        # For token withdrawals
        try:
            # Initialize balances if they don't exist
            if "balances" not in mock_db:
                mock_db["balances"] = {}
            if user_address not in mock_db["balances"]:
                mock_db["balances"][user_address] = {"eth": 0, "tokens": {}}
            
            # Initialize token balance if it doesn't exist
            if "tokens" not in mock_db["balances"][user_address]:
                mock_db["balances"][user_address]["tokens"] = {}
            
            if token not in mock_db["balances"][user_address]["tokens"]:
                mock_db["balances"][user_address]["tokens"][token] = 0
            
            # Check if user has enough balance
            current_balance = mock_db["balances"][user_address]["tokens"].get(token, 0)
            if current_balance >= amount:
                # Update token balance
                mock_db["balances"][user_address]["tokens"][token] -= amount
                return jsonify({"status": "success", "message": f"Withdrew {amount} tokens from {user_address}"}), 200
            else:
                return jsonify({"status": "error", "message": "Insufficient token balance"}), 400
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to withdraw tokens: {str(e)}"}), 500


# Import endpoints from server_endpoints module
# This ensures all required globals are defined first
try:
    from server_endpoints import endpoints_bp
    app.register_blueprint(endpoints_bp)
    logger.info("Successfully imported and registered endpoints from server_endpoints.py")
except Exception as e:
    logger.warning(f"Failed to import server_endpoints.py: {e}")

# Add a simple /health endpoint for Docker health check compatibility
@app.route('/health', methods=['GET'])
def simple_health_check():
    """Simple health check endpoint for Docker compatibility"""
    return jsonify({"status": "healthy", "message": "Backend is running"})

# --- Main Execution ---
if __name__ == "__main__":
    logger.info("Starting Flask backend server...")
    # Use 0.0.0.0 to be accessible externally (within Docker network)
    app.run(host="0.0.0.0", port=5001, debug=os.getenv("FLASK_DEBUG", "0") == "1")