#!/usr/bin/env python3
import http.server
import socketserver
import threading
import time
import sys
import os

class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status": "healthy", "service": "stock-exchange-dapp"}')
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress default logging

def start_health_server():
    with socketserver.TCPServer(("", 5007), HealthHandler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    # Start health check server in background
    health_thread = threading.Thread(target=start_health_server, daemon=True)
    health_thread.start()
    
    # Add current directory to Python path
    sys.path.insert(0, "/app")
    
    try:
        # Import and run main application
        import offchain_logic
        print("Stock Exchange DApp starting...")
        if hasattr(offchain_logic, "__main__") or "__main__" in sys.modules:
            exec(open("/app/offchain_logic.py").read())
        else:
            print("Running offchain_logic in standalone mode")
            # Keep the health server running
            while True:
                time.sleep(60)
    except Exception as e:
        print(f"Error starting DApp: {e}")
        # Keep health server running even if main app fails
        while True:
            time.sleep(60)
