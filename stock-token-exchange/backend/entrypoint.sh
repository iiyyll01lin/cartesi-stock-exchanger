#!/bin/bash

echo "Waiting for contract deployments..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if [ -f "/app/.env" ]; then
        echo "Loading environment variables from /app/.env"
        export $(grep -v "^#" /app/.env | xargs -0)
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
exec flask run --host=0.0.0.0 --port=5001
