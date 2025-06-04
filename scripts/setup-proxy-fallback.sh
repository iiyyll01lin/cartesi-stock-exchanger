#!/bin/bash
# Universal proxy setup for all containers

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

setup_proxy_fallback() {
    HTTP_PROXY=${HTTP_PROXY:-$PROXY_URL}
    HTTPS_PROXY=${HTTPS_PROXY:-$PROXY_URL}

    log_info "Setting up proxy fallback mechanisms..."
    
    if [ -n "$HTTP_PROXY" ]; then
        log_info "Using proxy: $HTTP_PROXY"
        
        # APT proxy
        if [ -d "/etc/apt" ]; then
            log_info "Configuring APT proxy"
            mkdir -p /etc/apt/apt.conf.d
            echo "Acquire::http::Proxy \"$HTTP_PROXY\";" > /etc/apt/apt.conf.d/01proxy
            echo "Acquire::https::Proxy \"$HTTPS_PROXY\";" >> /etc/apt/apt.conf.d/01proxy
        fi
        
        # PIP proxy
        if command -v pip &>/dev/null; then
            log_info "Configuring PIP proxy"
            mkdir -p ~/.pip
            cat > ~/.pip/pip.conf << EOF
[global]
timeout = ${PIP_TIMEOUT:-300}
retries = ${PIP_RETRIES:-10}
proxy = ${HTTP_PROXY}
trusted-host = pypi.org
               pypi.python.org
               files.pythonhosted.org
[install]
prefer-binary = true
EOF
        fi
        
        # NPM proxy
        if command -v npm &>/dev/null; then
            log_info "Configuring NPM proxy"
            npm config set proxy $HTTP_PROXY
            npm config set https-proxy $HTTPS_PROXY
            npm config set registry http://registry.npmjs.org/
            npm config set strict-ssl false
        fi
        
        # Yarn proxy
        if command -v yarn &>/dev/null; then
            log_info "Configuring Yarn proxy"
            yarn config set proxy $HTTP_PROXY
            yarn config set https-proxy $HTTPS_PROXY
        fi
        
        log_success "Proxy configuration complete"
    else
        log_info "No proxy configured, using direct connections"
        
        # Configure trusted hosts and timeouts for pip
        if command -v pip &>/dev/null; then
            log_info "Configuring PIP for direct connection"
            mkdir -p ~/.pip
            cat > ~/.pip/pip.conf << EOF
[global]
timeout = ${PIP_TIMEOUT:-600}
retries = ${PIP_RETRIES:-15}
trusted-host = pypi.org
               pypi.python.org
               files.pythonhosted.org
[install]
prefer-binary = true
EOF
        fi
    fi
}

# Execute setup if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    setup_proxy_fallback
fi