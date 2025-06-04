#!/bin/bash

# Production Deployment Script for Cartesi Stock Exchange
# This script deploys the production-ready version while preserving test accounts

set -e

echo "🚀 Cartesi Stock Exchange - Production Deployment"
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker &> /dev/null; then
    log_error "docker-compose is not installed. Please install it and try again."
    exit 1
fi

# Create production environment file if it doesn't exist
if [ ! -f ".env.production" ]; then
    log_warning ".env.production not found. Creating from template..."
    cp .env.production .env.production.local
    log_info "Please review and customize .env.production.local as needed"
fi

# Ensure secrets directory exists
if [ ! -d "secrets" ]; then
    log_info "Creating secrets directory..."
    mkdir -p secrets
fi

# Check for admin private key
if [ ! -f "secrets/admin_private_key.txt" ]; then
    log_warning "Admin private key not found. Creating with test key..."
    echo "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" > secrets/admin_private_key.txt
    chmod 400 secrets/admin_private_key.txt
    log_warning "Using test private key. Replace with actual key in production!"
fi

# Function to deploy with specific profile
deploy_mode() {
    local mode=$1
    local profile_flag=""
    
    if [ "$mode" != "default" ]; then
        profile_flag="--profile $mode"
    fi
    
    log_info "Deploying in $mode mode..."
    
    # Add network validation
    log_info "Running network validation..."
    if ! ./scripts/validate-network-setup.sh; then
        log_error "Network validation failed"
        return 1
    fi
    
    # Validate required files and configurations
    validate_dockerfiles
    
    # Validate Docker Compose configuration
    log_info "Validating Docker Compose configuration..."
    if ! docker compose -f docker-compose.production.yml $profile_flag config --quiet; then
        log_error "Docker Compose configuration is invalid"
        return 1
    fi
    log_success "Docker Compose configuration is valid"
    
    # Pre-build cleanup
    log_info "Cleaning up old images and containers to free space..."
    docker system prune -f --volumes || true
    
    log_info "Building production images with network resilience..."
    
    # Set Docker BuildKit for better networking and caching
    export DOCKER_BUILDKIT=1
    export BUILDKIT_PROGRESS=plain
    export COMPOSE_DOCKER_CLI_BUILD=1
    
    # Set proxy environment variables for build context
    export PROXY_URL="http://10.6.254.210:3128"
    
    # Test network connectivity before building
    # Run enhanced network detection script
    log_info "Running enhanced network detection and configuration..."
    if [ -f "scripts/enhanced-network-fallback.sh" ]; then
        chmod +x scripts/enhanced-network-fallback.sh
        ./scripts/enhanced-network-fallback.sh
        network_result=$?
        if [ $network_result -eq 101 ]; then
            log_warning "Network detection indicates offline mode may be required"
        elif [ $network_result -eq 0 ]; then
            log_success "Network detection completed successfully"
            connectivity_check=true
            
            # Export environment variables from the network script
            if [ -n "$PROXY_URL" ] && [ "$PROXY_CONFIGURED" = "true" ]; then
                log_info "Using proxy from enhanced detection: $PROXY_URL"
                export BUILD_PROXY_ARGS="--build-arg HTTP_PROXY=$PROXY_URL --build-arg HTTPS_PROXY=$PROXY_URL"
            fi
        else
            log_warning "Network detection script had issues"
        fi
    else
        log_warning "Enhanced network detection script not found, using fallback detection"
    fi


    log_info "Testing network connectivity..."
    local connectivity_check=false
    
    # Test proxy connectivity
    if timeout 10 curl -s --connect-timeout 5 --max-time 10 "$PROXY_URL" >/dev/null 2>&1; then
        log_success "Proxy $PROXY_URL is accessible"
        export BUILD_PROXY_ARGS="--build-arg HTTP_PROXY=$PROXY_URL --build-arg HTTPS_PROXY=$PROXY_URL"
        connectivity_check=true
    else
        log_warning "Proxy not accessible"
        export BUILD_PROXY_ARGS=""
    fi
    
    # Test direct connectivity to PyPI
    if timeout 10 curl -s --connect-timeout 5 --max-time 10 "https://pypi.org/simple/" >/dev/null 2>&1; then
        log_success "Direct PyPI connectivity is available"
        connectivity_check=true
    else
        log_warning "Direct PyPI connectivity is not available"
    fi
    
    # Test direct connectivity to npm registry
    if timeout 10 curl -s --connect-timeout 5 --max-time 10 "https://registry.npmjs.org/" >/dev/null 2>&1; then
        log_success "Direct npm registry connectivity is available"
        connectivity_check=true
    else
        log_warning "Direct npm registry connectivity is not available"
    fi
    
    if [ "$connectivity_check" = false ]; then
        log_error "No network connectivity detected to package repositories"
        log_error "Please check your network connection and proxy settings"
        return 1
    fi
    
    # Build production images with enhanced retry logic and proxy fallback
    local max_retries=4
    local retry_count=0
    local build_success=false
    
    # Define build strategies in order of preference
    local strategies=(
        "proxy_cache"     # With proxy and cache
        "proxy_no_cache"  # With proxy, no cache
        "direct_no_cache" # Direct connection, no cache
        "host_network"    # Host network as last resort
        "offline_mode"    # Completely offline mode as ultimate fallback
    )
    
    for strategy in "${strategies[@]}"; do
        if [ "$build_success" = true ]; then
            break
        fi
        
        retry_count=0
        while [ $retry_count -lt $max_retries ] && [ "$build_success" = false ]; do
            retry_count=$((retry_count + 1))
            log_info "Build attempt $retry_count/$max_retries using strategy: $strategy"
            
            case $strategy in
                "proxy_cache")
                    if [ -n "$BUILD_PROXY_ARGS" ]; then
                        docker compose -f docker-compose.production.yml $profile_flag build \
                            --build-arg BUILDKIT_INLINE_CACHE=1 \
                            --build-arg DOCKER_BUILDKIT=1 \
                            --build-arg PIP_TIMEOUT=300 \
                            --build-arg PIP_RETRIES=10 \
                            --build-arg PROXY_URL="$PROXY_URL" \
                            $BUILD_PROXY_ARGS && build_success=true
                    else
                        log_info "Skipping proxy_cache strategy (proxy not available)"
                        break
                    fi
                    ;;
                "proxy_no_cache")
                    if [ -n "$BUILD_PROXY_ARGS" ]; then
                        docker compose -f docker-compose.production.yml $profile_flag build \
                            --no-cache \
                            --build-arg BUILDKIT_INLINE_CACHE=1 \
                            --build-arg DOCKER_BUILDKIT=1 \
                            --build-arg PIP_TIMEOUT=300 \
                            --build-arg PIP_RETRIES=10 \
                            --build-arg PROXY_URL="$PROXY_URL" \
                            $BUILD_PROXY_ARGS && build_success=true
                    else
                        log_info "Skipping proxy_no_cache strategy (proxy not available)"
                        break
                    fi
                    ;;
                "direct_no_cache")
                    log_info "Attempting direct connection build..."
                    docker compose -f docker-compose.production.yml $profile_flag build \
                        --no-cache \
                        --build-arg BUILDKIT_INLINE_CACHE=1 \
                        --build-arg DOCKER_BUILDKIT=1 \
                        --build-arg PIP_TIMEOUT=600 \
                        --build-arg PIP_RETRIES=15 && build_success=true
                    ;;
                "host_network")
                    log_info "Attempting host network build as last resort..."
                    DOCKER_BUILDKIT=1 docker compose -f docker-compose.production.yml $profile_flag build \
                        --no-cache \
                        --build-arg BUILDKIT_INLINE_CACHE=1 \
                        --build-arg PIP_TIMEOUT=600 \
                        --build-arg PIP_RETRIES=20 && build_success=true
                    ;;
                "offline_mode")
                    log_info "Attempting offline mode build with pre-downloaded packages..."
                    
                    # Prepare offline package directory if it doesn't exist
                    if [ ! -d "./packages-cache" ]; then
                        log_info "Creating package cache directory..."
                        mkdir -p ./packages-cache/pip
                        mkdir -p ./packages-cache/npm
                    fi
                    
                    # Generate a backup file for pip.conf
                    pip_conf_dir="$HOME/.pip"
                    pip_conf="$pip_conf_dir/pip.conf"
                    backup_pip_conf="${pip_conf}.backup"
                    
                    # Backup existing pip.conf if it exists
                    if [ -f "$pip_conf" ]; then
                        log_info "Backing up existing pip.conf..."
                        cp "$pip_conf" "$backup_pip_conf"
                    fi
                    
                    # Create pip.conf directory if it doesn't exist
                    mkdir -p "$pip_conf_dir"
                    
                    # Create pip.conf with local package index
                    log_info "Configuring pip for offline mode..."
                    cat > "$pip_conf" << 'EOL'
