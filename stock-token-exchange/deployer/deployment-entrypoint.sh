#!/bin/bash
set -e

echo "=== Starting Deployer Service ==="

# Wait for blockchain to be ready
echo "Waiting for blockchain service..."
for i in {1..60}; do
    if curl -s -X POST -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","method":"web3_clientVersion","params":[],"id":1}' \
       http://blockchain:8545 >/dev/null 2>&1; then
        echo "✓ Blockchain is ready"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "✗ Blockchain not ready after 60 attempts"
        exit 1
    fi
    echo "Waiting for blockchain... ($i/60)"
    sleep 1
done

# Clean any existing deployments
echo "Cleaning previous deployments..."
rm -rf deployments/localhost artifacts/contracts cache/solidity-files-cache.json 2>/dev/null || true

# Compile contracts
echo "Compiling contracts..."
npx hardhat compile

# Deploy contracts
echo "Deploying contracts..."
npx hardhat run scripts/deploy.js --network localhost

# Update environment file
echo "Updating .env file..."
if [ -f "/app/.env" ]; then
    ./update-env.sh
    echo "✓ Environment file updated"
else
    echo "Warning: .env file not found"
fi

echo "✅ Deployment completed successfully"
