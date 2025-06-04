#!/bin/bash

# Production Validation Script for Cartesi Stock Exchange
# Validates that all production configurations are correct and complete

set -e

echo "🔍 Cartesi Stock Exchange - Production Validation"
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
    echo -e "${GREEN}[✓ PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠ WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗ FAIL]${NC} $1"
}

# Track validation results
VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0

# Function to check if file exists and is not empty
check_file() {
    local file_path=$1
    local description=$2
    
    if [ -f "$file_path" ]; then
        if [ -s "$file_path" ]; then
            log_success "$description exists and is not empty"
        else
            log_warning "$description exists but is empty"
            ((VALIDATION_WARNINGS++))
        fi
    else
        log_error "$description is missing"
        ((VALIDATION_ERRORS++))
    fi
}

# Function to check Docker configurations
check_docker_configs() {
    log_info "Checking Docker configurations..."
    
    # Check production Dockerfiles
    check_file "stock-token-exchange/backend/Dockerfile.production" "Backend production Dockerfile"
    check_file "stock-token-exchange/frontend/Dockerfile.production" "Frontend production Dockerfile"
    check_file "stock-token-exchange/blockchain/Dockerfile.production" "Blockchain production Dockerfile"
    check_file "stock-token-exchange/cartesi-machine/Dockerfile.python_runner_production" "Python runner production Dockerfile"
    check_file "stock-token-exchange/cartesi-machine/Dockerfile.dapp_production" "DApp production Dockerfile"
    
    # Check docker-compose file
    check_file "docker-compose.production.yml" "Production docker-compose file"
    
    # Validate docker-compose syntax
    if command -v docker &> /dev/null; then
        if docker compose -f docker-compose.production.yml config >/dev/null 2>&1; then
            log_success "Production docker-compose syntax is valid"
        else
            log_error "Production docker-compose syntax is invalid"
            ((VALIDATION_ERRORS++))
        fi
    else
        log_warning "Docker not available - cannot validate docker-compose syntax"
        ((VALIDATION_WARNINGS++))
    fi
}

# Function to check environment configurations
check_environment_configs() {
    log_info "Checking environment configurations..."
    
    # Check environment files
    check_file ".env.production" "Production environment file"
    check_file "stock-token-exchange/frontend/.env.production" "Frontend production environment file"
    
    # Check if test token settings are preserved
    if [ -f ".env.production" ]; then
        if grep -q "MINT_TEST_TOKENS=true" .env.production; then
            log_success "Test token minting is enabled in production"
        else
            log_warning "Test token minting may not be enabled in production"
            ((VALIDATION_WARNINGS++))
        fi
        
        if grep -q "TEST_TOKEN_AMOUNT=" .env.production; then
            log_success "Test token amount is configured"
        else
            log_warning "Test token amount may not be configured"
            ((VALIDATION_WARNINGS++))
        fi
    fi
}

# Function to check WSGI configurations
check_wsgi_configs() {
    log_info "Checking WSGI configurations..."
    
    check_file "stock-token-exchange/backend/wsgi.py" "Backend WSGI file"
    check_file "stock-token-exchange/cartesi-machine/wsgi.py" "Cartesi machine WSGI file"
    
    # Check if WSGI files have proper application variable
    if [ -f "stock-token-exchange/backend/wsgi.py" ]; then
        if grep -q "application.*=" stock-token-exchange/backend/wsgi.py; then
            log_success "Backend WSGI has application variable"
        else
            log_error "Backend WSGI missing application variable"
            ((VALIDATION_ERRORS++))
        fi
    fi
    
    if [ -f "stock-token-exchange/cartesi-machine/wsgi.py" ]; then
        if grep -q "application.*=" stock-token-exchange/cartesi-machine/wsgi.py; then
            log_success "Cartesi machine WSGI has application variable"
        else
            log_error "Cartesi machine WSGI missing application variable"
            ((VALIDATION_ERRORS++))
        fi
    fi
}

# Function to check Nginx configurations
check_nginx_configs() {
    log_info "Checking Nginx configurations..."
    
    check_file "stock-token-exchange/frontend/nginx.conf" "Nginx main configuration"
    check_file "stock-token-exchange/frontend/nginx-default.conf" "Nginx default server configuration"
    
    # Check if nginx configurations have security headers
    if [ -f "stock-token-exchange/frontend/nginx.conf" ]; then
        if grep -q "X-Frame-Options\|X-Content-Type-Options" stock-token-exchange/frontend/nginx.conf; then
            log_success "Nginx has security headers configured"
        else
            log_warning "Nginx may be missing security headers"
            ((VALIDATION_WARNINGS++))
        fi
    fi
}

# Function to check production requirements
check_production_requirements() {
    log_info "Checking production requirements..."
    
    check_file "stock-token-exchange/backend/requirements-prod.txt" "Backend production requirements"
    
    # Check if Gunicorn is in requirements
    if [ -f "stock-token-exchange/backend/requirements-prod.txt" ]; then
        if grep -q "gunicorn" stock-token-exchange/backend/requirements-prod.txt; then
            log_success "Gunicorn is included in production requirements"
        else
            log_error "Gunicorn is missing from production requirements"
            ((VALIDATION_ERRORS++))
        fi
    fi
}

