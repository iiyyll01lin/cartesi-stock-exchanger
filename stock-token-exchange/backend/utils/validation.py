from decimal import Decimal, InvalidOperation
from web3 import Web3

def validate_ethereum_address(address):
    """Validate an Ethereum address"""
    if not address:
        return False, "Address cannot be empty"
    try:
        # Check if address is valid by attempting to checksum it
        Web3.to_checksum_address(address)
        return True, None
    except ValueError:
        return False, "Invalid Ethereum address format"

def validate_amount(amount, min_value=None, max_value=None):
    """Validate an amount as a valid decimal and within allowed range"""
    try:
        amount = Decimal(str(amount))
    except (InvalidOperation, ValueError, TypeError):
        return False, "Amount must be a valid number"
    
    if amount <= 0:
        return False, "Amount must be greater than zero"
    
    if min_value is not None and amount < Decimal(str(min_value)):
        return False, f"Amount must be at least {min_value}"
    
    if max_value is not None and amount > Decimal(str(max_value)):
        return False, f"Amount cannot exceed {max_value}"
    
    return True, None

def validate_order_data(order_data):
    """Validate order data structure"""
    if not order_data:
        return False, "Order data cannot be empty"
        
    required_fields = ['type', 'amount', 'price', 'user_address']
    
    # Check for required fields
    missing_fields = [field for field in required_fields if field not in order_data]
    if missing_fields:
        return False, f"Missing required fields: {', '.join(missing_fields)}"
    
    # Validate specific fields
    if order_data['type'] not in ['buy', 'sell']:
        return False, "Order type must be 'buy' or 'sell'"
    
    valid, error = validate_amount(order_data['amount'])
    if not valid:
        return False, f"Invalid amount: {error}"
    
    valid, error = validate_amount(order_data['price'])
    if not valid:
        return False, f"Invalid price: {error}"
    
    valid, error = validate_ethereum_address(order_data['user_address'])
    if not valid:
        return False, f"Invalid user address: {error}"
    
    return True, None
