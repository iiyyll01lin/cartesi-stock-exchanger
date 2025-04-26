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

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

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
NODE_URL = os.getenv("NODE_URL", "http://localhost:8545")  # e.g., Hardhat node
MAX_ORDERS_PER_BATCH = int(os.getenv("MAX_ORDERS_PER_BATCH", "100"))  # Limit orders per batch

# Load admin private key securely
ADMIN_PRIVATE_KEY = load_admin_private_key()
if ADMIN_PRIVATE_KEY and not validate_private_key(ADMIN_PRIVATE_KEY):
    logger.error("Invalid admin private key format. Web3 admin functions will be disabled.")
    ADMIN_PRIVATE_KEY = None

# ABI search paths - will try each path until ABIs are found
# The paths are different depending on if we're running in Docker or locally
ABI_SEARCH_PATHS = [
    # Docker path (assuming contracts directory is mapped to /app/contracts)
    "/app/contracts/artifacts",
    # Local development paths
    "../contracts/artifacts",
    "./contracts/artifacts",
    # Hardhat default artifacts path
    "../artifacts",
    "./artifacts"
]

# Function to load contract ABIs from various possible locations
def load_contract_abis():
    global EXCHANGE_ABI, STOCK_TOKEN_ABI
    EXCHANGE_ABI = None
    STOCK_TOKEN_ABI = None
    
    # Exchange contract path within artifacts
    exchange_relative_path = "contracts/Exchange.sol/Exchange.json"
    # StockToken contract path within artifacts
    token_relative_path = "contracts/StockToken.sol/StockToken.json"
    
    # Try each base path until we find the ABIs
    for base_path in ABI_SEARCH_PATHS:
        base_dir = Path(base_path)
        exchange_path = base_dir / exchange_relative_path
        token_path = base_dir / token_relative_path
        
        # Try to load Exchange ABI
        if not EXCHANGE_ABI and exchange_path.exists():
            try:
                with open(exchange_path) as f:
                    contract_interface = json.load(f)
                    EXCHANGE_ABI = contract_interface['abi']
                print(f"Successfully loaded Exchange ABI from {exchange_path}")
            except (json.JSONDecodeError, KeyError) as e:
                print(f"Error parsing Exchange ABI from {exchange_path}: {e}")
        
        # Try to load StockToken ABI
        if not STOCK_TOKEN_ABI and token_path.exists():
            try:
                with open(token_path) as f:
                    contract_interface = json.load(f)
                    STOCK_TOKEN_ABI = contract_interface['abi']
                print(f"Successfully loaded StockToken ABI from {token_path}")
            except (json.JSONDecodeError, KeyError) as e:
                print(f"Error parsing StockToken ABI from {token_path}: {e}")
        
        # If we've found both ABIs, we can stop searching
        if EXCHANGE_ABI and STOCK_TOKEN_ABI:
            break
    
    # Check what we found and report any issues
    if not EXCHANGE_ABI:
        print("WARNING: Exchange ABI could not be loaded from any location.")
        print("Web3 interactions with Exchange contract will be disabled.")
    
    if not STOCK_TOKEN_ABI:
        print("WARNING: StockToken ABI could not be loaded from any location.")
        print("Web3 interactions with StockToken contract will be disabled.")
    
    return EXCHANGE_ABI is not None

# Load ABIs when the server starts
contract_abis_loaded = load_contract_abis()

# Placeholder data store (for development/testing)
mock_db = {
    "orders": {},  # Store orders by ID: { 1: {"id": 1, ...}, 2: {...} }
    "next_order_id": 1
}

# --- Web3 Setup ---
w3 = Web3(Web3.HTTPProvider(NODE_URL))
exchange_contract = None
admin_account = None

# Initialize Web3 connection and contract
def initialize_web3():
    global exchange_contract, admin_account
    
    if not w3.is_connected():
        print(f"Error: Cannot connect to Ethereum node at {NODE_URL}")
        return False
        
    if EXCHANGE_CONTRACT_ADDRESS == "YOUR_CONTRACT_ADDRESS" or not EXCHANGE_ABI:
        print("Warning: Contract configuration incomplete")
        return False
        
    try:
        # Check if the address is valid
        if not w3.is_address(EXCHANGE_CONTRACT_ADDRESS):
            print(f"Error: Invalid contract address {EXCHANGE_CONTRACT_ADDRESS}")
            return False
            
        # Set up contract instance
        exchange_contract = w3.eth.contract(
            address=Web3.to_checksum_address(EXCHANGE_CONTRACT_ADDRESS), 
            abi=EXCHANGE_ABI
        )
        
        # Set up admin account if private key is available
        if ADMIN_PRIVATE_KEY:
            admin_account = w3.eth.account.from_key(ADMIN_PRIVATE_KEY)
            print(f"Admin account set to: {admin_account.address}")
            return True
        else:
            print("Warning: Admin private key not provided. Contract methods requiring admin will be unavailable.")
            return False
    except Exception as e:
        print(f"Error initializing Web3: {e}")
        return False