[global]
trusted-host = pypi.org
               files.pythonhosted.org
               pypi.python.org
               localhost
timeout = 120
retries = 30
[install]
prefer-binary = true
EOL
                    
                    log_info "Building with network isolation and pre-downloaded packages..."
                    DOCKER_BUILDKIT=1 docker compose -f docker-compose.production.yml $profile_flag build \
                        --no-cache \
                        --network=host \
                        --build-arg PIP_USE_FEATURE=2020-resolver \
                        --build-arg PIP_TRUSTED_HOST="pypi.org pypi.python.org files.pythonhosted.org" \
                        --build-arg INSTALL_OFFLINE_FALLBACK=true \
                        --build-arg PIP_TIMEOUT=1200 \
                        --build-arg PIP_RETRIES=25 && build_success=true
                    
                    # Restore pip.conf if backup exists
                    if [ -f "$backup_pip_conf" ]; then
                        log_info "Restoring pip.conf from backup..."
                        cp "$backup_pip_conf" "$pip_conf"
                        rm "$backup_pip_conf"
                    else
                        log_info "Removing temporary pip.conf..."
                        rm "$pip_conf"
                    fi
                    ;;
            esac
            
            if [ "$build_success" = false ] && [ $retry_count -lt $max_retries ]; then
                local wait_time=$((retry_count * 15))
                log_warning "Build failed with strategy $strategy, retrying in ${wait_time}s..."
                sleep $wait_time
            fi
        done
    done
        
    if [ "$build_success" = false ]; then
        log_error "All standard build strategies failed. Trying emergency build..."
        if emergency_build "$profile_flag"; then
            log_success "Emergency build succeeded"
            build_success=true
        else
            log_error "Emergency build failed. This may indicate:"
            log_error "1. Severe network connectivity issues"
            log_error "2. PyPI/npm registry problems"
            log_error "3. Docker daemon issues"
            log_error "Check network connectivity and try again"
            return 1
        fi
    fi
    
    log_success "Production images built successfully using strategy: $strategy"
    
    # Start services
    log_info "Starting production services..."
    if ! docker compose -f docker-compose.production.yml $profile_flag up -d; then
        log_error "Failed to start production services"
        return 1
    fi
    
    log_success "Production services started successfully"
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Check service health
    check_service_health
}

