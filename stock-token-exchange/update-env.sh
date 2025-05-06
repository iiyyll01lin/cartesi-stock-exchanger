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
    local file=${3:-"$ENV_FILE"}
    
    echo "Updating $key=$value in $file"
    
    # Using a temporary file approach instead of in-place editing
    # This avoids the "Device or resource busy" error that can happen with sed -i
    # in Docker volume mounts
    if [ -f "$file" ]; then
        # Create a new temp file
        local temp_file=$(mktemp)
        
        # Check if the key exists in the file
        if grep -q "^$key=" "$file"; then
            # Replace the existing value in the temp file
            grep -v "^$key=" "$file" > "$temp_file"
            echo "$key=$value" >> "$temp_file"
        else
            # Copy all content and add the key-value pair
            cat "$file" > "$temp_file"
            echo "$key=$value" >> "$temp_file"
        fi
        
        # Overwrite the original file (this is safer than rename in Docker volumes)
        cat "$temp_file" > "$file"
        rm "$temp_file"
    else
        # If file doesn't exist, create it with just this entry
        echo "$key=$value" > "$file"
    fi
    
    echo "Updated $key in $file"
}

# Function to update a value in a specific .env file
update_env_file() {
    local target_file=$1
    local key=$2
    local value=$3

    # Ensure the directory exists
    mkdir -p "$(dirname "$target_file")"

    # Call the more robust update_env_value function with the target file
    update_env_value "$key" "$value" "$target_file"
}

# Function to update addresses in the frontend deployment file
update_frontend_deployments() {
    local target_file=$1
    local exchange_addr=$2
    local token_addr=$3

    if [ ! -f "$target_file" ]; then
        echo "Error: Frontend deployment file not found: $target_file"
        return 1
    fi

    # Replace addresses using sed (using # as delimiter)
    sed -i "s#export const EXCHANGE_ADDRESS = \".*\";#export const EXCHANGE_ADDRESS = \"$exchange_addr\";#" "$target_file"
    sed -i "s#export const STOCK_TOKEN_ADDRESS = \".*\";#export const STOCK_TOKEN_ADDRESS = \"$token_addr\";#" "$target_file"

    echo "Updated addresses in $target_file"
}

# Default file paths (can be overridden by arguments)
FRONTEND_DEPLOYMENTS_FILE="$ROOT_DIR/frontend/src/deployments/index.ts"
ROOT_ENV_FILE="$ROOT_DIR/.env" # Root .env for deployer to update

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
        --template-hash) # Keep template hash logic if needed for root .env
            TEMPLATE_HASH="$2"
            shift 2
            ;;
        --frontend-deployments)
            FRONTEND_DEPLOYMENTS_FILE="$2" # Override default frontend deployments path
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Update frontend deployment file if addresses are provided
if [ -n "$EXCHANGE_ADDRESS" ] && [ -n "$TOKEN_ADDRESS" ]; then
    update_frontend_deployments "$FRONTEND_DEPLOYMENTS_FILE" "$EXCHANGE_ADDRESS" "$TOKEN_ADDRESS"
fi

# Update root .env file if template hash is provided (optional, kept from original script)
if [ -n "$TEMPLATE_HASH" ]; then
    # Assuming the root .env is still needed for template hash
    ROOT_ENV_FILE="$ROOT_DIR/.env"
    if [ ! -f "$ROOT_ENV_FILE" ]; then
        echo "Creating root .env file..."
        touch "$ROOT_ENV_FILE"
    fi
    update_env_file "$ROOT_ENV_FILE" "CARTESI_TEMPLATE_HASH" "$TEMPLATE_HASH"
fi

# Update root .env file with contract addresses (for backend to source via docker-compose)
if [ -n "$EXCHANGE_ADDRESS" ]; then
    update_env_file "$ROOT_ENV_FILE" "EXCHANGE_CONTRACT_ADDRESS" "$EXCHANGE_ADDRESS"
fi
if [ -n "$TOKEN_ADDRESS" ]; then
    update_env_file "$ROOT_ENV_FILE" "STOCK_TOKEN_ADDRESS" "$TOKEN_ADDRESS"
fi

echo "Environment file updates complete!"