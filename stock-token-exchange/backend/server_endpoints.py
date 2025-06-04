from flask import jsonify, request, Blueprint
from web3 import Web3
import logging
import uuid
import sys
import os
from pathlib import Path

# Let's use relative imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from utils.errors import error_response
    from utils.error_types import ErrorType
    from utils.logger import log_error
    from utils.circuit_breaker import blockchain_breaker
    from utils.validation import validate_ethereum_address, validate_amount, validate_order_data
    logger = logging.getLogger(__name__)
    logger.info("Successfully imported utility modules")
except Exception as e:
    logger = logging.getLogger(__name__)
    logger.error(f"Error importing utility modules: {e}")
    # Fallback implementations in case of import error
    def error_response(error_type, message, status_code=400, details=None):
        response = {
            "status": "error",
            "error": {
                "type": error_type,
                "message": message
            }
        }
        if details:
            response["error"]["details"] = details
        return jsonify(response), status_code
    
    def log_error(message, error=None, context=None):
        if error:
            logger.error(f"{message}: {str(error)}")
        else:
            logger.error(message)

# Create a blueprint instead of using the main app
endpoints_bp = Blueprint('endpoints', __name__)

# Add middleware for request tracking
@endpoints_bp.before_request
def before_request():
    request.id = str(uuid.uuid4())
    logger.info(f"Request {request.id}: {request.method} {request.path}")

# Import necessary components from the main server module.
# Make sure to include both the Web3 class (for static methods) and the w3 instance (for connection)
try:
    from server import w3, exchange_contract, stock_token_contract, get_user_eth_balance, get_user_token_balance, stock_token_address, mock_db, logger, get_order_from_blockchain
    logger.info("Successfully imported objects from server.py")
except Exception as e:
    # If import fails, set up basic fallbacks for testing/development
    import logging
    logger = logging.getLogger(__name__)
    logger.error(f"Error importing from server.py: {e}")
    # These would be defined properly if the import worked, but we'll set them to None for safety
    w3 = None
    exchange_contract = None
    stock_token_contract = None
    stock_token_address = None
    mock_db = {"balances": {}, "orders": {}}


# Additional endpoints to implement for the server.py file

# Trigger order matching endpoint
@endpoints_bp.route('/trigger-matching-alt', methods=['POST'])
def trigger_matching_alt():
    """
    Endpoint to trigger the off-chain order matching process.
    In a real implementation, this would call the smart contract triggerOrderMatching function.
    """
    if not w3 or not w3.is_connected() or not exchange_contract:
        # Mock implementation for testing
        log_error("Blockchain connection unavailable", context={"w3_connected": bool(w3 and w3.is_connected())})
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
    
    try:
        # In a real implementation, this would use the private key to sign a transaction
        # For now, we'll just return a successful mock response
        logger.info("Triggering order matching (simulated)")
        
        # This would be decorated with @blockchain_breaker in production
        # response = blockchain_operations()
        
        return jsonify({
            "status": "success",
            "data": {
                "message": "Order matching triggered",
                "txHash": "0x" + "1" * 64,
                "blockNumber": w3.eth.block_number,
                "cartesiIndex": 0
            }
        })
    except Exception as e:
        log_error("Error triggering order matching", e)
        return error_response(
            ErrorType.BLOCKCHAIN_ERROR.value,
            "Failed to trigger order matching",
            status_code=500,
            details={"error_message": str(e)}
        )

