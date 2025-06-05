import uuid
from flask import request, g
import time

def request_middleware(app):
    """
    Middleware to add request ID and timing to every request
    """
    @app.before_request
    def before_request():
        # Generate a unique request ID
        request.id = str(uuid.uuid4())
        # Store start time for request timing
        g.start_time = time.time()
        # Log incoming request
        app.logger.info(f"Request {request.id}: {request.method} {request.path}")
        
    @app.after_request
    def after_request(response):
        # Calculate request duration
        if hasattr(g, 'start_time'):
            duration = time.time() - g.start_time
            # Add timing header
            response.headers['X-Request-Time'] = str(duration)
            # Add request ID header
            response.headers['X-Request-ID'] = request.id
            # Log completion
            app.logger.info(f"Request {request.id} completed in {duration:.4f}s with status {response.status_code}")
        return response
