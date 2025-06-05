from flask import jsonify

def error_response(error_type, message, status_code=400, details=None):
    """
    Create standardized error response
    
    Args:
        error_type: String identifier for the error type
        message: Human-readable error message
        status_code: HTTP status code
        details: Optional additional context
    """
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
