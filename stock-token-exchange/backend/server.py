from flask import Flask, request, jsonify
import os
import json
from web3 import Web3  # Uncommented for blockchain interaction
from dotenv import load_dotenv  # For loading environment variables securely
import time  # For waiting for transaction confirmations
from pathlib import Path
import logging
import binascii
import stat
from flask_cors import CORS

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app) # Enable CORS for frontend interaction

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
                logger.info("Admin private key loaded from Docker secret")
                return key
        except Exception as e:
            logger.error(f"Error reading Docker secret: {e}")
    
    # Method 2: Try external key file
    key_file = os.getenv("ADMIN_KEY_FILE")
    if key_file and os.path.exists(key_file):
        # Check file permissions - should be restricted
        st = os.stat(key_file)
        if bool(st.st_mode & (stat.S_IRWXG | stat.S_IRWXO)):  # Group/other has any permission
            logger.warning("⚠️ Key file has too open permissions! Should be 400 (read-only for owner).")
        
        try:
            with open(key_file, 'r') as f:
                key = f.read().strip()
                logger.info("Admin private key loaded from key file")
                return key
        except Exception as e:
            logger.error(f"Error reading key file: {e}")
    
    # Method 3: Try environment variable (least secure, but convenient for development)
    key = os.getenv("ADMIN_PRIVATE_KEY")
    if key:
        logger.info("Admin private key loaded from environment variable")
        if os.getenv("FLASK_ENV") == "production":
            logger.warning("⚠️ Using private key from environment variable in production is not recommended!")
        return key
    
    logger.warning("No admin private key found through any method")
    return None

# Validate private key format
def validate_private_key(key):
    """Validate that a private key is in the correct format"""
    if not key:
        return False
    
    # Remove '0x' prefix if present
    if key.startswith('0x'):
        key = key[2:]
    
    # Check if it's a valid hex string of the right length (64 characters = 32 bytes)
    try:
        if len(key) != 64:
            logger.error(f"Private key has invalid length: {len(key)} chars, expected 64")
            return False
        
        # Check if it's a valid hex string
        int(key, 16)
        return True
    except ValueError:
        logger.error("Private key contains invalid characters (not hex)")
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
    logger.error("Admin private key could not be loaded. Exiting.")
    # In a real app, you might exit or disable functions requiring the key
    # For development, we might proceed with warnings

# --- Global Variables ---
w3 = None
exchange_contract = None
stock_token_contract = None
exchange_address = None
stock_token_address = None
exchange_abi = None
stock_token_abi = None
admin_private_key = None # This global is distinct from ADMIN_PRIVATE_KEY (uppercase)
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
    # Note: admin_private_key (lowercase) is listed as global, but ADMIN_PRIVATE_KEY (uppercase)
    # holds the securely loaded key at module level. We will use ADMIN_PRIVATE_KEY for status.

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
        print(f"Cannot fetch order {order_id} from blockchain: Web3 setup incomplete")
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
        print(f"Error fetching order {order_id} from blockchain: {str(e)}")
        return None

def get_user_token_balance(user_address, token_address):
    """
    Fetch token balance for a user directly from the blockchain.
    Returns 0 if balance cannot be fetched or if blockchain connection is unavailable.
    """
    if not w3.is_connected() or not exchange_contract:
        print(f"Cannot fetch token balance: Web3 setup incomplete")
        return 0
    
    try:
        # Ensure addresses are checksummed
        user = Web3.to_checksum_address(user_address)
        token = Web3.to_checksum_address(token_address)
        
        # Call the getUserTokenBalance function from Exchange.sol
        balance = exchange_contract.functions.getUserTokenBalance(user, token).call()
        return int(balance)
    except Exception as e:
        print(f"Error fetching token balance for {user_address}: {str(e)}")
        return 0

def get_user_eth_balance(user_address):
    """
    Fetch ETH balance for a user directly from the blockchain.
    Returns 0 if balance cannot be fetched or if blockchain connection is unavailable.
    """
    if not w3.is_connected() or not exchange_contract:
        print(f"Cannot fetch ETH balance: Web3 setup incomplete")
        return 0
    
    try:
        # Ensure address is checksummed
        user = Web3.to_checksum_address(user_address)
        
        # Call the getUserEthBalance function from Exchange.sol
        balance = exchange_contract.functions.getUserEthBalance(user).call()
        return int(balance)
    except Exception as e:
        print(f"Error fetching ETH balance for {user_address}: {str(e)}")
        return 0