# Function to check deployment scripts
check_deployment_scripts() {
    log_info "Checking deployment scripts..."
    
    check_file "scripts/deploy-production.sh" "Production deployment script"
    check_file "scripts/monitor-production.sh" "Production monitoring script"
    
    # Check if scripts are executable
    if [ -f "scripts/deploy-production.sh" ]; then
        if [ -x "scripts/deploy-production.sh" ]; then
            log_success "Deploy script is executable"
        else
            log_warning "Deploy script is not executable (use: chmod +x scripts/deploy-production.sh)"
            ((VALIDATION_WARNINGS++))
        fi
    fi
    
    if [ -f "scripts/monitor-production.sh" ]; then
        if [ -x "scripts/monitor-production.sh" ]; then
            log_success "Monitor script is executable"
        else
            log_warning "Monitor script is not executable (use: chmod +x scripts/monitor-production.sh)"
            ((VALIDATION_WARNINGS++))
        fi
    fi
}

# Function to check security configurations
check_security_configs() {
    log_info "Checking security configurations..."
    
    # Check if secrets directory exists
    if [ -d "secrets" ]; then
        log_success "Secrets directory exists"
        
        # Check for sensitive files in git
        if [ -f ".gitignore" ]; then
            if grep -q "secrets/" .gitignore; then
                log_success "Secrets directory is in .gitignore"
            else
                log_warning "Secrets directory should be added to .gitignore"
                ((VALIDATION_WARNINGS++))
            fi
        fi
    else
        log_warning "Secrets directory does not exist (will be needed for production secrets)"
        ((VALIDATION_WARNINGS++))
    fi
    
    # Check for non-root users in Dockerfiles
    for dockerfile in stock-token-exchange/*/Dockerfile.production stock-token-exchange/*/Dockerfile.*_production; do
        if [ -f "$dockerfile" ]; then
            if grep -q "USER.*appuser\|USER.*[0-9]" "$dockerfile"; then
                log_success "$(basename $dockerfile) uses non-root user"
            else
                log_warning "$(basename $dockerfile) may be running as root"
                ((VALIDATION_WARNINGS++))
            fi
        fi
    done
}

# Function to check documentation
check_documentation() {
    log_info "Checking documentation..."
    
    check_file "PRODUCTION_DEPLOYMENT_GUIDE.md" "Production deployment guide"
    check_file "README.md" "Main README file"
    
    # Check if production guide mentions test tokens
    if [ -f "PRODUCTION_DEPLOYMENT_GUIDE.md" ]; then
        if grep -qi "test.*token\|manual.*test" PRODUCTION_DEPLOYMENT_GUIDE.md; then
            log_success "Production guide mentions test token preservation"
        else
            log_warning "Production guide should mention test token preservation for manual testing"
            ((VALIDATION_WARNINGS++))
        fi
    fi
}

# Main validation function
run_validation() {
    echo ""
    log_info "Starting production configuration validation..."
    echo ""
    
    check_docker_configs
    echo ""
    check_environment_configs
    echo ""
    check_wsgi_configs
    echo ""
    check_nginx_configs
    echo ""
    check_production_requirements
    echo ""
    check_deployment_scripts
    echo ""
    check_security_configs
    echo ""
    check_documentation
    echo ""
    
    # Summary
    echo "================================================="
    echo "🔍 Validation Summary"
    echo "================================================="
    
    if [ $VALIDATION_ERRORS -eq 0 ] && [ $VALIDATION_WARNINGS -eq 0 ]; then
        log_success "All validations passed! Production configuration is ready."
        echo ""
        echo "Next steps:"
        echo "1. Deploy: ./scripts/deploy-production.sh mock"
        echo "2. Monitor: ./scripts/monitor-production.sh status"
        echo "3. Access frontend: http://localhost:3000"
        return 0
    elif [ $VALIDATION_ERRORS -eq 0 ]; then
        log_warning "Validation completed with $VALIDATION_WARNINGS warnings"
        echo ""
        echo "⚠️  Please review the warnings above before deploying to production."
        echo "   Most warnings are recommendations for enhanced security/monitoring."
        echo ""
        echo "You can still deploy with: ./scripts/deploy-production.sh mock"
        return 0
    else
        log_error "Validation failed with $VALIDATION_ERRORS errors and $VALIDATION_WARNINGS warnings"
        echo ""
        echo "❌ Please fix the errors above before deploying to production."
        echo "   Critical configuration files are missing or invalid."
        return 1
    fi
}

# Make scripts executable if they exist
if [ -f "scripts/deploy-production.sh" ]; then
    chmod +x scripts/deploy-production.sh
fi

if [ -f "scripts/monitor-production.sh" ]; then
    chmod +x scripts/monitor-production.sh
fi

# Run validation
run_validation
exit $?
