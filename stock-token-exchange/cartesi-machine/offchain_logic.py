import sys
import os
import json
import logging
from datetime import datetime
from eth_abi import decode, encode

# Add the 'deps' directory to sys.path to allow importing vendored libraries
SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
DEPS_DIR = os.path.join(SCRIPT_DIR, "..", "deps")
if os.path.exists(DEPS_DIR):
    sys.path.insert(0, DEPS_DIR)
else:
    DEPS_DIR_ALT = os.path.join(SCRIPT_DIR, "deps")
    if os.path.exists(DEPS_DIR_ALT):
        sys.path.insert(0, DEPS_DIR_ALT)

# Configuration class to handle environment variables and runtime config
class ExchangeConfig:
    def __init__(self):
        # Load from environment variables (set during machine build)
        self.exchange_mode = os.getenv('EXCHANGE_MODE', 'mock')
        self.log_level = os.getenv('LOG_LEVEL', 'INFO')
        self.max_trades_per_batch = int(os.getenv('MAX_TRADES_PER_BATCH', '100'))
        self.min_trade_amount = int(os.getenv('MIN_TRADE_AMOUNT', '1'))
        self.maker_fee_bps = int(os.getenv('MAKER_FEE_BASIS_POINTS', '10'))
        self.taker_fee_bps = int(os.getenv('TAKER_FEE_BASIS_POINTS', '20'))
        
        # Setup logging
        self._setup_logging()
        
        # Load from config files if available
        self._load_config_files()
        
        # Runtime configuration (will be updated from input data)
        self.current_timestamp = 0
        self.runtime_fee_bps = self.taker_fee_bps  # Default to taker fee
        self.runtime_min_trade_amount = self.min_trade_amount
        
        self.logger.info(f"ExchangeConfig initialized: mode={self.exchange_mode}, log_level={self.log_level}")
        self.logger.info(f"Trade limits: max_batch={self.max_trades_per_batch}, min_amount={self.min_trade_amount}")
        self.logger.info(f"Fees: maker={self.maker_fee_bps}bps, taker={self.taker_fee_bps}bps")
    
    def _setup_logging(self):
        """Setup structured logging"""
        log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        logging.basicConfig(
            level=getattr(logging, self.log_level.upper()),
            format=log_format,
            handlers=[logging.StreamHandler(sys.stdout)]
        )
        self.logger = logging.getLogger('exchange')
    
    def _load_config_files(self):
        """Load configuration from multiple config file formats"""
        # Try JSON config first (preferred)
        json_config_file = os.path.join(SCRIPT_DIR, 'config.json')
        if os.path.exists(json_config_file):
            try:
                with open(json_config_file, 'r') as f:
                    config_data = json.load(f)
                    self._apply_json_config(config_data)
                    self.logger.info("Loaded configuration from config.json")
                    return
            except Exception as e:
                self.logger.warning(f"Failed to load config.json: {e}")
        
        # Fallback to legacy config.env
        env_config_file = os.path.join(SCRIPT_DIR, 'config.env')
        if os.path.exists(env_config_file):
            try:
                self._load_env_config(env_config_file)
                self.logger.info("Loaded configuration from config.env")
            except Exception as e:
                self.logger.warning(f"Failed to load config.env: {e}")
    
    def _apply_json_config(self, config_data):
        """Apply configuration from JSON format"""
        if 'exchange_mode' in config_data:
            self.exchange_mode = config_data['exchange_mode']
        if 'log_level' in config_data:
            self.log_level = config_data['log_level']
        if 'max_trades_per_batch' in config_data:
            self.max_trades_per_batch = int(config_data['max_trades_per_batch'])
        if 'min_trade_amount' in config_data:
            self.min_trade_amount = int(config_data['min_trade_amount'])
        
        # Handle fees configuration
        if 'fees' in config_data:
            fees = config_data['fees']
            if 'maker_fee_basis_points' in fees:
                self.maker_fee_bps = int(fees['maker_fee_basis_points'])
            if 'taker_fee_basis_points' in fees:
                self.taker_fee_bps = int(fees['taker_fee_basis_points'])
    
    def _load_env_config(self, config_file):
        """Load configuration from legacy config.env file"""
        with open(config_file, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    if key == 'MAX_TRADES_PER_BATCH':
                        self.max_trades_per_batch = int(value)
                    elif key == 'LOG_LEVEL':
                        self.log_level = value
                    elif key == 'EXCHANGE_MODE':
                        self.exchange_mode = value
                    elif key == 'MIN_TRADE_AMOUNT':
                        self.min_trade_amount = int(value)
                    elif key == 'MAKER_FEE_BASIS_POINTS':
                        self.maker_fee_bps = int(value)
                    elif key == 'TAKER_FEE_BASIS_POINTS':
                        self.taker_fee_bps = int(value)
    
    def update_runtime_config(self, runtime_data):
        """Update configuration from runtime input data"""
        if 'timestamp' in runtime_data:
            self.current_timestamp = runtime_data['timestamp']
            self.logger.debug(f"Updated timestamp to {self.current_timestamp}")
        if 'fee_bps' in runtime_data:
            self.runtime_fee_bps = runtime_data['fee_bps']
            self.logger.debug(f"Updated runtime fee to {self.runtime_fee_bps} bps")
        if 'min_trade_amount' in runtime_data:
            self.runtime_min_trade_amount = runtime_data['min_trade_amount']
            self.logger.debug(f"Updated runtime min trade amount to {self.runtime_min_trade_amount}")
    
    def get_effective_min_trade_amount(self):
        """Get the effective minimum trade amount (runtime overrides build-time)"""
        return self.runtime_min_trade_amount if self.runtime_min_trade_amount > 0 else self.min_trade_amount
    
    def get_effective_fee_bps(self):
        """Get the effective fee in basis points"""
        return self.runtime_fee_bps if self.runtime_fee_bps > 0 else self.taker_fee_bps
    
    def get_maker_fee_bps(self):
        """Get maker fee in basis points"""
        return self.maker_fee_bps
    
    def get_taker_fee_bps(self):
        """Get taker fee in basis points"""
        return self.taker_fee_bps
    
    def log(self, level, message):
        """Legacy logging method for backward compatibility"""
        getattr(self.logger, level.lower())(message)

# Global configuration instance
config = ExchangeConfig()

# ABI type definitions (enhanced to include configuration)
CARTESI_ORDER_INPUT_TYPE_STR = "(uint256,address,address,uint256,uint256,bool)"
INPUT_PAYLOAD_DECODE_TYPES = [
    f"{CARTESI_ORDER_INPUT_TYPE_STR}[]",  # buyOrders
    f"{CARTESI_ORDER_INPUT_TYPE_STR}[]",  # sellOrders
    "(uint256,uint256,uint256)"           # runtimeConfig: (timestamp, feeBps, minTradeAmount)
]

MATCHED_TRADE_OUTPUT_TYPE_STR = "(uint256,uint256,address,address,address,uint256,uint256,uint256)"  # Added fee field
MATCHED_TRADE_ARRAY_ENCODE_TYPES = [f"{MATCHED_TRADE_OUTPUT_TYPE_STR}[]"]

def hex_to_bytes(hex_string):
    """Convert hex string to bytes"""
    if hex_string.startswith("0x"):
        return bytes.fromhex(hex_string[2:])
    return bytes.fromhex(hex_string)

def calculate_trade_fee(trade_amount, fee_bps):
    """Calculate trading fee based on amount and basis points"""
    return (trade_amount * fee_bps) // 10000

def handle_order_request(payload_hex):
    """Enhanced order request handler with comprehensive configuration support"""
    try:
        payload_bytes = hex_to_bytes(payload_hex)
        config.logger.debug(f"Processing payload of {len(payload_bytes)} bytes")
        
        # Try to decode with runtime configuration first
        try:
            decoded_payload_tuple = decode(INPUT_PAYLOAD_DECODE_TYPES, payload_bytes)
            raw_buy_orders = decoded_payload_tuple[0]
            raw_sell_orders = decoded_payload_tuple[1]
            runtime_config_tuple = decoded_payload_tuple[2]
            
            # Update runtime configuration
            runtime_config = {
                'timestamp': runtime_config_tuple[0],
                'fee_bps': runtime_config_tuple[1],
                'min_trade_amount': runtime_config_tuple[2]
            }
            config.update_runtime_config(runtime_config)
            config.logger.info(f"Updated runtime config: timestamp={config.current_timestamp}, fee={config.get_effective_fee_bps()}bps, min_trade={config.get_effective_min_trade_amount()}")
            
        except Exception as decode_error:
            # Fallback to old format (without runtime config)
            config.logger.warning(f"Failed to decode with runtime config, trying legacy format: {decode_error}")
            legacy_decode_types = [f"{CARTESI_ORDER_INPUT_TYPE_STR}[]", f"{CARTESI_ORDER_INPUT_TYPE_STR}[]"]
            decoded_payload_tuple = decode(legacy_decode_types, payload_bytes)
            raw_buy_orders = decoded_payload_tuple[0]
            raw_sell_orders = decoded_payload_tuple[1]
            config.logger.info("Using legacy format without runtime configuration")

        # Group orders by token (enhanced logic)
        orders_by_token = {}
        effective_min_trade = config.get_effective_min_trade_amount()

        # Process buy orders
        for order_tuple in raw_buy_orders:
            order_dict = {
                "id": order_tuple[0], "user": order_tuple[1], "token": order_tuple[2],
                "amount": order_tuple[3], "price": order_tuple[4], "isBuyOrder": order_tuple[5],
                "filled": 0, "timestamp": config.current_timestamp
            }
            
            # Skip orders below minimum trade amount
            if order_dict["amount"] < effective_min_trade:
                config.logger.debug(f"Skipping buy order {order_dict['id']} - below minimum trade amount ({order_dict['amount']} < {effective_min_trade})")
                continue
                
            token_address = order_dict["token"]
            if token_address not in orders_by_token:
                orders_by_token[token_address] = []
            orders_by_token[token_address].append(order_dict)
        
        # Process sell orders
        for order_tuple in raw_sell_orders:
            order_dict = {
                "id": order_tuple[0], "user": order_tuple[1], "token": order_tuple[2],
                "amount": order_tuple[3], "price": order_tuple[4], "isBuyOrder": order_tuple[5],
                "filled": 0, "timestamp": config.current_timestamp
            }
            
            # Skip orders below minimum trade amount
            if order_dict["amount"] < effective_min_trade:
                config.logger.debug(f"Skipping sell order {order_dict['id']} - below minimum trade amount ({order_dict['amount']} < {effective_min_trade})")
                continue
                
            token_address = order_dict["token"]
            if token_address not in orders_by_token:
                orders_by_token[token_address] = []
            orders_by_token[token_address].append(order_dict)

        config.logger.info(f"Processing {len(orders_by_token)} token markets")

        all_matched_trades_tuples = []
        total_processed = 0
        
        for token_addr, token_orders in orders_by_token.items():
            if total_processed >= config.max_trades_per_batch:
                config.logger.warning(f"Reached max trades per batch ({config.max_trades_per_batch})")
                break
                
            config.logger.info(f"Matching {len(token_orders)} orders for token: {token_addr}")
            token_matched_trades = match_orders_for_token(token_orders)
            
            if token_matched_trades:
                # Limit trades per batch
                remaining_capacity = config.max_trades_per_batch - total_processed
                trades_to_add = token_matched_trades[:remaining_capacity]
                all_matched_trades_tuples.extend(trades_to_add)
                total_processed += len(trades_to_add)
        
        config.logger.info(f"Generated {len(all_matched_trades_tuples)} matched trades")
        encoded_trades = encode(MATCHED_TRADE_ARRAY_ENCODE_TYPES, [all_matched_trades_tuples])
        
        return {"type": "notice", "payload": "0x" + encoded_trades.hex()}

    except Exception as e:
        error_msg = f"Error processing order request: {e}"
        config.logger.error(error_msg)
        return {"type": "report", "payload": "0x" + error_msg.encode('utf-8').hex()}

def match_orders_for_token(orders_for_single_token_list_of_dicts):
    """Enhanced matching algorithm with maker/taker fee logic and configuration support"""
    buys = []
    sells = []
    
    for order in orders_for_single_token_list_of_dicts:
        if order["isBuyOrder"]:
            buys.append(order)
        else:
            sells.append(order)

    # Enhanced sorting: price priority, then time priority (order ID as proxy)
    buys.sort(key=lambda x: (-x["price"], x["id"]))  # High price first, then FIFO
    sells.sort(key=lambda x: (x["price"], x["id"]))   # Low price first, then FIFO

    matched_trades_output_tuples = []
    buy_idx = 0
    sell_idx = 0
    effective_min_trade = config.get_effective_min_trade_amount()

    config.logger.debug(f"Matching {len(buys)} buy orders against {len(sells)} sell orders")

    while buy_idx < len(buys) and sell_idx < len(sells):
        buy_order = buys[buy_idx]
        sell_order = sells[sell_idx]

        if buy_order["price"] >= sell_order["price"]:  # Prices cross
            trade_quantity = min(
                buy_order["amount"] - buy_order["filled"], 
                sell_order["amount"] - sell_order["filled"]
            )
            
            if trade_quantity >= effective_min_trade:
                # Enhanced price determination with maker/taker logic
                maker_order = None
                taker_order = None
                
                if buy_order["id"] < sell_order["id"]:
                    # Buy order was placed first (maker), sell order is taker
                    maker_order = buy_order
                    taker_order = sell_order
                    trade_price = buy_order["price"]
                    maker_fee_bps = config.get_maker_fee_bps()
                    taker_fee_bps = config.get_taker_fee_bps()
                else:
                    # Sell order was placed first (maker), buy order is taker
                    maker_order = sell_order
                    taker_order = buy_order
                    trade_price = sell_order["price"]
                    maker_fee_bps = config.get_maker_fee_bps()
                    taker_fee_bps = config.get_taker_fee_bps()
                
                # Calculate fees
                total_trade_value = trade_quantity * trade_price
                maker_fee = calculate_trade_fee(total_trade_value, maker_fee_bps)
                taker_fee = calculate_trade_fee(total_trade_value, taker_fee_bps)
                total_fee = maker_fee + taker_fee
                
                config.logger.debug(f"Match: Buy {buy_order['id']} @ {buy_order['price']} vs Sell {sell_order['id']} @ {sell_order['price']} -> Trade @ {trade_price} for {trade_quantity} (fee: {total_fee})")

                # Output tuple includes fee information
                matched_trades_output_tuples.append((
                    buy_order["id"],
                    sell_order["id"],
                    buy_order["user"], 
                    sell_order["user"], 
                    buy_order["token"], 
                    trade_price,
                    trade_quantity,
                    total_fee  # Total fee (maker + taker)
                ))
                
                buy_order["filled"] += trade_quantity
                sell_order["filled"] += trade_quantity

            # Remove fully filled orders
            if buy_order["filled"] >= buy_order["amount"]:
                buy_idx += 1
            if sell_order["filled"] >= sell_order["amount"]:
                sell_idx += 1
                
        else:
            # No more matches possible (sorted by price)
            break
            
    return matched_trades_output_tuples

def match_orders(orders):
    """
    Main order matching function that groups orders by token and processes them independently.
    
    Args:
        orders: List of order dictionaries with keys: id, user, token, amount, price, isBuyOrder, filled
        
    Returns:
        List of matched trade tuples: (buyOrderId, sellOrderId, buyer, seller, token, price, quantity, fee)
    """
    config.logger.debug(f"Starting order matching for {len(orders)} orders")
    
    # Group orders by token
    token_groups = {}
    for order in orders:
        token = order["token"]
        if token not in token_groups:
            token_groups[token] = []
        token_groups[token].append(order)
    
    all_trades = []
    total_trades = 0
    
    # Process each token group independently
    for token, token_orders in token_groups.items():
        config.logger.debug(f"Token {token[:10]}...: Processing {len([o for o in token_orders if o['isBuyOrder']])} buy orders, {len([o for o in token_orders if not o['isBuyOrder']])} sell orders")
        
        token_trades = match_orders_for_token(token_orders)
        all_trades.extend(token_trades)
        total_trades += len(token_trades)
        
        # Log trade results for this token
        for trade in token_trades:
            buy_id, sell_id, buyer, seller, trade_token, price, quantity, fee = trade
            aggressor = "buyer" if any(o["id"] == buy_id and o["id"] > any(s["id"] for s in token_orders if s["id"] == sell_id and not s["isBuyOrder"]) for o in token_orders if o["isBuyOrder"]) else "seller"
            config.logger.info(f"Trade executed: Buy#{buy_id} x Sell#{sell_id}, Token: {trade_token[:10]}..., Price: {price}, Quantity: {quantity}, Aggressor: {aggressor}")
        
        # Log order completion status
        for order in token_orders:
            if order["filled"] >= order["amount"]:
                order_type = "Buy" if order["isBuyOrder"] else "Sell"
                config.logger.info(f"{order_type} order {order['id']} fully filled")
    
    config.logger.info(f"Total matched {total_trades} trades across {len(token_groups)} token types.")
    return all_trades

# Cartesi Rollups integration
def cartesi_rollups_main():
    """Main function for Cartesi Rollups integration"""
    try:
        import requests
        ROLLUP_HTTP_SERVER_URL = os.environ.get("ROLLUP_HTTP_SERVER_URL", "http://127.0.0.1:5004")
        
        config.logger.info(f"Starting Cartesi Rollups integration with server: {ROLLUP_HTTP_SERVER_URL}")
        config.logger.info(f"Exchange mode: {config.exchange_mode}")
        
        finish_response = {"status": "accept"}
        
        while True:
            try:
                # Get advance request
                response = requests.post(f"{ROLLUP_HTTP_SERVER_URL}/finish", json=finish_response)
                
                if response.status_code == 200:
                    request_data = response.json()
                    request_type = request_data.get("request_type")
                    
                    if request_type == "advance_state":
                        # Process advance state request
                        data = request_data.get("data", {})
                        payload = data.get("payload", "")
                        
                        if payload:
                            config.logger.info(f"Processing advance request with payload length: {len(payload)}")
                            result = handle_order_request(payload)
                            
                            # Send result as notice
                            notice_response = requests.post(
                                f"{ROLLUP_HTTP_SERVER_URL}/notice",
                                json={"payload": result["payload"]}
                            )
                            
                            if notice_response.status_code == 200:
                                config.logger.info("Notice sent successfully")
                            else:
                                config.logger.error(f"Failed to send notice: {notice_response.status_code}")
                        
                        finish_response = {"status": "accept"}
                        
                    elif request_type == "inspect_state":
                        # Process inspect state request
                        data = request_data.get("data", {})
                        payload = data.get("payload", "")
                        
                        config.logger.info(f"Processing inspect request")
                        
                        # Return system status
                        status_info = {
                            "exchange_mode": config.exchange_mode,
                            "max_trades_per_batch": config.max_trades_per_batch,
                            "min_trade_amount": config.get_effective_min_trade_amount(),
                            "maker_fee_bps": config.get_maker_fee_bps(),
                            "taker_fee_bps": config.get_taker_fee_bps(),
                            "current_timestamp": config.current_timestamp
                        }
                        
                        report_response = requests.post(
                            f"{ROLLUP_HTTP_SERVER_URL}/report",
                            json={"payload": "0x" + json.dumps(status_info).encode('utf-8').hex()}
                        )
                        
                        if report_response.status_code == 200:
                            config.logger.info("Report sent successfully")
                        
                        finish_response = {"status": "accept"}
                        
                    else:
                        config.logger.warning(f"Unknown request type: {request_type}")
                        finish_response = {"status": "reject"}
                
                else:
                    config.logger.error(f"Failed to get request: {response.status_code}")
                    break
                    
            except requests.exceptions.RequestException as e:
                config.logger.error(f"Request error: {e}")
                break
            except Exception as e:
                config.logger.error(f"Unexpected error in main loop: {e}")
                finish_response = {"status": "reject"}
                
    except ImportError:
        config.logger.warning("requests library not available, running in test mode")
        return False
    except Exception as e:
        config.logger.error(f"Failed to start Cartesi Rollups integration: {e}")
        return False
    
    return True

if __name__ == "__main__":
    config.logger.info("Stock Exchange Offchain Logic started")
    config.logger.info(f"Mode: {config.exchange_mode}")
    
    if config.exchange_mode == "real":
        # Try to run in Cartesi Rollups mode
        config.logger.info("Attempting to start Cartesi Rollups integration...")
        if not cartesi_rollups_main():
            config.logger.warning("Cartesi Rollups integration failed, falling back to test mode")
    
    # Test mode or fallback
    if len(sys.argv) > 1:
        config.logger.info(f"Test mode: processing payload from command line argument")
        result = handle_order_request(sys.argv[1])
        print("Result from handle_order_request (JSON):")
        print(json.dumps(result, indent=2))
    else:
        config.logger.info("No command line arguments provided. Waiting for Cartesi inputs or terminating.")
        if config.exchange_mode == "mock":
            config.logger.info("Running in mock mode - use command line arguments for testing")