def fetch_all_active_orders():
    """
    Fetch all active orders from the blockchain.
    Returns an empty list if orders cannot be fetched or if blockchain connection is unavailable.
    """
    if not w3.is_connected() or not exchange_contract:
        print("Cannot fetch orders: Web3 setup incomplete")
        return []
    
    try:
        # We need a way to know how many orders to check
        order_count = None
        
        # First try using a getCurrentOrderId function if it exists
        try:
            # Check if the getCurrentOrderId function exists in the ABI
            if any(func.get('name') == 'getCurrentOrderId' for func in exchange_contract.abi if func.get('type') == 'function'):
                order_count = exchange_contract.functions.getCurrentOrderId().call()
                print(f"Got order count {order_count} from getCurrentOrderId function")
            else:
                # Function doesn't exist in ABI, try using a different approach
                raise AttributeError("getCurrentOrderId function not found in contract ABI")
        except Exception as e:
            print(f"Couldn't get order count from getCurrentOrderId function: {str(e)}")
            # Try alternate methods
            if any(func.get('name') == 'orderCount' for func in exchange_contract.abi if func.get('type') == 'function'):
                # Try orderCount if it exists
                order_count = exchange_contract.functions.orderCount().call()
                print(f"Got order count {order_count} from orderCount function")
            elif any(func.get('name') == 'getOrderCount' for func in exchange_contract.abi if func.get('type') == 'function'):
                # Try getOrderCount if it exists
                order_count = exchange_contract.functions.getOrderCount().call()
                print(f"Got order count {order_count} from getOrderCount function")
            else:
                # Fallback to checking blocks for OrderPlaced events
                print("Falling back to estimating order count from events...")
                order_count = estimate_order_count_from_events()
                
        # If we still don't have an order count, use a default
        if order_count is None:
            print("Could not estimate order count. Using default max.")
            order_count = 1000  # Arbitrary limit
        
        print(f"Fetching up to {order_count} orders from blockchain")
        
        # Collect all active orders
        active_orders = []
        for order_id in range(1, order_count + 1):
            try:
                order = get_order_from_blockchain(order_id)
                if order and order["active"]:
                    active_orders.append(order)
            except Exception as e:
                print(f"Error processing order {order_id}: {str(e)}")
                continue
        
        return active_orders
    except Exception as e:
        print(f"Error fetching all orders: {str(e)}")
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
            print("OrderPlaced event not found in contract ABI. Cannot estimate order count from events.")
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
        print(f"Error estimating order count from events: {str(e)}")
        return None

def sync_mock_db_with_blockchain():
    """
    Synchronize the mock database with the current blockchain state.
    Useful for development and when switching between mock/real modes.
    """
    if not w3.is_connected() or not exchange_contract:
        print("Cannot sync with blockchain: Web3 setup incomplete")
        return False
    
    try:
        print("Syncing mock database with blockchain state...")
        
        # 1. Fetch all orders
        active_orders = fetch_all_active_orders()
        if active_orders:
            # Update mock_db with fetched orders
            mock_db["orders"] = {order["id"]: order for order in active_orders}
            
            # Update next_order_id based on highest id found
            highest_id = max(order["id"] for order in active_orders) if active_orders else 0
            mock_db["next_order_id"] = highest_id + 1
            
            print(f"Synced {len(active_orders)} active orders. Next order ID: {mock_db['next_order_id']}")
            return True
        else:
            print("No active orders found on blockchain")
            return False
    except Exception as e:
        print(f"Error syncing with blockchain: {str(e)}")
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
                print(f"Fetched {len(blockchain_orders)} active orders from blockchain")
            except Exception as e:
                print(f"Error fetching orders from blockchain: {str(e)}")
        else:
            print("Web3 setup incomplete. Using mock database only.")
        
        # Always include mock database entries
        mock_db_orders = [order for order in mock_db["orders"].values() if order.get("active", False)]
        print(f"Found {len(mock_db_orders)} active orders in mock database")
        
        # Combine orders from both sources, giving preference to blockchain for duplicates
        # Create a dictionary with order IDs as keys to handle potential duplicates
        all_orders = {order["id"]: order for order in blockchain_orders}
        # Update with mock database orders (won't overwrite blockchain orders with same ID)
        all_orders.update({order["id"]: order for order in mock_db_orders if order["id"] not in all_orders})
        
        # Convert back to a list
        combined_orders = list(all_orders.values())
        print(f"Returning {len(combined_orders)} combined active orders")
        
        return jsonify(combined_orders)
    elif request.method == 'POST':
        """ Mock endpoint to add an order to the backend's view """
        order_data = request.json
        print("Received mock order submission:", order_data)

        # Map test script field names to backend field names
        user = order_data.get("user") or order_data.get("userAddress")
        token = order_data.get("token") or order_data.get("tokenAddress")
        amount = order_data.get("amount")
        price = order_data.get("price")
        is_buy_order = order_data.get("isBuyOrder")
        
        # Handle isBuy field from test script
        if is_buy_order is None:
            is_buy_order = order_data.get("isBuy", False)

        # Basic Validation
        if not all(field is not None for field in (user, token, amount, price, is_buy_order)):
            return jsonify({"error": "Missing required order fields"}), 400

        # Assign ID and store (mocking contract behavior)
        order_id = mock_db["next_order_id"]
        mock_db["next_order_id"] += 1
        
        # Fix for amount/price parsing - handle both fields properly
        # For buy orders, amount should be an integer token amount, price is ETH per token
        try:
            # First try to get the amount correctly - should be an integer for token amount
            parsed_amount = int(float(amount)) if isinstance(amount, str) else int(amount)
            # Price should be a float (ETH per token)
            parsed_price = float(price) if isinstance(price, str) else float(price)
        except ValueError as e:
            return jsonify({"error": f"Invalid order parameters: {str(e)}"}), 400
            
        new_order = {
            "id": order_id,
            "user": user,
            "token": token,
            "amount": parsed_amount,
            "price": parsed_price,
            "isBuyOrder": bool(is_buy_order),
            "active": True # New orders are active
        }
        mock_db["orders"][order_id] = new_order

        # TODO: Optionally interact with the actual Exchange.sol contract here
        # if the backend has permissions (e.g., for gas relaying - complex setup)

        return jsonify({"status": "received (mock)", "order": new_order}), 201