# Process results endpoint (alternative implementation)
@endpoints_bp.route('/process-results-alt/<int:index>', methods=['POST'])
def process_results_alt(index):
    """
    Alternative endpoint to process the results of the off-chain computation.
    In a real implementation, this would call the smart contract processMatchResult function.
    """
    if not w3 or not w3.is_connected() or not exchange_contract:
        # Mock implementation for testing
        log_error("Blockchain connection unavailable for processing results", 
                 context={"index": index})
        
        try:
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
            
            # Emit event for tracking
            logger.info(f"Processed {trades_processed} trades in mock mode for index {index}")
            
            return jsonify({
                "status": "success",
                "data": {
                    "message": f"Processed results for index {index} (mock)",
                    "txHash": "0x" + "0" * 64,
                    "blockNumber": 0,
                    "tradesProcessed": trades_processed
                }
            })
        except Exception as e:
            log_error("Error processing results in mock mode", e, 
                     context={"index": index})
            return error_response(
                ErrorType.INTERNAL_ERROR.value,
                "Failed to process results in mock mode",
                status_code=500,
                details={"index": index, "error": str(e)}
            )
    
    try:
        # In a real implementation, this would use the circuit breaker pattern
        @blockchain_breaker
        def process_results():
            # This would call the smart contract in a real implementation
            logger.info(f"Processing results for Cartesi index {index}")
            # Simulate processing
            return {
                "txHash": "0x" + "f" * 64,
                "blockNumber": w3.eth.block_number,
                "tradesProcessed": 5
            }
        
        # Call the circuit-breaker protected function
        result = process_results()
        
        return jsonify({
            "status": "success",
            "data": {
                "message": f"Processed results for index {index}",
                "txHash": result["txHash"],
                "blockNumber": result["blockNumber"],
                "tradesProcessed": result["tradesProcessed"]
            }
        })
    except Exception as e:
        log_error("Error processing Cartesi results", e, 
                 context={"index": index})
        return error_response(
            ErrorType.BLOCKCHAIN_ERROR.value,
            "Failed to process Cartesi computation results",
            status_code=500,
            details={"index": index, "error": str(e)}
        )

    except Exception as e:
        log_error("Failed to process mock order matching", e, 
                 context={"index": index, "mock": True})
        return error_response(
            ErrorType.INTERNAL_ERROR.value,
            "Failed to process mock order matching",
            status_code=500,
            details={"error_message": str(e)}
        )
    
    try:
        # In a real implementation, this would use the private key to sign a transaction
        # For now, we'll just return a successful mock response
        logger.info(f"Processing results for index {index} (simulated)")
        
        # This would be decorated with @blockchain_breaker in production
        # response = process_blockchain_results(index)
        
        return jsonify({
            "status": "success",
            "data": {
                "message": f"Processed results for index {index}",
                "txHash": "0x" + "2" * 64,
                "blockNumber": w3.eth.block_number,
                "tradesProcessed": 1
            }
        })
    except Exception as e:
        log_error(f"Error processing results for index {index}", e, 
                 context={"index": index})
        return error_response(
            ErrorType.BLOCKCHAIN_ERROR.value,
            "Failed to process order matching results",
            status_code=500,
            details={"error_message": str(e)}
        )

