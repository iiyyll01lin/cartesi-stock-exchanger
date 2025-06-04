#!/usr/bin/env python3
"""
WSGI entry point for Python Runner production deployment with Gunicorn
"""

import os
import sys
from python_runner_server import app

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(__file__))

# WSGI application
application = app

if __name__ == "__main__":
    # This block won't be executed when running with Gunicorn
    app.run(host='0.0.0.0', port=5000, debug=False)