@app.route('/api/orders/<int:order_id>', methods=['GET'])
def get_order(order_id):
    """Get a specific order by ID, trying blockchain first"""
    # Try to get order from blockchain first
    if w3.is_connected() and exchange_contract:
        try:
            order = get_order_from_blockchain(order_id)
            if order:
                return jsonify(order)
        except Exception as e:
            print(f"Error fetching order {order_id} from blockchain: {str(e)}")
            print("Falling back to mock database")
    else:
        print("Web3 setup incomplete. Using mock database.")
    
    # Fallback to mock database
    order = mock_db["orders"].get(order_id)
    if order:
        return jsonify(order)
    else:
        return jsonify({"error": "Order not found"}), 404

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
                print(f"Available contract functions: {contract_functions}")
                
                # Try getUserEthBalance first (correct function name)
                if hasattr(exchange_contract.functions, 'getUserEthBalance'):
                    exchange_eth = exchange_contract.functions.getUserEthBalance(checksummed_address).call()
                    print(f"Retrieved ETH balance with getUserEthBalance: {exchange_eth}")
                # Fallback to getEthBalance if needed
                elif hasattr(exchange_contract.functions, 'getEthBalance'):
                    exchange_eth = exchange_contract.functions.getEthBalance(checksummed_address).call()
                    print(f"Retrieved ETH balance with getEthBalance: {exchange_eth}")
                else:
                    print("No ETH balance retrieval function found on contract")
                
                if stock_token_address:
                    # Try getUserTokenBalance first (correct function name)
                    if hasattr(exchange_contract.functions, 'getUserTokenBalance'):
                        exchange_token = exchange_contract.functions.getUserTokenBalance(
                            checksummed_address, 
                            stock_token_address
                        ).call()
                        print(f"Retrieved token balance with getUserTokenBalance: {exchange_token}")
                    # Fallback to getTokenBalance if needed
                    elif hasattr(exchange_contract.functions, 'getTokenBalance'):
                        exchange_token = exchange_contract.functions.getTokenBalance(
                            checksummed_address, 
                            stock_token_address
                        ).call()
                        print(f"Retrieved token balance with getTokenBalance: {exchange_token}")
                    else:
                        print("No token balance retrieval function found on contract")
            except Exception as e:
                print(f"Error getting exchange balances: {str(e)}")
                import traceback
                traceback.print_exc()
            
            return jsonify({
                "eth": eth_balance,
                "token": token_balance,
                "exchange_eth": exchange_eth,
                "exchange_token": exchange_token
            })
        except Exception as e:
            print(f"Error getting blockchain balances: {str(e)}")
            # Fall back to mock data
    
    # Use mock data if not connected to blockchain or if error occurred
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
                exchange_eth = exchange_contract.functions.getEthBalance(checksummed_address).call()
                if stock_token_address:
                    exchange_token = exchange_contract.functions.getTokenBalance(checksummed_address, stock_token_address).call()
            except Exception as e:
                logger.error(f"Error getting exchange balances: {e}")
            
            return jsonify({
                "eth": eth_balance,
                "token": token_balance,
                "exchange_eth": exchange_eth,
                "exchange_token": exchange_token
            })
        except Exception as e:
            logger.error(f"Error getting blockchain balances: {e}")
    
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
def deposit_endpoint():
    """Deposit ETH or tokens to the user's account"""
    data = request.json
    
    # Handle both field name formats (from test script and from frontend)
    user_address = data.get("user") or data.get("userAddress")
    amount = data.get("amount")
    is_eth = data.get("isEth", True)  # Default to ETH
    token = "ETH" if is_eth else data.get("token") or data.get("tokenAddress")
    
    # Convert addresses to checksum format if needed
    if w3 and user_address and token != "ETH" and not is_eth:
        try:
            user_address = w3.to_checksum_address(user_address)
            if token:
                token = w3.to_checksum_address(token)
        except Exception as e:
            print(f"Warning: Could not convert addresses to checksum format: {e}")
    
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
    if w3 and user_address and token != "ETH" and not is_eth:
        try:
            user_address = w3.to_checksum_address(user_address)
            if token:
                token = w3.to_checksum_address(token)
        except Exception as e:
            print(f"Warning: Could not convert addresses to checksum format: {e}")
    
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