# Balance endpoint (alternative implementation)
@endpoints_bp.route('/api/balance-alt/<user_address>', methods=['GET'])
def get_balance_alt(user_address):
    """Get the balance for a user, including wallet and exchange balances."""
    # Validate the user address
    valid, error_msg = validate_ethereum_address(user_address)
    if not valid:
        log_error("Invalid Ethereum address", context={"address": user_address, "error": error_msg})
        return error_response(
            ErrorType.VALIDATION_ERROR.value,
            error_msg,
            status_code=400
        )
    
    # Use circuit breaker pattern for blockchain operations
    def fetch_balances_from_blockchain():
        try:
            eth_balance = get_user_eth_balance(user_address) if w3 else 0
            token_balance = get_user_token_balance(user_address, stock_token_address) if stock_token_contract else 0
            exchange_eth_deposit = exchange_contract.functions.ethDeposits(user_address).call() if exchange_contract else 0
            exchange_token_deposit = exchange_contract.functions.deposits(stock_token_address, user_address).call() if exchange_contract else 0
            
            return {
                "eth": {
                    "wallet": eth_balance,
                    "exchange": exchange_eth_deposit
                },
                "token": {
                    "wallet": token_balance,
                    "exchange": exchange_token_deposit
                }
            }
        except Exception as e:
            log_error("Error fetching blockchain balances", e, 
                     context={"user_address": user_address})
            raise
    
    # Fetch from mock DB if blockchain unavailable
    def get_mock_balances():
        mock_balances = mock_db.get("balances", {}).get(user_address, {})
        return {
            "eth": {
                "wallet": mock_balances.get("eth_wallet", 1000000000000000000),  # 1 ETH
                "exchange": mock_balances.get("eth_exchange", 0)
            },
            "token": {
                "wallet": mock_balances.get("token_wallet", 1000),  # 1000 tokens
                "exchange": mock_balances.get("token_exchange", 0)
            }
        }
    
    # First try blockchain, then fall back to mock
    if w3 and w3.is_connected() and exchange_contract:
        try:
            # Apply circuit breaker pattern
            @blockchain_breaker
            def get_blockchain_balances():
                return fetch_balances_from_blockchain()
            
            balances = get_blockchain_balances()
            return jsonify({
                "status": "success",
                "data": balances
            })
        except Exception as e:
            log_error("Failed to fetch blockchain balances", e, 
                     context={"user_address": user_address})
            # Fall through to mock data
    
    # Log the fallback to mock data
    log_error("Falling back to mock data for user balance", 
             context={"address": user_address, "reason": "Blockchain unavailable or error"})
    
    # Return mock data with warning
    balances = get_mock_balances()
    return jsonify({
        "status": "success",
        "data": balances,
        "warning": "Using cached/mock data due to blockchain unavailability"
    })
    
    # Use circuit breaker pattern for blockchain operations
    def fetch_balances_from_blockchain():
        try:
            # Always use Web3.to_checksum_address (class method) instead of w3.to_checksum_address
            checksum_user_address = Web3.to_checksum_address(user_address)

            # Fetch Wallet Balances
            wallet_eth_balance_wei = w3.eth.get_balance(checksum_user_address)
            
            wallet_token_balance_wei = 0
            if stock_token_contract: # Ensure stock_token_contract is initialized
                try:
                    wallet_token_balance_wei = stock_token_contract.functions.balanceOf(checksum_user_address).call()
                    logger.info(f"Retrieved token balance for {user_address}: {wallet_token_balance_wei}")
                except Exception as e:
                    log_error(f"Error calling balanceOf for {user_address}", e, 
                             context={"address": user_address})
                    # Try to determine if this is an actual connection issue or contract issue
                    try:
                        # Test if the contract is accessible by calling a simple view function
                        symbol = stock_token_contract.functions.symbol().call()
                        logger.info(f"Contract is accessible (symbol: {symbol}), but balanceOf call failed")
                    except Exception as e2:
                        log_error("Contract is not accessible", e2)
            else:
                log_error("StockToken contract not available", context={"operation": "fetching wallet token balance"})

            # Fetch Exchange Balances
            exchange_eth_balance_wei = get_user_eth_balance(user_address) 
            exchange_token_balance_wei = get_user_token_balance(user_address, stock_token_address)
            
            return {
                "eth": float(w3.from_wei(wallet_eth_balance_wei, 'ether')),
                "token": float(w3.from_wei(wallet_token_balance_wei, 'ether')),
                "exchange_eth": float(w3.from_wei(exchange_eth_balance_wei, 'ether')),
                "exchange_token": float(w3.from_wei(exchange_token_balance_wei, 'ether')),
                "source": "blockchain"
            }
        except Exception as e:
            log_error(f"Error fetching balances from blockchain for {user_address}", e, 
                     context={"address": user_address})
            raise
    
    # Fetch from mock DB if blockchain unavailable
    def get_mock_balances():
        if user_address in mock_db.get("balances", {}):
            user_balances = mock_db["balances"][user_address]
            token_balances = user_balances.get("tokens", {})
            
            token_balance_mock = 0
            if stock_token_address and stock_token_address in token_balances:
                token_balance_mock = token_balances[stock_token_address]
            
            return {
                "eth": user_balances.get("eth", 0), 
                "token": token_balance_mock, 
                "exchange_eth": user_balances.get("exchange_eth", user_balances.get("eth", 0)), 
                "exchange_token": token_balances.get("exchange_token", token_balance_mock),
                "source": "mock"
            }
        else:
            # Initialize mock data for new user
            if "balances" not in mock_db:
                mock_db["balances"] = {}
            mock_db["balances"][user_address] = {
                "eth": 0, 
                "tokens": {}, 
                "exchange_eth": 0, 
                "exchange_token": 0
            }
            return {
                "eth": 0,
                "token": 0,
                "exchange_eth": 0,
                "exchange_token": 0,
                "source": "mock_new"
            }
    
    # First try blockchain, then fall back to mock
    if w3 and w3.is_connected() and exchange_contract:
        try:
            # This would use the circuit breaker in production
            # balances = blockchain_breaker(fetch_balances_from_blockchain)()
            balances = fetch_balances_from_blockchain()
            return jsonify({
                "status": "success",
                "data": balances
            })
        except Exception:
            # Fall through to mock data
            pass
    
    # Log the fallback to mock data
    log_error(f"Falling back to mock data for user {user_address}", 
             context={"address": user_address, "reason": "Blockchain unavailable or error"})
    
    # Return mock data with warning
    balances = get_mock_balances()
    return jsonify({
        "status": "success",
        "data": balances,
        "warning": "Using cached/mock data due to blockchain unavailability"
    })

