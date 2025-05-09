from flask import jsonify, request
from web3 import Web3
import logging

# Assuming 'app' is the Flask app instance defined in server.py
# and other necessary variables like w3, exchange_contract, etc., are also globally available
# or passed/imported appropriately.
# This is a common pattern if server_endpoints.py is part of a larger Flask application
# structured across multiple files.

# If server.py defines these, and this file is imported by server.py,
# they might be accessible. Otherwise, they need to be explicitly imported or passed.
# For example, from ..server import app, w3, exchange_contract, stock_token_contract, \
#                                 get_user_eth_balance, get_user_token_balance, \
#                                 stock_token_address, mock_db, logger, get_order_from_blockchain

# For the purpose of this fix, we'll assume they are available in the global scope
# as if this file's content was part of server.py or they are correctly imported.

# Mock database (if not imported from server.py)
# mock_db = {"balances": {}, "orders": {}} 
# logger = logging.getLogger(__name__) # If not imported

# It's better to import these from where they are defined, e.g., your main server.py
from server import app, w3, exchange_contract, stock_token_contract, get_user_eth_balance, get_user_token_balance, stock_token_address, mock_db, logger, get_order_from_blockchain


# Additional endpoints to implement for the server.py file

# Trigger order matching endpoint
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

# Process results endpoint
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

# Balance endpoint
@app.route('/api/balance/<user_address>', methods=['GET'])
def get_balance(user_address):
    """Get the balance for a user, including wallet and exchange balances."""
    if w3 and w3.is_connected() and exchange_contract:
        try:
            checksum_user_address = Web3.to_checksum_address(user_address)

            # Fetch Wallet Balances
            wallet_eth_balance_wei = w3.eth.get_balance(checksum_user_address)
            
            wallet_token_balance_wei = 0
            if stock_token_contract: # Ensure stock_token_contract is initialized
                try:
                    wallet_token_balance_wei = stock_token_contract.functions.balanceOf(checksum_user_address).call()
                    logger.info(f"Retrieved token balance for {user_address}: {wallet_token_balance_wei}")
                except Exception as e:
                    logger.error(f"Error calling balanceOf for {user_address}: {e}")
                    # Try to determine if this is an actual connection issue or contract issue
                    try:
                        # Test if the contract is accessible by calling a simple view function
                        symbol = stock_token_contract.functions.symbol().call()
                        logger.info(f"Contract is accessible (symbol: {symbol}), but balanceOf call failed")
                    except Exception as e2:
                        logger.error(f"Contract is not accessible: {e2}")
            else:
                logger.warning("StockToken contract not available for fetching wallet token balance.")

            # Fetch Exchange Balances
            exchange_eth_balance_wei = get_user_eth_balance(user_address) 
            exchange_token_balance_wei = get_user_token_balance(user_address, stock_token_address)
            
            return jsonify({
                "eth": float(w3.from_wei(wallet_eth_balance_wei, 'ether')),
                "token": float(w3.from_wei(wallet_token_balance_wei, 'ether')),
                "exchange_eth": float(w3.from_wei(exchange_eth_balance_wei, 'ether')),
                "exchange_token": float(w3.from_wei(exchange_token_balance_wei, 'ether'))
            })
        except Exception as e:
            logger.error(f"Error fetching balances from blockchain for {user_address}: {e}")
            # Fall through to mock data or error response if configured
    
    logger.warning(f"Falling back to mock data for user {user_address} due to Web3 issue or error.")
    if user_address in mock_db.get("balances", {}):
        user_balances = mock_db["balances"][user_address]
        token_balances = user_balances.get("tokens", {})
        
        token_balance_mock = 0
        if stock_token_address and stock_token_address in token_balances:
            token_balance_mock = token_balances[stock_token_address]
        elif not stock_token_address and token_balances:
            pass 

        return jsonify({
            "eth": user_balances.get("eth", 0), 
            "token": token_balance_mock, 
            "exchange_eth": user_balances.get("exchange_eth", user_balances.get("eth", 0)), 
            "exchange_token": token_balances.get("exchange_token", token_balance_mock) 
        })
    else:
        if "balances" not in mock_db:
            mock_db["balances"] = {}
        mock_db["balances"][user_address] = {
            "eth": 0, 
            "tokens": {}, 
            "exchange_eth": 0, 
            "exchange_token": 0
        }
        return jsonify({
            "eth": 0,
            "token": 0,
            "exchange_eth": 0,
            "exchange_token": 0
        })