@app.route('/trigger-matching', methods=['POST'])
def trigger_matching():
    """
    Endpoint to trigger the off-chain order matching process.
    In a real implementation, this would call the smart contract triggerOrderMatching function.
    """
    if not w3 or not w3.is_connected() or not exchange_contract:
        # Mock implementation for testing
        logger.info("Using mock implementation for trigger-matching (no blockchain connection)")
        return jsonify({
            "status": "success",
            "message": "Order matching triggered (mock)",
            "txHash": "0x" + "0" * 64,
            "blockNumber": 0,
            "cartesiIndex": 0
        })
    
    try:
        # In a real implementation, this would use the private key to sign a transaction
        # For now, we'll just return a successful mock response
        logger.info("Triggering order matching (simulated)")
        return jsonify({
            "status": "success",
            "message": "Order matching triggered",
            "txHash": "0x" + "1" * 64,
            "blockNumber": w3.eth.block_number,
            "cartesiIndex": 0
        })
    except Exception as e:
        logger.error(f"Error triggering order matching: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/process-results/<int:index>', methods=['POST'])
def process_results(index):
    """
    Endpoint to process the results of the off-chain computation.
    In a real implementation, this would call the smart contract processMatchResult function.
    """
    if not w3 or not w3.is_connected() or not exchange_contract:
        # Mock implementation for testing
        logger.info(f"Using mock implementation for process-results/{index} (no blockchain connection)")
        # Find buy and sell orders that match
        buy_orders = [o for o in mock_db["orders"].values() if o["isBuyOrder"] and o["active"]]
        sell_orders = [o for o in mock_db["orders"].values() if not o["isBuyOrder"] and o["active"]]
        
        trades_processed = 0
        for buy in buy_orders:
            for sell in sell_orders:
                if buy["token"] == sell["token"] and buy["price"] >= sell["price"] and buy["active"] and sell["active"]:
                    # Match found, execute mock trade
                    buy["active"] = False
                    sell["active"] = False
                    trades_processed += 1
        
        return jsonify({
            "status": "success",
            "message": f"Processed results for index {index} (mock)",
            "txHash": "0x" + "0" * 64,
            "blockNumber": 0,
            "tradesProcessed": trades_processed
        })
    
    try:
        # In a real implementation, this would use the private key to sign a transaction
        # For now, we'll just return a successful mock response
        logger.info(f"Processing results for index {index} (simulated)")
        return jsonify({
            "status": "success",
            "message": f"Processed results for index {index}",
            "txHash": "0x" + "2" * 64,
            "blockNumber": w3.eth.block_number,
            "tradesProcessed": 1
        })
    except Exception as e:
        logger.error(f"Error processing results: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --- Helper Functions ---

def wait_for_transaction_receipt(tx_hash):
    """
    Wait for a transaction to be mined and get the receipt.
    Raises an exception if the transaction fails or is not found.
    """
    try:
        # Wait for the transaction to be mined
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)  # 2 minutes timeout
        return tx_receipt
    except Exception as e:
        raise Exception(f"Error waiting for transaction receipt: {str(e)}")


# --- Main Execution ---
if __name__ == "__main__":
    # Use 0.0.0.0 to be accessible externally (within Docker network)
    app.run(host="0.0.0.0", port=5001, debug=os.getenv("FLASK_DEBUG", "0") == "1")