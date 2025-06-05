#!/bin/bash
# startup.sh - Enhanced startup script for Cartesi Stock Exchange DApp
# This script provides better debugging and error handling

set -e

echo "=== Cartesi Stock Exchange DApp Startup ==="
echo "Timestamp: $(date)"
echo "Working Directory: $(pwd)"
echo "Python Version: $(python3 --version)"
echo "Environment Variables:"
echo "  EXCHANGE_MODE: ${EXCHANGE_MODE:-not set}"
echo "  LOG_LEVEL: ${LOG_LEVEL:-not set}"
echo "  ROLLUP_HTTP_SERVER_URL: ${ROLLUP_HTTP_SERVER_URL:-not set}"
echo "  ETH_RPC_URL: ${ETH_RPC_URL:-not set}"

echo "=== File System Check ==="
ls -la /app/

echo "=== Python Dependencies Check ==="
python3 -c "
try:
    import eth_abi
    print('✅ eth_abi available')
except ImportError as e:
    print(f'❌ eth_abi not available: {e}')

try:
    import requests
    print('✅ requests available')
except ImportError as e:
    print(f'❌ requests not available: {e}')

import sys
print(f'Python path: {sys.path}')
"

echo "=== Starting Health Server and Main Application ==="
exec python3 /app/health_server.py
