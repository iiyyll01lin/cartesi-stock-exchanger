from flask import Flask, request, jsonify
import os  # Ensure os is imported
import logging
import traceback
import sys
import importlib
import binascii

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Use importlib to load offchain_logic dynamically for better error handling
try:
    offchain_logic = importlib.import_module('offchain_logic')
    logger.info("Successfully imported offchain_logic module")
except Exception as e:
    logger.error(f"Failed to import offchain_logic module: {e}")
    logger.error(traceback.format_exc())
    sys.exit(1)  # Exit if we can't import the essential module

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "message": "Python runner service is operational"}), 200

@app.route('/execute', methods=['POST'])
def execute_offchain_logic():
    """
    Execute the offchain_logic module with the input data from the request.
    Accepts either raw binary data or JSON with 'input_payload_hex' field.
    """
    try:
        # Check if we have raw binary data or JSON
        if request.is_json:
            data = request.get_json()
            if not data or 'input_payload_hex' not in data:
                return jsonify({"error": "Missing 'input_payload_hex' in request JSON"}), 400
            
            input_payload_hex = data['input_payload_hex']
            logger.info(f"Received hex input data: {input_payload_hex[:100]}...")
        else:
            # For binary data, convert to hex
            input_data = request.get_data()
            if not input_data:
                return jsonify({"error": "No input data provided"}), 400
            
            # Convert binary to hex
            input_payload_hex = binascii.hexlify(input_data).decode('utf-8')
            logger.info(f"Received and converted {len(input_data)} bytes to hex: {input_payload_hex[:100]}...")
        
        try:
            # Ensure the hex string has the '0x' prefix expected by offchain_logic
            if not input_payload_hex.startswith('0x'):
                input_payload_hex = '0x' + input_payload_hex
            
            # Call the offchain_logic module to process the data
            logger.info("Calling offchain_logic.handle_order_request...")
            result_dict = offchain_logic.handle_order_request(input_payload_hex)
            logger.info("Successfully executed offchain_logic")
            
            # Check if there was an error in the offchain_logic execution
            if result_dict.get("type") == "error":
                error_message = result_dict.get("message", "Unknown error in offchain_logic")
                error_details = result_dict.get("details", {})
                logger.error(f"offchain_logic error: {error_message}")
                logger.error(f"Error details: {error_details}")
                return jsonify({
                    "error": error_message,
                    "details": error_details
                }), 500
            
            # Return the successful result
            logger.info(f"Returning output payload: {result_dict.get('payload', '')[:100]}...")
            return jsonify({"output_payload_hex": result_dict.get("payload")}), 200
            
        except Exception as e:
            logger.error(f"Error in offchain_logic execution: {e}")
            logger.error(traceback.format_exc())
            return jsonify({
                "error": "Execution error in offchain_logic module",
                "message": str(e),
                "traceback": traceback.format_exc()
            }), 500
            
    except Exception as e:
        logger.error(f"Server error processing request: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "error": "Server error",
            "message": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/execute-raw', methods=['POST'])
def execute_raw():
    """
    Execute with raw binary data and return raw binary response.
    This is useful for direct ABI-encoded communication.
    """
    try:
        # Get raw binary input
        input_data = request.get_data()
        if not input_data:
            return jsonify({"error": "No input data provided"}), 400
            
        # Convert binary to hex for offchain_logic
        input_payload_hex = '0x' + binascii.hexlify(input_data).decode('utf-8')
        logger.info(f"Received {len(input_data)} bytes of raw input data")
        
        try:
            # Process with offchain_logic
            result_dict = offchain_logic.handle_order_request(input_payload_hex)
            
            # Handle errors
            if result_dict.get("type") == "error":
                error_message = result_dict.get("message", "Unknown error in offchain_logic")
                logger.error(f"offchain_logic error: {error_message}")
                return jsonify({
                    "error": error_message,
                    "details": result_dict.get("details", {})
                }), 500
                
            # Convert hex back to binary for response
            output_hex = result_dict.get("payload", "0x")
            if output_hex.startswith("0x"):
                output_hex = output_hex[2:]
                
            output_binary = binascii.unhexlify(output_hex)
            logger.info(f"Returning {len(output_binary)} bytes of raw output data")
            
            # Return binary response
            return output_binary, 200, {'Content-Type': 'application/octet-stream'}
            
        except Exception as e:
            logger.error(f"Error processing with offchain_logic: {e}")
            logger.error(traceback.format_exc())
            return jsonify({
                "error": "Execution error",
                "message": str(e)
            }), 500
            
    except Exception as e:
        logger.error(f"Server error processing raw request: {e}")
        return jsonify({
            "error": "Server error",
            "message": str(e)
        }), 500

if __name__ == '__main__':
    logger.info("Starting Python runner service on port 5000")
    # Make sure to bind to 0.0.0.0 to be accessible from other Docker containers
    app.run(host='0.0.0.0', port=5000, debug=os.environ.get("FLASK_DEBUG", "0") == "1")
