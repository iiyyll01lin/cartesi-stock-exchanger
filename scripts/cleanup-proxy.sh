#!/bin/bash
# Centralized proxy cleanup script
# This script cleans up temporary network configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[PROXY-CLEANUP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[CLEANUP-SUCCESS]${NC} $1"
}

echo "=== Cleaning up network configuration ==="

# Clean proxy configuration
cleanup_proxy() {
    local package_manager=$1
    
    case $package_manager in
        "apt")
            log_info "Cleaning up APT proxy configuration..."
            rm -f /etc/apt/apt.conf.d/01proxy
            ;;
        "pip")
            log_info "Cleaning up PIP proxy configuration..."
            rm -f ~/.pip/pip.conf
            unset PIP_PROXY PIP_TRUSTED_HOST PIP_TIMEOUT PIP_RETRIES 2>/dev/null || true
            unset PIP_DISABLE_PIP_VERSION_CHECK PIP_NO_CACHE_DIR PIP_DEFAULT_TIMEOUT 2>/dev/null || true
            ;;
        "npm")
            log_info "Cleaning up NPM proxy configuration..."
            npm config delete proxy 2>/dev/null || true
            npm config delete https-proxy 2>/dev/null || true
            npm config delete fetch-retry-mintimeout 2>/dev/null || true
            npm config delete fetch-retry-maxtimeout 2>/dev/null || true
            npm config delete timeout 2>/dev/null || true
            npm config delete fetch-retries 2>/dev/null || true
            npm config delete audit 2>/dev/null || true
            npm config delete fund 2>/dev/null || true
            npm config delete update-notifier 2>/dev/null || true
            
            # Reset to defaults
            npm config set registry "https://registry.npmjs.org/"
            npm config set strict-ssl true
            ;;
    esac
    
    log_success "$package_manager proxy configuration cleaned up"
}

# Clean all package managers
cleanup_proxy "apt"
cleanup_proxy "pip"
cleanup_proxy "npm"

# Unset proxy environment variables
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy no_proxy 2>/dev/null || true
unset PROXY_URL BUILD_PROXY_ARGS 2>/dev/null || true
unset HTTP_TIMEOUT HTTPS_TIMEOUT 2>/dev/null || true
unset NPM_CONFIG_FETCH_TIMEOUT NPM_CONFIG_FETCH_RETRIES 2>/dev/null || true
unset DEBIAN_FRONTEND 2>/dev/null || true

log_success "✓ Network configuration cleanup completed"
