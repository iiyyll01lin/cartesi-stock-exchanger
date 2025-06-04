#!/bin/bash
# Enhanced Network Fallback Script for Cartesi Stock Exchange
# This script detects network conditions and configures build tools for optimal connectivity

set -e

echo "🔍 Enhanced Network Connectivity Detector"
echo "========================================"

# Function to log with colors
log_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

log_warning() {
    echo -e "\033[1;33m[WARNING]\033[0m $1"
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# Default proxy settings
DEFAULT_PROXY_URL="http://10.6.254.210:3128"
BACKUP_PROXY_URL="http://proxy-fallback.internal:3128"
PIP_TIMEOUT=600
PIP_RETRIES=15
NPM_RETRIES=5
NPM_TIMEOUT=300000
CONNECTION_TYPE="unknown"
FALLBACK_MODE="none"

# Detect package manager
PYTHON_AVAILABLE=false
NPM_AVAILABLE=false

if command -v pip >/dev/null 2>&1; then
    PYTHON_AVAILABLE=true
    log_info "Python/pip detected"
fi

if command -v npm >/dev/null 2>&1; then
    NPM_AVAILABLE=true
    log_info "Node.js/npm detected"
fi

# Function to test connectivity
test_connectivity() {
    local url=$1
    local timeout=${2:-10}
    local description=${3:-"endpoint"}
    
    log_info "Testing connectivity to $description ($url)..."
    if timeout $timeout curl -s --connect-timeout $((timeout / 2)) --max-time $timeout "$url" >/dev/null 2>&1; then
        log_success "✓ Connection to $description is working"
        return 0
    else
        log_warning "✗ Cannot connect to $description"
        return 1
    fi
}

# Test direct internet connectivity
test_connectivity "https://google.com" 8 "Internet" && DIRECT_INTERNET=true || DIRECT_INTERNET=false

# Test package repositories
if [ "$DIRECT_INTERNET" = true ]; then
    # Test primary Python repository
    test_connectivity "https://pypi.org/simple/" 10 "PyPI" && PYPI_DIRECT=true || PYPI_DIRECT=false
    
    # Test Python package repository mirrors
    test_connectivity "https://files.pythonhosted.org" 10 "PyPI CDN" && PYPI_CDN=true || PYPI_CDN=false
    
    # Test npm registry
    test_connectivity "https://registry.npmjs.org/" 10 "npm registry" && NPM_DIRECT=true || NPM_DIRECT=false
else
    log_warning "No direct internet connectivity, skipping repository tests"
    PYPI_DIRECT=false
    PYPI_CDN=false
    NPM_DIRECT=false
fi

# Test primary proxy
test_connectivity "$DEFAULT_PROXY_URL" 10 "primary proxy" && PRIMARY_PROXY=true || PRIMARY_PROXY=false

# Test backup proxy if primary fails
if [ "$PRIMARY_PROXY" = false ]; then
    test_connectivity "$BACKUP_PROXY_URL" 10 "backup proxy" && BACKUP_PROXY=true || BACKUP_PROXY=false
else
    BACKUP_PROXY=false
fi

# Determine connection strategy
if [ "$PRIMARY_PROXY" = true ]; then
    CONNECTION_TYPE="primary_proxy"
    PROXY_URL="$DEFAULT_PROXY_URL"
    log_info "Using primary proxy for package installation"
elif [ "$BACKUP_PROXY" = true ]; then
    CONNECTION_TYPE="backup_proxy"
    PROXY_URL="$BACKUP_PROXY_URL"
    log_info "Using backup proxy for package installation"
elif [ "$PYPI_DIRECT" = true ] || [ "$NPM_DIRECT" = true ]; then
    CONNECTION_TYPE="direct"
    PROXY_URL=""
    log_info "Using direct connection for package installation"
else
    CONNECTION_TYPE="offline"
    PROXY_URL=""
    log_warning "No connectivity detected, using offline mode"
    FALLBACK_MODE="offline"
fi

# Configure pip if Python is available
if [ "$PYTHON_AVAILABLE" = true ]; then
    log_info "Configuring pip for $CONNECTION_TYPE connection..."
    
    # Base pip configuration for resilience
    pip config set global.timeout "$PIP_TIMEOUT" 2>/dev/null || true
    pip config set global.retries "$PIP_RETRIES" 2>/dev/null || true
    pip config set global.trusted-host "pypi.org files.pythonhosted.org pypi.python.org" 2>/dev/null || true
    
    # Connection-specific configuration
    if [ "$CONNECTION_TYPE" = "primary_proxy" ] || [ "$CONNECTION_TYPE" = "backup_proxy" ]; then
        pip config set global.proxy "$PROXY_URL" 2>/dev/null || true
        pip config set global.trusted-host "pypi.org files.pythonhosted.org pypi.python.org $(echo $PROXY_URL | sed 's|http://||' | sed 's|https://||' | sed 's|:.*||')" 2>/dev/null || true
    elif [ "$CONNECTION_TYPE" = "direct" ]; then
        pip config unset global.proxy 2>/dev/null || true
    elif [ "$CONNECTION_TYPE" = "offline" ]; then
        # Offline mode requires pre-downloaded packages
        pip config set global.no-index "true" 2>/dev/null || true
        if [ -d "./packages-cache/pip" ]; then
            pip config set global.find-links "file://$(pwd)/packages-cache/pip" 2>/dev/null || true
            log_info "Configured pip to use local package cache"
        else
            log_warning "No local pip package cache found at ./packages-cache/pip"
        fi
    fi
    
    log_success "pip configured for $CONNECTION_TYPE connection"
fi

# Configure npm if Node.js is available
if [ "$NPM_AVAILABLE" = true ]; then
    log_info "Configuring npm for $CONNECTION_TYPE connection..."
    
    # Base npm configuration for resilience
    npm config set fetch-retries "$NPM_RETRIES" 2>/dev/null || true
    npm config set fetch-retry-mintimeout 20000 2>/dev/null || true
    npm config set fetch-retry-maxtimeout "$NPM_TIMEOUT" 2>/dev/null || true
    npm config set timeout "$NPM_TIMEOUT" 2>/dev/null || true
    npm config set registry "https://registry.npmjs.org/" 2>/dev/null || true
    
    # Connection-specific configuration
    if [ "$CONNECTION_TYPE" = "primary_proxy" ] || [ "$CONNECTION_TYPE" = "backup_proxy" ]; then
        npm config set proxy "$PROXY_URL" 2>/dev/null || true
        npm config set https-proxy "$PROXY_URL" 2>/dev/null || true
    elif [ "$CONNECTION_TYPE" = "direct" ]; then
        npm config delete proxy 2>/dev/null || true
        npm config delete https-proxy 2>/dev/null || true
    elif [ "$CONNECTION_TYPE" = "offline" ]; then
        npm config set offline true 2>/dev/null || true
        if [ -d "./packages-cache/npm" ]; then
            log_info "npm offline mode will use cached packages"
        else
            log_warning "No local npm package cache found at ./packages-cache/npm"
        fi
    fi
    
    log_success "npm configured for $CONNECTION_TYPE connection"
fi

# Export environment variables for Docker builds
export NETWORK_CONNECTION_TYPE="$CONNECTION_TYPE"
export NETWORK_FALLBACK_MODE="$FALLBACK_MODE"

if [ -n "$PROXY_URL" ]; then
    export HTTP_PROXY="$PROXY_URL"
    export HTTPS_PROXY="$PROXY_URL"
    export http_proxy="$PROXY_URL"
    export https_proxy="$PROXY_URL"
    export PROXY_CONFIGURED="true"
else
    unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
    export PROXY_CONFIGURED="false"
fi

# Final connectivity report
echo ""
echo "📊 Network Connectivity Report"
echo "=============================="
echo "• Direct Internet: $([ "$DIRECT_INTERNET" = true ] && echo "✓ Available" || echo "✗ Unavailable")"
echo "• PyPI Direct: $([ "$PYPI_DIRECT" = true ] && echo "✓ Available" || echo "✗ Unavailable")"
echo "• npm Registry: $([ "$NPM_DIRECT" = true ] && echo "✓ Available" || echo "✗ Unavailable")"
echo "• Primary Proxy: $([ "$PRIMARY_PROXY" = true ] && echo "✓ Available ($DEFAULT_PROXY_URL)" || echo "✗ Unavailable")"
echo "• Backup Proxy: $([ "$BACKUP_PROXY" = true ] && echo "✓ Available ($BACKUP_PROXY_URL)" || echo "✗ Unavailable")"
echo ""
echo "🔧 Configuration Applied"
echo "• Connection Type: $CONNECTION_TYPE"
echo "• Fallback Mode: $FALLBACK_MODE"
if [ -n "$PROXY_URL" ]; then
    echo "• Proxy URL: $PROXY_URL"
fi
echo ""

# Output status for programmatic use
if [ "$CONNECTION_TYPE" != "offline" ]; then
    echo "Network connectivity configured successfully"
    exit 0
else
    echo "Warning: Using offline mode due to no connectivity"
    exit 101  # Use non-zero but non-error exit code for offline mode
fi
