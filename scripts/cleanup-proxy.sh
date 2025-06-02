#!/bin/bash
# Centralized proxy cleanup script
# This script cleans up temporary network configurations

echo "=== Cleaning up network configuration ==="

# Reset npm configuration to defaults
echo "Resetting npm configuration..."
npm config delete fetch-retry-mintimeout 2>/dev/null || true
npm config delete fetch-retry-maxtimeout 2>/dev/null || true
npm config delete timeout 2>/dev/null || true

# Keep essential configurations
npm config set registry https://registry.npmjs.org/
npm config set strict-ssl true

# Unset temporary environment variables
unset HTTP_TIMEOUT
unset HTTPS_TIMEOUT
unset NPM_CONFIG_FETCH_TIMEOUT
unset NPM_CONFIG_FETCH_RETRIES

echo "✓ Network configuration cleanup completed"
