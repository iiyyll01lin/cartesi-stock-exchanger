#!/bin/bash

# This script updates the .env file with contract addresses after deployment

# Set the path to the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE_FILE="$ROOT_DIR/.env.example"

# Check if .env file exists, if not create from example
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file from .env.example..."
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
fi

# Function to update a value in the .env file
update_env_value() {
    local key=$1
    local value=$2
    
    # Check if the key exists in the file
    if grep -q "^$key=" "$ENV_FILE"; then
        # Replace the existing value
        sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
    else
        # Add the key-value pair
        echo "$key=$value" >> "$ENV_FILE"
    fi
    
    echo "Updated $key to $value"
}

# Process arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --exchange-address)
            EXCHANGE_ADDRESS="$2"
            shift 2
            ;;
        --token-address)
            TOKEN_ADDRESS="$2"
            shift 2
            ;;
        --template-hash)
            TEMPLATE_HASH="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Update environment variables if values were provided
if [ ! -z "$EXCHANGE_ADDRESS" ]; then
    update_env_value "EXCHANGE_CONTRACT_ADDRESS" "$EXCHANGE_ADDRESS"
fi

if [ ! -z "$TOKEN_ADDRESS" ]; then
    update_env_value "STOCK_TOKEN_ADDRESS" "$TOKEN_ADDRESS"
fi

if [ ! -z "$TEMPLATE_HASH" ]; then
    update_env_value "CARTESI_TEMPLATE_HASH" "$TEMPLATE_HASH"
fi

echo "Environment file updated successfully!"