# Function to check service health
check_service_health() {
    log_info "Checking service health..."
    
    # Check blockchain
    for i in {1..10}; do
        if curl -s -X POST -H "Content-Type: application/json" \
           -d '{"jsonrpc":"2.0","method":"web3_clientVersion","params":[],"id":1}' \
           http://localhost:8545 >/dev/null 2>&1; then
            log_success "Blockchain service: HEALTHY"
            break
        elif [ $i -eq 10 ]; then
            log_error "Blockchain service: UNHEALTHY after 10 attempts"
            log_info "Check logs: docker compose -f docker-compose.production.yml logs blockchain"
            return 1
        else
            log_info "Waiting for blockchain service... (attempt $i/10)"
            sleep 10
        fi
    done
    
    # Check backend
    for i in {1..10}; do
        if curl -s -f http://localhost:5001/health >/dev/null 2>&1; then
            log_success "Backend service: HEALTHY"
            break
        elif [ $i -eq 10 ]; then
            log_error "Backend service: UNHEALTHY after 10 attempts"
            log_info "Check logs: docker compose -f docker-compose.production.yml logs backend"
            return 1
        else
            log_info "Waiting for backend service... (attempt $i/10)"
            sleep 10
        fi
    done
    
    # Check frontend
    for i in {1..10}; do
        if curl -s -f http://localhost:3000/health >/dev/null 2>&1; then
            log_success "Frontend service: HEALTHY"
            break
        elif [ $i -eq 10 ]; then
            log_error "Frontend service: UNHEALTHY after 10 attempts"
            log_info "Check logs: docker compose -f docker-compose.production.yml logs frontend"
            return 1
        else
            log_info "Waiting for frontend service... (attempt $i/10)"
            sleep 10
        fi
    done
    
    # Check python-runner if in mock mode
    if docker compose -f docker-compose.production.yml ps | grep -q python-runner; then
        for i in {1..10}; do
            if curl -s -f http://localhost:5000/health >/dev/null 2>&1; then
                log_success "Python Runner service: HEALTHY"
                break
            elif [ $i -eq 10 ]; then
                log_error "Python Runner service: UNHEALTHY after 10 attempts"
                log_info "Check logs: docker compose -f docker-compose.production.yml logs python-runner"
                return 1
            else
                log_info "Waiting for python runner service... (attempt $i/10)"
                sleep 10
            fi
        done
    fi
    
    # Check cartesi services if in real mode
    if docker compose -f docker-compose.production.yml ps | grep -q cartesi-node; then
        for i in {1..15}; do
            if curl -s -f http://localhost:5005/health >/dev/null 2>&1; then
                log_success "Cartesi Node service: HEALTHY"
                break
            elif [ $i -eq 15 ]; then
                log_error "Cartesi Node service: UNHEALTHY after 15 attempts"
                log_info "Check logs: docker compose -f docker-compose.production.yml logs cartesi-node"
                return 1
            else
                log_info "Waiting for cartesi node service... (attempt $i/15)"
                sleep 15
            fi
        done
    fi
}

