#!/bin/sh

# This script prepares the environment and starts the React app
set -e

echo "=== Setting up the frontend environment ==="

# Ensure the deployments directory exists
mkdir -p /app/src/deployments

# Check if we need to generate deployments file
if [ -f "/app/scripts/generate-deployments.js" ]; then
  echo "Found generate-deployments.js script, attempting to run it..."
  node /app/scripts/generate-deployments.js || echo "Warning: Failed to generate deployments, using default values"
else
  echo "Script /app/scripts/generate-deployments.js not found, using default deployments"
  # Copy deployments from the mounted volume if available
  if [ -d "/app/deployments_src/localhost" ]; then
    echo "Copying deployment files from /app/deployments_src/localhost"
    cp -r /app/deployments_src/localhost/* /app/deployments_src/ || true
  fi
fi

# Start the React app
echo "Starting React application..."
exec npm start