# Deposit endpoint
@endpoints_bp.route('/api/deposit', methods=['POST'])
def deposit_endpoint():
    """Handle deposit requests (ETH or tokens)"""
    try:
        data = request.json
        if not data:
            return error_response(
                ErrorType.VALIDATION_ERROR.value,
                "Invalid request body",
                status_code=400
            )
        
        # Validate required fields
        user_address = data.get('userAddress')
        token_address = data.get('tokenAddress')
        amount = data.get('amount')
        is_eth = data.get('isEth', False)
        
        # Validate user address
        valid, error_msg = validate_ethereum_address(user_address)
        if not valid:
            return error_response(
                ErrorType.VALIDATION_ERROR.value,
                f"Invalid user address: {error_msg}",
                status_code=400
            )
        
        # Validate amount
        valid, error_msg = validate_amount(amount)
        if not valid:
            return error_response(
                ErrorType.VALIDATION_ERROR.value,
                f"Invalid amount: {error_msg}",
                status_code=400
            )
        
        # Validate token address for token deposits
        if not is_eth:
            if not token_address:
                return error_response(
                    ErrorType.VALIDATION_ERROR.value,
                    "Token address required for token deposits",
                    status_code=400
                )
            valid, error_msg = validate_ethereum_address(token_address)
            if not valid:
                return error_response(
                    ErrorType.VALIDATION_ERROR.value,
                    f"Invalid token address: {error_msg}",
                    status_code=400
                )
        
        # This would normally be done client-side with MetaMask
        # For testing, we'll update our mock balances
        try:
            if is_eth:
                # Mock ETH deposit
                if user_address not in mock_db.get("balances", {}):
                    if "balances" not in mock_db:
                        mock_db["balances"] = {}
                    mock_db["balances"][user_address] = {"eth": 0, "tokens": {}}
                
                mock_db["balances"][user_address]["eth"] = mock_db["balances"][user_address].get("eth", 0) + float(amount)
                
                return jsonify({
                    "status": "success",
                    "data": {
                        "message": f"Deposited {amount} ETH for {user_address}",
                        "balance": mock_db["balances"][user_address]["eth"]
                    }
                })
            else:
                # Mock token deposit
                if user_address not in mock_db.get("balances", {}):
                    if "balances" not in mock_db:
                        mock_db["balances"] = {}
                    mock_db["balances"][user_address] = {"eth": 0, "tokens": {}}
                
                if "tokens" not in mock_db["balances"][user_address]:
                    mock_db["balances"][user_address]["tokens"] = {}
                
                mock_db["balances"][user_address]["tokens"][token_address] = \
                    mock_db["balances"][user_address]["tokens"].get(token_address, 0) + float(amount)
                
                return jsonify({
                    "status": "success",
                    "data": {
                        "message": f"Deposited {amount} tokens for {user_address}",
                        "balance": mock_db["balances"][user_address]["tokens"][token_address]
                    }
                })
        except Exception as e:
            log_error("Failed to process deposit", e, 
                     context={"user_address": user_address, "amount": amount, "is_eth": is_eth})
            return error_response(
                ErrorType.INTERNAL_ERROR.value,
                "Failed to process deposit",
                status_code=500,
                details={"error_message": str(e)}
            )
    except Exception as e:
        log_error("Unexpected error in deposit endpoint", e)
        return error_response(
            ErrorType.INTERNAL_ERROR.value,
            "An unexpected error occurred",
            status_code=500
        )