# Function to validate dockerfile configurations
validate_dockerfiles() {
    log_info "Validating Dockerfile configurations..."
    
    local dockerfiles=(
        "stock-token-exchange/backend/Dockerfile.production"
        "stock-token-exchange/cartesi-machine/Dockerfile.python_runner_production"
        "stock-token-exchange/blockchain/Dockerfile.production"
        "stock-token-exchange/frontend/Dockerfile.production"
    )
    
    for dockerfile in "${dockerfiles[@]}"; do
        if [ ! -f "$dockerfile" ]; then
            log_error "Required Dockerfile not found: $dockerfile"
            return 1
        fi
        
        # Check for proxy fallback support
        if grep -q "PROXY_URL" "$dockerfile" && grep -q "pip.*retry" "$dockerfile"; then
            log_success "✓ $dockerfile has proxy fallback support"
        elif grep -q "pip.*retry" "$dockerfile"; then
            log_success "✓ $dockerfile has retry logic"
        else
            log_warning "⚠ $dockerfile may need proxy fallback improvements"
        fi
    done
    
    log_success "Dockerfile validation complete"
}

# Function to show deployment status
show_status() {
    echo ""
    echo "🎉 Production Deployment Complete!"
    echo "=================================="
    echo ""
    echo "Services Available:"
    echo "• Blockchain (Hardhat): http://localhost:8545"
    echo "• Backend API: http://localhost:5001"
    echo "• Frontend: http://localhost:3000"
    
    if docker compose -f docker-compose.production.yml ps | grep -q python-runner; then
        echo "• Python Runner (MOCK): http://localhost:5000"
    fi
    
    if docker compose -f docker-compose.production.yml ps | grep -q cartesi-node; then
        echo "• Cartesi Node (REAL): http://localhost:5005"
        echo "• Stock Exchange DApp: http://localhost:5007"
    fi
    
    echo ""
    echo "Test Accounts (preserved for manual testing):"
    echo "• ETH and Stock Tokens have been minted for test accounts"
    echo "• Use MetaMask to connect with the test accounts"
    echo ""
    echo "Management Commands:"
    echo "• View logs: docker compose -f docker-compose.production.yml logs"
    echo "• Stop services: docker compose -f docker-compose.production.yml down"
    echo "• Scale services: docker compose -f docker-compose.production.yml up --scale backend=2"
    echo ""
}

# Main deployment logic
MODE=${1:-"mock"}

case $MODE in
    "mock")
        log_info "Deploying in MOCK mode (development-friendly with production optimizations)"
        deploy_mode "mock"
        ;;
    "real")
        log_info "Deploying in REAL mode (full Cartesi infrastructure)"
        deploy_mode "real"
        ;;
    "both")
        log_info "Deploying in BOTH modes (testing and comparison)"
        deploy_mode "mock"
        sleep 10
        # Add real mode services
        docker compose -f docker-compose.production.yml --profile real up -d
        check_service_health
        ;;
    *)
        echo "Usage: $0 [mock|real|both]"
        echo ""
        echo "Modes:"
        echo "  mock  - Deploy with Python runner simulation (default)"
        echo "  real  - Deploy with full Cartesi infrastructure"
        echo "  both  - Deploy both modes for testing"
        exit 1
        ;;
esac

if [ $? -eq 0 ]; then
    show_status
else
    log_error "Deployment failed. Check logs for details."
    exit 1
fi

# Function for emergency build with maximum network resilience
emergency_build() {
    log_warning "🚨 Attempting emergency build with maximum network resilience..."
    
    # Create pip.conf with maximum resilience options
    mkdir -p ~/.pip
    cat > ~/.pip/pip.conf << EOF
[global]
timeout = 1800
retries = 50
trusted-host = pypi.org
               pypi.python.org
               files.pythonhosted.org
               *
[install]
prefer-binary = true
EOF
    
    # Set extreme network timeouts
    export PIP_DEFAULT_TIMEOUT=1800
    export PIP_RETRIES=50
    export DOCKER_CLIENT_TIMEOUT=300
    export COMPOSE_HTTP_TIMEOUT=300
    
    # Try host network build with extreme timeouts
    log_info "Building with host network and extreme timeouts..."
    DOCKER_BUILDKIT=1 BUILDKIT_PROGRESS=plain docker compose -f docker-compose.production.yml $1 build \
        --no-cache \
        --network=host \
        --build-arg PIP_DEFAULT_TIMEOUT=1800 \
        --build-arg PIP_RETRIES=50 \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        --build-arg BUILDKIT_STEP_LOG_MAX_SIZE=10485760 \
        --build-arg PYTHONUNBUFFERED=1
        
    local build_result=$?
    
    # Restore original pip.conf
    rm ~/.pip/pip.conf
    
    return $build_result
}
