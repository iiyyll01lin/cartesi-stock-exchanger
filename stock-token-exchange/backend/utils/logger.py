import logging
import traceback
import uuid
import json
from flask import request

logger = logging.getLogger('exchange')

def get_request_id():
    """Get or generate a request ID for correlation"""
    if hasattr(request, 'id'):
        return request.id
    return str(uuid.uuid4())

def log_error(message, error=None, context=None):
    """
    Log error with consistent format and context
    
    Args:
        message: Error message
        error: Exception object
        context: Additional context dictionary
    """
    error_data = {
        "request_id": get_request_id(),
        "message": message,
    }
    
    if error:
        error_data["error_type"] = error.__class__.__name__
        error_data["error_message"] = str(error)
        
    if context:
        error_data["context"] = context
        
    stack_trace = traceback.format_exc() if error else None
    if stack_trace and "NoneType: None" not in stack_trace:
        error_data["stack_trace"] = stack_trace
        
    # Convert to JSON string for proper logging
    logger.error(json.dumps(error_data))
