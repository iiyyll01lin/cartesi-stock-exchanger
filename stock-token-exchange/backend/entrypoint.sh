#!/bin/bash

echo "=== Starting Flask Backend Service ==="

# Setup network connectivity using existing proxy scripts
echo "Setting up network connectivity..."
if [ -f "/scripts_global/setup-proxy.sh" ]; then
    echo "Using proxy configuration script..."
    source /scripts_global/setup-proxy.sh
else
    echo "Proxy configuration script not found, proceeding with direct connection"
fi

# Install dependencies at runtime to handle volume mount override
echo "Installing Python dependencies (volume mount override fix)..."
if [ "$USE_PROXY" = "true" ]; then
    echo "Installing with proxy configuration..."
    pip3 install --default-timeout=200 --no-cache-dir -r requirements.txt || {
        echo "Proxy installation failed, trying without proxy..."
        unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
        pip3 install --default-timeout=200 --no-cache-dir -r requirements.txt || {
            echo "ERROR: Failed to install Python dependencies with and without proxy"
            exit 1
        }
    }
else
    echo "Installing with direct connection..."
    pip3 install --default-timeout=200 --no-cache-dir -r requirements.txt || {
        echo "ERROR: Failed to install Python dependencies"
        exit 1
    }
fi

# Verify Flask is available
echo "Verifying Python dependencies..."
python3 -c "import flask; print(f'✓ Flask {flask.__version__} available')" || {
  echo "ERROR: Flask still not available after installation"
  exit 1
}

echo "All dependencies verified successfully!"
echo "Waiting for contract deployments..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if [ -f "/app/.env" ]; then
        echo "Loading environment variables from /app/.env"
        # Use set -a to export all variables, then source the file, then turn off auto-export
        set -a
        source /app/.env
        set +a
        if [ -n "$EXCHANGE_CONTRACT_ADDRESS" ] && [ "$EXCHANGE_CONTRACT_ADDRESS" != "0x0000000000000000000000000000000000000000" ] && \
           [ -n "$STOCK_TOKEN_ADDRESS" ] && [ "$STOCK_TOKEN_ADDRESS" != "0x0000000000000000000000000000000000000000" ]; then
            echo "Found valid contract addresses:"
            echo "EXCHANGE_CONTRACT_ADDRESS: $EXCHANGE_CONTRACT_ADDRESS"
            echo "STOCK_TOKEN_ADDRESS: $STOCK_TOKEN_ADDRESS"
            break
        fi
    fi
    RETRY_COUNT=$((RETRY_COUNT+1))
    echo "Waiting for valid contract addresses... Attempt $RETRY_COUNT/$MAX_RETRIES"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "ERROR: Timed out waiting for valid contract addresses. Proceeding with default values."
fi

# Start Flask server
echo "Starting Flask server..."
exec python server.py