# Initialize on startup
if w3.is_connected():
    print(f"Connected to Ethereum node at {NODE_URL}")
    web3_ready = initialize_web3()
    if web3_ready:
        print("Web3 initialized successfully")
    else:
        print("Web3 initialization failed or incomplete")
else:
    print(f"Warning: Cannot connect to Ethereum node at {NODE_URL}. Running in mock mode.")

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
        # This assumes Exchange contract has a function to get the current order count
        # If not available, we can modify the contract or use events/logs
        
        # Try using _orderIds counter from Exchange.sol
        try:
            # This assumes there's a view function to get the current order count
            # If not available in your contract, you'd need to add one or use a different approach
            order_count = exchange_contract.functions.getCurrentOrderId().call()
        except Exception as e:
            print(f"Error getting order count: {str(e)}")
            # Fallback to checking blocks for OrderPlaced events (slower but works without specific counter function)
            print("Falling back to estimating order count...")
            order_count = estimate_order_count_from_events()
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
        
        # Create filter for OrderPlaced events
        order_filter = exchange_contract.events.OrderPlaced.create_filter(
            fromBlock=start_block,
            toBlock='latest'
        )
        
        # Get all events
        events = order_filter.get_all_entries()
        
        # If we have events, find the highest order ID
        if events:
            highest_id = max(event['args']['orderId'] for event in events)
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

# --- Order Book ---
@app.route('/orders', methods=['GET'])
def get_orders():
    """Returns active orders, preferring blockchain data but falling back to mock DB if needed"""
    # Try to get orders from blockchain first
    if w3.is_connected() and exchange_contract:
        try:
            # Attempt to fetch active orders directly from blockchain
            active_orders = fetch_all_active_orders()
            print(f"Fetched {len(active_orders)} active orders from blockchain")
            return jsonify(active_orders)
        except Exception as e:
            print(f"Error fetching orders from blockchain: {str(e)}")
            print("Falling back to mock database")
    else:
        print("Web3 setup incomplete. Using mock database.")
    
    # Fallback to mock database
    active_orders = [order for order in mock_db["orders"].values() if order.get("active", False)]
    return jsonify(active_orders)

@app.route('/orders/<int:order_id>', methods=['GET'])
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

@app.route('/user/<address>/balances', methods=['GET'])
def get_user_balances(address):
    """Get a user's ETH and token balances from the contract"""
    try:
        # Validate the address
        if not w3.is_address(address):
            return jsonify({"error": "Invalid Ethereum address"}), 400
            
        # Default empty response
        balances = {
            "eth": 0,
            "tokens": {}
        }
        
        # Try to get balances from blockchain
        if w3.is_connected() and exchange_contract:
            try:
                # Get ETH balance
                eth_balance = get_user_eth_balance(address)
                balances["eth"] = eth_balance
                
                # If we know any token addresses, get those balances too
                # For now, let's use any tokens found in orders as a starting point
                token_addresses = set()
                
                # From blockchain orders
                active_orders = fetch_all_active_orders()
                for order in active_orders:
                    token_addresses.add(order["token"])
                
                # Alternatively, from mock DB orders
                for order in mock_db["orders"].values():
                    token_addresses.add(order["token"])
                
                # Get balance for each token
                for token in token_addresses:
                    token_balance = get_user_token_balance(address, token)
                    balances["tokens"][token] = token_balance
                
                return jsonify(balances)
            except Exception as e:
                print(f"Error fetching balances from blockchain: {str(e)}")
                return jsonify({"error": f"Failed to fetch balances: {str(e)}"}), 500
        else:
            return jsonify({"error": "Blockchain connection not available"}), 503
    except Exception as e:
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

