#!/bin/bash
# Centralized proxy setup script for network resilience
# This script configures npm and pip to work reliably in various network environments

echo "=== Setting up enhanced network configuration ==="

# Enhanced npm configuration for network resilience
echo "Configuring npm for enhanced network resilience..."
npm config set registry https://registry.npmjs.org/
npm config set strict-ssl true
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm config set fetch-retries 5
npm config set timeout 300000
npm config delete proxy 2>/dev/null || true
npm config delete https-proxy 2>/dev/null || true

# Enhanced pip configuration for network resilience
echo "Configuring pip for enhanced network resilience..."
pip3 config set global.timeout 300
pip3 config set global.retries 3
pip3 config set global.index-url https://pypi.org/simple

# Set environment variables for network resilience
export HTTP_TIMEOUT=300
export HTTPS_TIMEOUT=300
export NPM_CONFIG_FETCH_TIMEOUT=300000
export NPM_CONFIG_FETCH_RETRIES=5

echo "✓ Enhanced network configuration completed"