# Withdraw endpoint
@endpoints_bp.route('/api/withdraw', methods=['POST'])
def withdraw_endpoint():
    """Handle withdraw requests (ETH or tokens)"""
    try:
        data = request.json
        if not data:
            return error_response(
                ErrorType.VALIDATION_ERROR.value,
                "Invalid request body",
                status_code=400
            )
        
        # Validate required fields
        user_address = data.get('userAddress')
        token_address = data.get('tokenAddress')
        amount = data.get('amount')
        is_eth = data.get('isEth', False)
        
        # Validate user address
        valid, error_msg = validate_ethereum_address(user_address)
        if not valid:
            return error_response(
                ErrorType.VALIDATION_ERROR.value,
                f"Invalid user address: {error_msg}",
                status_code=400
            )
        
        # Validate amount
        valid, error_msg = validate_amount(amount)
        if not valid:
            return error_response(
                ErrorType.VALIDATION_ERROR.value,
                f"Invalid amount: {error_msg}",
                status_code=400
            )
        
        # Validate token address for token withdrawals
        if not is_eth:
            if not token_address:
                return error_response(
                    ErrorType.VALIDATION_ERROR.value,
                    "Token address required for token withdrawals",
                    status_code=400
                )
            valid, error_msg = validate_ethereum_address(token_address)
            if not valid:
                return error_response(
                    ErrorType.VALIDATION_ERROR.value,
                    f"Invalid token address: {error_msg}",
                    status_code=400
                )
        
        # This would normally be done client-side with MetaMask
        # For testing, we'll update our mock balances
        try:
            if is_eth:
                # Check sufficient ETH balance
                if user_address not in mock_db.get("balances", {}) or \
                mock_db["balances"][user_address].get("eth", 0) < float(amount):
                    return error_response(
                        ErrorType.INSUFFICIENT_FUNDS.value,
                        "Insufficient ETH balance",
                        status_code=400,
                        details={
                            "required": float(amount),
                            "available": mock_db["balances"].get(user_address, {}).get("eth", 0)
                        }
                    )
                
                # Perform the withdrawal
                mock_db["balances"][user_address]["eth"] -= float(amount)
                
                return jsonify({
                    "status": "success",
                    "data": {
                        "message": f"Withdrew {amount} ETH for {user_address}",
                        "balance": mock_db["balances"][user_address]["eth"]
                    }
                })
            else:
                # Check sufficient token balance
                if user_address not in mock_db.get("balances", {}) or \
                "tokens" not in mock_db["balances"][user_address] or \
                token_address not in mock_db["balances"][user_address]["tokens"] or \
                mock_db["balances"][user_address]["tokens"][token_address] < float(amount):
                    return error_response(
                        ErrorType.INSUFFICIENT_FUNDS.value,
                        "Insufficient token balance",
                        status_code=400,
                        details={
                            "required": float(amount),
                            "available": mock_db["balances"].get(user_address, {}).get("tokens", {}).get(token_address, 0)
                        }
                    )
                
                # Perform the withdrawal
                mock_db["balances"][user_address]["tokens"][token_address] -= float(amount)
                
                return jsonify({
                    "status": "success",
                    "data": {
                        "message": f"Withdrew {amount} tokens for {user_address}",
                        "balance": mock_db["balances"][user_address]["tokens"][token_address]
                    }
                })
        except Exception as e:
            log_error("Failed to process withdrawal", e, 
                     context={"user_address": user_address, "amount": amount, "is_eth": is_eth})
            return error_response(
                ErrorType.INTERNAL_ERROR.value,
                "Failed to process withdrawal",
                status_code=500,
                details={"error_message": str(e)}
            )
    except Exception as e:
        log_error("Unexpected error in withdraw endpoint", e)
        return error_response(
            ErrorType.INTERNAL_ERROR.value,
            "An unexpected error occurred",
            status_code=500
        )

# Get order endpoint
@endpoints_bp.route('/api/orders/<int:order_id>', methods=['GET'])
def get_order(order_id):
    """Get a specific order by ID"""
    try:
        # Try to get from blockchain first if Web3 is set up
        if w3 and w3.is_connected() and exchange_contract:
            try:
                # This would use circuit breaker in production
                # order = blockchain_breaker(lambda: get_order_from_blockchain(order_id))()
                order = get_order_from_blockchain(order_id)
                if order:
                    return jsonify({
                        "status": "success",
                        "data": order
                    })
            except Exception as e:
                log_error(f"Error fetching order {order_id} from blockchain", e, 
                         context={"order_id": order_id})
                # Fall through to mock data
        
        # Use mock data if not connected to blockchain or if error occurred
        if order_id in mock_db["orders"]:
            return jsonify({
                "status": "success",
                "data": mock_db["orders"][order_id]
            })
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

# Cancel order endpoint
@endpoints_bp.route('/api/orders/<int:order_id>/cancel', methods=['POST'])
def cancel_order_endpoint(order_id):
    """Cancel an order"""
    try:
        # Verify the order exists
        if order_id not in mock_db["orders"]:
            return error_response(
                ErrorType.RESOURCE_NOT_FOUND.value,
                f"Order with ID {order_id} not found",
                status_code=404
            )
        
        # Check if the order is already inactive
        if not mock_db["orders"][order_id]["active"]:
            return error_response(
                ErrorType.CONTRACT_LOGIC_ERROR.value,
                f"Order with ID {order_id} is already inactive",
                status_code=400
            )
        
        # This would normally be done client-side with MetaMask
        try:
            # Mark the order as inactive
            mock_db["orders"][order_id]["active"] = False
            
            return jsonify({
                "status": "success",
                "data": {
                    "message": f"Order with ID {order_id} has been cancelled",
                    "orderId": order_id
                }
            })
        except Exception as e:
            log_error(f"Error cancelling order {order_id}", e, 
                     context={"order_id": order_id})
            return error_response(
                ErrorType.BLOCKCHAIN_ERROR.value,
                "Failed to cancel order",
                status_code=500,
                details={"error_message": str(e)}
            )
    except Exception as e:
        log_error(f"Unexpected error cancelling order {order_id}", e)
        return error_response(
            ErrorType.INTERNAL_ERROR.value,
            "An unexpected error occurred",
            status_code=500
        )

# Health check endpoint removed - using simple health check in main server.py instead