# Note: Placing orders should ideally be done directly via user's wallet
# interacting with the frontend and contract. This endpoint is more for simulation
# or if the backend plays a role in relaying/managing orders (less decentralized).
@app.route('/orders', methods=['POST'])
def submit_order_mock():
    """ Mock endpoint to add an order to the backend's view """
    order_data = request.json
    print("Received mock order submission:", order_data)

    # Basic Validation
    if not all(k in order_data for k in ("user", "token", "amount", "price", "isBuyOrder")):
         return jsonify({"error": "Missing required order fields"}), 400

    # Assign ID and store (mocking contract behavior)
    order_id = mock_db["next_order_id"]
    mock_db["next_order_id"] += 1
    new_order = {
        "id": order_id,
        "user": order_data["user"],
        "token": order_data["token"],
        "amount": int(order_data["amount"]),
        "price": int(order_data["price"]),
        "isBuyOrder": bool(order_data["isBuyOrder"]),
        "active": True # New orders are active
    }
    mock_db["orders"][order_id] = new_order

    # TODO: Optionally interact with the actual Exchange.sol contract here
    # if the backend has permissions (e.g., for gas relaying - complex setup)

    return jsonify({"status": "received (mock)", "order": new_order}), 201


# --- Cartesi Interaction Simulation ---

@app.route('/trigger-matching', methods=['POST'])
def trigger_matching():
    """
    Triggers the Cartesi computation via the Exchange contract.
    Requires admin private key to be configured.
    """
    print("Received request to trigger order matching")
    
    # Check Web3 setup
    if not w3.is_connected() or not exchange_contract or not admin_account:
        print("Web3 setup incomplete. Running in mock mode.")
        return trigger_matching_mock()
    
    try:
        # Get request parameters
        request_data = request.json or {}
        max_orders = request_data.get('max_orders', MAX_ORDERS_PER_BATCH)
        
        # Define participants (just the admin in this case)
        parties = [admin_account.address]
        
        # Estimate gas for the transaction
        gas_estimate = exchange_contract.functions.triggerOrderMatching(
            max_orders,
            parties
        ).estimate_gas({'from': admin_account.address})
        
        # Add some buffer to the gas estimate
        gas_with_buffer = int(gas_estimate * 1.2)
        print(f"Estimated gas: {gas_estimate}, using {gas_with_buffer}")
        
        # Get the current gas price
        gas_price = w3.eth.gas_price
        # Optional: can add logic to adjust gas price based on network conditions
        
        # Get the current nonce for the admin account
        nonce = w3.eth.get_transaction_count(admin_account.address)
        
        # Build the transaction
        tx = exchange_contract.functions.triggerOrderMatching(
            max_orders,
            parties
        ).build_transaction({
            'from': admin_account.address,
            'gas': gas_with_buffer,
            'gasPrice': gas_price,
            'nonce': nonce,
            # Note: For EIP-1559 compatible chains, you might use maxFeePerGas and maxPriorityFeePerGas instead
        })
        
        # Sign the transaction with admin's private key
        signed_tx = w3.eth.account.sign_transaction(tx, private_key=ADMIN_PRIVATE_KEY)
        
        # Send the transaction
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        print(f"Sent triggerOrderMatching transaction: {tx_hash.hex()}")
        
        # Wait for transaction receipt (with timeout)
        print("Waiting for transaction confirmation...")
        try:
            tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            print(f"Transaction confirmed in block {tx_receipt.blockNumber}")
            
            # Get the Cartesi index from the event logs
            cartesi_index = None
            for log in tx_receipt.logs:
                try:
                    # Try to find and decode the ComputationRequested event
                    event = exchange_contract.events.ComputationRequested().process_log(log)
                    cartesi_index = event.args.cartesiIndex
                    print(f"Found Cartesi index from event: {cartesi_index}")
                    break
                except:
                    continue
            
            if cartesi_index is not None:
                return jsonify({
                    "status": "success", 
                    "txHash": tx_hash.hex(),
                    "blockNumber": tx_receipt.blockNumber,
                    "cartesiIndex": cartesi_index
                })
            else:
                return jsonify({
                    "status": "success", 
                    "txHash": tx_hash.hex(),
                    "blockNumber": tx_receipt.blockNumber,
                    "warning": "Could not extract Cartesi index from logs"
                })
        except TimeoutError:
            return jsonify({
                "status": "pending", 
                "txHash": tx_hash.hex(),
                "message": "Transaction sent but confirmation timed out. Check blockchain explorer for status."
            })
            
    except Exception as e:
        print(f"Error triggering order matching: {str(e)}")
        return jsonify({"error": f"Failed to trigger order matching: {str(e)}"}), 500


