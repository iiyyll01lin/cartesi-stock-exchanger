#!/bin/bash
# Universal Proxy Setup Script for Docker Containers
# This script provides comprehensive proxy fallback mechanisms for all package managers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[PROXY-SETUP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PROXY-SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[PROXY-WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[PROXY-ERROR]${NC} $1"
}

# Test network connectivity
test_connectivity() {
    local url=$1
    local timeout=${2:-10}
    
    if command -v curl >/dev/null 2>&1; then
        if timeout $timeout curl -s --connect-timeout 5 --max-time $timeout "$url" >/dev/null 2>&1; then
            return 0
        fi
    elif command -v wget >/dev/null 2>&1; then
        if timeout $timeout wget -q --timeout=$timeout -O /dev/null "$url" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# Setup proxy for APT
setup_apt_proxy() {
    if [ -n "$HTTP_PROXY" ] && [ -n "$HTTPS_PROXY" ]; then
        log_info "Setting up APT proxy configuration..."
        
        cat > /etc/apt/apt.conf.d/01proxy << EOF
Acquire::http::Proxy "$HTTP_PROXY";
Acquire::https::Proxy "$HTTPS_PROXY";
Acquire::Retries "10";
Acquire::http::Timeout "300";
Acquire::https::Timeout "300";
EOF
        
        log_success "APT proxy configured"
        return 0
    else
        log_info "No proxy configured for APT, using direct connection"
        return 1
    fi
}

# Setup proxy for PIP
setup_pip_proxy() {
    if [ -n "$HTTP_PROXY" ] && [ -n "$HTTPS_PROXY" ]; then
        log_info "Setting up PIP proxy configuration..."
        
        # Create pip config directory
        mkdir -p ~/.pip
        
        cat > ~/.pip/pip.conf << EOF
[global]
proxy = $HTTP_PROXY
timeout = 300
retries = 10
trusted-host = pypi.org
               pypi.python.org
               files.pythonhosted.org
               localhost
               127.0.0.1
[install]
prefer-binary = true
EOF
        
        # Also set environment variables
        export PIP_PROXY="$HTTP_PROXY"
        export PIP_TRUSTED_HOST="pypi.org pypi.python.org files.pythonhosted.org"
        export PIP_TIMEOUT=300
        export PIP_RETRIES=10
        
        log_success "PIP proxy configured"
        return 0
    else
        log_info "No proxy configured for PIP, using direct connection"
        return 1
    fi
}

# Setup proxy for NPM
setup_npm_proxy() {
    if [ -n "$HTTP_PROXY" ] && [ -n "$HTTPS_PROXY" ]; then
        log_info "Setting up NPM proxy configuration..."
        
        npm config set proxy "$HTTP_PROXY"
        npm config set https-proxy "$HTTPS_PROXY"
        npm config set registry "http://registry.npmjs.org/"
        npm config set fetch-timeout 300000
        npm config set fetch-retry-mintimeout 20000
        npm config set fetch-retry-maxtimeout 120000
        npm config set fetch-retries 10
        
        log_success "NPM proxy configured"
        return 0
    else
        log_info "No proxy configured for NPM, using direct connection"
        return 1
    fi
}

# Configure proxy with fallback
configure_proxy_with_fallback() {
    local package_manager=$1
    local test_url=""
    
    case $package_manager in
        "pip")
            test_url="https://pypi.org/simple/"
            ;;
        "npm")
            test_url="https://registry.npmjs.org/"
            ;;
        "apt")
            test_url="http://archive.ubuntu.com/ubuntu/"
            ;;
    esac
    
    log_info "Configuring $package_manager with proxy fallback..."
    
    # First, try with proxy if configured
    if [ -n "$HTTP_PROXY" ]; then
        log_info "Testing proxy connectivity for $package_manager..."
        
        if test_connectivity "$HTTP_PROXY" 10; then
            log_success "Proxy is accessible, configuring $package_manager with proxy"
            
            case $package_manager in
                "pip") setup_pip_proxy ;;
                "npm") setup_npm_proxy ;;
                "apt") setup_apt_proxy ;;
            esac
            
            # Test if the package repository is accessible through proxy
            if test_connectivity "$test_url" 15; then
                log_success "$package_manager proxy configuration successful"
                return 0
            else
                log_warning "$package_manager repository not accessible through proxy, falling back to direct"
                cleanup_proxy "$package_manager"
            fi
        else
            log_warning "Proxy not accessible, using direct connection for $package_manager"
        fi
    fi
    
    # Fallback to direct connection
    log_info "Testing direct connectivity for $package_manager..."
    if test_connectivity "$test_url" 15; then
        log_success "$package_manager direct connectivity successful"
        return 0
    else
        log_error "$package_manager: No network connectivity available"
        return 1
    fi
}

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
            ;;
        "npm")
            log_info "Cleaning up NPM proxy configuration..."
            npm config delete proxy 2>/dev/null || true
            npm config delete https-proxy 2>/dev/null || true
            npm config set registry "https://registry.npmjs.org/"
            ;;
        "all")
            cleanup_proxy "apt"
            cleanup_proxy "pip"
            cleanup_proxy "npm"
            ;;
    esac
    
    log_success "$package_manager proxy configuration cleaned up"
}

# Main setup function
setup_package_manager() {
    local package_manager=$1
    
    log_info "Setting up $package_manager with comprehensive proxy fallback..."
    
    # Set fallback proxy if not already set
    if [ -z "$HTTP_PROXY" ] && [ -n "$PROXY_URL" ]; then
        export HTTP_PROXY="$PROXY_URL"
        export HTTPS_PROXY="$PROXY_URL"
    fi
    
    # Configure proxy with fallback
    configure_proxy_with_fallback "$package_manager"
    
    # Set additional package manager specific configurations
    case $package_manager in
        "pip")
            # Set additional pip configurations for reliability
            export PIP_DISABLE_PIP_VERSION_CHECK=1
            export PIP_NO_CACHE_DIR=1
            export PIP_DEFAULT_TIMEOUT=300
            export PIP_RETRIES=10
            ;;
        "npm")
            # Set additional npm configurations for reliability
            npm config set audit false
            npm config set fund false
            npm config set update-notifier false
            ;;
        "apt")
            # Set additional apt configurations
            export DEBIAN_FRONTEND=noninteractive
            ;;
    esac
    
    log_success "$package_manager setup complete"
}

# Main execution
echo "=== Setting up enhanced network configuration with proxy fallback ==="

# Set up all package managers
setup_package_manager "apt"
setup_package_manager "pip"
setup_package_manager "npm"

echo "✓ Enhanced network configuration with proxy fallback completed"