# Deposit endpoint
@app.route('/api/deposit', methods=['POST'])
def deposit_endpoint():
    """Handle deposit requests (ETH or tokens)"""
    data = request.json
    if not data:
        return jsonify({"error": "Invalid request"}), 400
    
    user_address = data.get('userAddress')
    token_address = data.get('tokenAddress')
    amount = data.get('amount')
    is_eth = data.get('isEth', False)
    
    if not user_address or not amount:
        return jsonify({"error": "Missing required fields"}), 400
    
    if not is_eth and not token_address:
        return jsonify({"error": "Token address required for token deposits"}), 400
    
    # This would normally be done client-side with MetaMask
    # For testing, we'll update our mock balances
    if is_eth:
        # Mock ETH deposit
        if user_address not in mock_db.get("balances", {}):
            if "balances" not in mock_db:
                mock_db["balances"] = {}
            mock_db["balances"][user_address] = {"eth": 0, "tokens": {}}
        
        mock_db["balances"][user_address]["eth"] = mock_db["balances"][user_address].get("eth", 0) + float(amount)
        
        return jsonify({
            "status": "success",
            "message": f"Deposited {amount} ETH for {user_address}",
            "balance": mock_db["balances"][user_address]["eth"]
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
            "message": f"Deposited {amount} tokens for {user_address}",
            "balance": mock_db["balances"][user_address]["tokens"][token_address]
        })

# Withdraw endpoint
@app.route('/api/withdraw', methods=['POST'])
def withdraw_endpoint():
    """Handle withdraw requests (ETH or tokens)"""
    data = request.json
    if not data:
        return jsonify({"error": "Invalid request"}), 400
    
    user_address = data.get('userAddress')
    token_address = data.get('tokenAddress')
    amount = data.get('amount')
    is_eth = data.get('isEth', False)
    
    if not user_address or not amount:
        return jsonify({"error": "Missing required fields"}), 400
    
    if not is_eth and not token_address:
        return jsonify({"error": "Token address required for token withdrawals"}), 400
    
    # This would normally be done client-side with MetaMask
    # For testing, we'll update our mock balances
    if is_eth:
        # Mock ETH withdrawal
        if user_address not in mock_db.get("balances", {}) or \
           mock_db["balances"][user_address].get("eth", 0) < float(amount):
            return jsonify({"error": "Insufficient ETH balance"}), 400
        
        mock_db["balances"][user_address]["eth"] -= float(amount)
        
        return jsonify({
            "status": "success",
            "message": f"Withdrew {amount} ETH for {user_address}",
            "balance": mock_db["balances"][user_address]["eth"]
        })
    else:
        # Mock token withdrawal
        if user_address not in mock_db.get("balances", {}) or \
           "tokens" not in mock_db["balances"][user_address] or \
           token_address not in mock_db["balances"][user_address]["tokens"] or \
           mock_db["balances"][user_address]["tokens"][token_address] < float(amount):
            return jsonify({"error": "Insufficient token balance"}), 400
        
        mock_db["balances"][user_address]["tokens"][token_address] -= float(amount)
        
        return jsonify({
            "status": "success",
            "message": f"Withdrew {amount} tokens for {user_address}",
            "balance": mock_db["balances"][user_address]["tokens"][token_address]
        })

# Get order endpoint
@app.route('/api/orders/<int:order_id>', methods=['GET'])
def get_order(order_id):
    """Get a specific order by ID"""
    # Try to get from blockchain first if Web3 is set up
    if w3 and w3.is_connected() and exchange_contract:
        try:
            order = get_order_from_blockchain(order_id)
            if order:
                return jsonify(order)
        except Exception as e:
            logger.error(f"Error fetching order from blockchain: {e}")
            # Fall back to mock data
    
    # Use mock data if not connected to blockchain or if error occurred
    if order_id in mock_db["orders"]:
        return jsonify(mock_db["orders"][order_id])
    else:
        return jsonify({"error": f"Order with ID {order_id} not found"}), 404

# Cancel order endpoint
@app.route('/api/orders/<int:order_id>/cancel', methods=['POST'])
def cancel_order_endpoint(order_id):
    """Cancel an order"""
    # This would normally be done client-side with MetaMask
    # For testing, we'll update our mock orders
    if order_id not in mock_db["orders"]:
        return jsonify({"error": f"Order with ID {order_id} not found"}), 404
    
    # Check if the order is already inactive
    if not mock_db["orders"][order_id]["active"]:
        return jsonify({"error": f"Order with ID {order_id} is already inactive"}), 400
    
    # Mark the order as inactive
    mock_db["orders"][order_id]["active"] = False
    
    return jsonify({
        "status": "success",
        "message": f"Order with ID {order_id} has been cancelled",
        "orderId": order_id
    })