@app.route('/process-results/<int:cartesi_index>', methods=['POST'])
def process_results(cartesi_index):
    """
    Process the results of a Cartesi computation by calling processMatchResult.
    Requires admin private key to be configured.
    """
    print(f"Received request to process results for Cartesi index: {cartesi_index}")
    
    # Check Web3 setup
    if not w3.is_connected() or not exchange_contract or not admin_account:
        print("Web3 setup incomplete. Running in mock mode.")
        return process_results_mock(cartesi_index)
    
    try:
        # Check if the computation has a result
        # Note: This is optional and could be skipped if you're sure the result is ready
        try:
            # This is a read-only call to check if results are ready
            (has_result, finalized, _, _) = exchange_contract.functions.getResult(cartesi_index).call()
            
            if not has_result:
                return jsonify({
                    "status": "pending",
                    "message": "Computation has no result yet. Try again later."
                }), 400
                
            if not finalized:
                return jsonify({
                    "status": "pending",
                    "message": "Computation result not finalized yet. Try again later."
                }), 400
                
        except Exception as e:
            print(f"Error checking result status: {str(e)}")
            # Continue anyway, as the contract's processMatchResult will also check
        
        # Estimate gas for the transaction
        gas_estimate = exchange_contract.functions.processMatchResult(
            cartesi_index
        ).estimate_gas({'from': admin_account.address})
        
        # Add some buffer to the gas estimate
        gas_with_buffer = int(gas_estimate * 1.5)  # Higher buffer since this function does more computation
        print(f"Estimated gas: {gas_estimate}, using {gas_with_buffer}")
        
        # Get the current gas price
        gas_price = w3.eth.gas_price
        
        # Get the current nonce for the admin account
        nonce = w3.eth.get_transaction_count(admin_account.address)
        
        # Build the transaction
        tx = exchange_contract.functions.processMatchResult(
            cartesi_index
        ).build_transaction({
            'from': admin_account.address,
            'gas': gas_with_buffer,
            'gasPrice': gas_price,
            'nonce': nonce,
        })
        
        # Sign the transaction with admin's private key
        signed_tx = w3.eth.account.sign_transaction(tx, private_key=ADMIN_PRIVATE_KEY)
        
        # Send the transaction
        tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        print(f"Sent processMatchResult transaction: {tx_hash.hex()}")
        
        # Wait for transaction receipt (with timeout)
        print("Waiting for transaction confirmation...")
        try:
            tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)  # Longer timeout since more computation
            print(f"Transaction confirmed in block {tx_receipt.blockNumber}")
            
            # Count TradeExecuted events to report how many trades were processed
            trade_count = 0
            for log in tx_receipt.logs:
                try:
                    # Try to find and decode the TradeExecuted event
                    exchange_contract.events.TradeExecuted().process_log(log)
                    trade_count += 1
                except:
                    continue
            
            return jsonify({
                "status": "success", 
                "txHash": tx_hash.hex(),
                "blockNumber": tx_receipt.blockNumber,
                "tradesProcessed": trade_count
            })
        except TimeoutError:
            return jsonify({
                "status": "pending", 
                "txHash": tx_hash.hex(),
                "message": "Transaction sent but confirmation timed out. Check blockchain explorer for status."
            })
            
    except Exception as e:
        print(f"Error processing match results: {str(e)}")
        return jsonify({"error": f"Failed to process match results: {str(e)}"}), 500


# Function to fetch actual orders from blockchain (can be used to sync mock_db with reality)
def fetch_orders_from_blockchain(max_orders=1000):
    """
    Helper function to fetch orders from the blockchain.
    Returns a list of orders in the same format as our mock_db.
    """
    if not w3.is_connected() or not exchange_contract:
        print("Web3 setup incomplete. Cannot fetch orders from blockchain.")
        return []
    
    try:
        # Get the current order count
        order_count = exchange_contract.functions.getOrderCount().call()
        print(f"Total orders on blockchain: {order_count}")
        
        orders = []
        # Fetch orders in batches to avoid gas limits
        for i in range(1, min(order_count + 1, max_orders + 1)):
            try:
                # Call the getOrder function to get details
                order = exchange_contract.functions.getOrder(i).call()
                
                # Format the order to match our mock_db structure
                formatted_order = {
                    "id": order[0],  # Assuming the order struct has these fields in this order
                    "user": order[1],
                    "token": order[2],
                    "amount": order[3],
                    "price": order[4],
                    "isBuyOrder": order[5],
                    "active": order[6]
                }
                
                orders.append(formatted_order)
            except Exception as e:
                print(f"Error fetching order {i}: {str(e)}")
                continue
                
        return orders
    except Exception as e:
        print(f"Error fetching orders from blockchain: {str(e)}")
        return []


