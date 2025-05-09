#!/bin/bash
# filepath: /mnt/d/workspace/cartesi-stock-exchange/create-chainid.sh
# This script creates the required .chainId file in the deployments folder
# to fix the hardhat-deploy error

set -e

# Path to the deployments folder
DEPLOYMENTS_DIR="stock-token-exchange/deployments/localhost"

# Create the directory if it doesn't exist
mkdir -p "${DEPLOYMENTS_DIR}"

# Create .chainId file with the correct local network chain ID (31337)
echo "31337" > "${DEPLOYMENTS_DIR}/.chainId"
echo "Created .chainId file in ${DEPLOYMENTS_DIR}"

# Set permissions
chmod 644 "${DEPLOYMENTS_DIR}/.chainId"

echo "✅ .chainId file created successfully"
echo "This should fix the hardhat-deploy error: 'with hardhat-deploy >= 0.6 you are expected to create a .chainId file'"