# Helper function for transaction monitoring
def check_transaction_status(tx_hash):
    """
    Check the status of a transaction.
    Returns the receipt if confirmed, or None if still pending.
    """
    try:
        tx_receipt = w3.eth.get_transaction_receipt(tx_hash)
        if tx_receipt is None:
            return None  # Still pending
        return tx_receipt
    except Exception as e:
        print(f"Error checking transaction status: {str(e)}")
        return None


@app.route('/trigger-matching', methods=['POST'])
def trigger_matching_mock():
    """
    Simulates the admin triggering the Cartesi computation.
    In a real setup, this would call Exchange.sol's triggerOrderMatching.
    """
    print("Received request to trigger matching.")

    # 1. Prepare Input Data for Cartesi Machine
    #    Fetch active orders from our mock_db (or contract state)
    active_buys = [o for o in mock_db["orders"].values() if o["active"] and o["isBuyOrder"]]
    active_sells = [o for o in mock_db["orders"].values() if o["active"] and not o["isBuyOrder"]]
    cartesi_input = {
        "buy_orders": active_buys,
        "sell_orders": active_sells
    }
    input_data_bytes = json.dumps(cartesi_input).encode('utf-8')

    print(f"Prepared input data for Cartesi: {cartesi_input}")

    # 2. Simulate calling the contract's triggerOrderMatching function
    # if exchange_contract and admin_account:
    #     try:
    #         # Construct the transaction
    #         # Note: Parties might just be the admin address
    #         parties = [admin_account.address]
    #         tx = exchange_contract.functions.triggerOrderMatching(
    #             input_data_bytes, # Or hash + offchain reference
    #             parties
    #         ).build_transaction({
    #             'from': admin_account.address,
    #             'nonce': w3.eth.get_transaction_count(admin_account.address),
    #             # Add gas/gasPrice if needed
    #         })
    #         signed_tx = w3.eth.account.sign_transaction(tx, private_key=ADMIN_PRIVATE_KEY)
    #         tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    #         print(f"Sent triggerOrderMatching transaction: {tx_hash.hex()}")
    #         # Need to wait for tx confirmation and get Cartesi index from event logs
    #         return jsonify({"status": "trigger transaction sent", "txHash": tx_hash.hex()})
    #     except Exception as e:
    #         print(f"Error sending transaction: {e}")
    #         return jsonify({"error": f"Failed to send transaction: {e}"}), 500
    # else:
    #     print("Skipping actual transaction (Web3 setup incomplete).")
    #     return jsonify({"status": "simulated trigger (no tx sent)"})

    print("Simulating Cartesi trigger (no actual contract call).")
    # In a full simulation, you might run the offchain_logic.py locally here
    # and then simulate calling processMatchResult.
    return jsonify({"status": "simulated trigger"})


@app.route('/process-results/<int:cartesi_index>', methods=['POST'])
def process_results_mock(cartesi_index):
    """
    Simulates the admin calling processMatchResult after computation finishes.
    """
    print(f"Received request to process results for Cartesi index: {cartesi_index}")

    # 1. Simulate calling the contract's processMatchResult function
    # if exchange_contract and admin_account:
    #     try:
    #         tx = exchange_contract.functions.processMatchResult(cartesi_index).build_transaction({...})
    #         signed_tx = w3.eth.account.sign_transaction(tx, private_key=ADMIN_PRIVATE_KEY)
    #         tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    #         print(f"Sent processMatchResult transaction: {tx_hash.hex()}")
    #         # Wait for confirmation
    #         return jsonify({"status": "process results transaction sent", "txHash": tx_hash.hex()})
    #     except Exception as e:
    #         print(f"Error sending transaction: {e}")
    #         return jsonify({"error": f"Failed to send transaction: {e}"}), 500
    # else:
    #      print("Skipping actual transaction (Web3 setup incomplete).")
    #      return jsonify({"status": "simulated result processing (no tx sent)"})

    print(f"Simulating processing results for index {cartesi_index} (no actual contract call).")
    # Here you could potentially update the mock_db based on simulated trade results
    # For now, just acknowledge.
    return jsonify({"status": "simulated result processing"})


if __name__ == '__main__':
    # Make sure the port is different from the frontend dev server (e.g., React default 3000)
    app.run(debug=True, port=5001)