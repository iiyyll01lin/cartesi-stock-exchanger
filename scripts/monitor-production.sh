#!/bin/bash

# Production Monitoring Script for Cartesi Stock Exchange
# Monitors service health, performance, and logs

set -e

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

# Function to check service health
check_service_health() {
    local service_name=$1
    local health_url=$2
    local timeout=${3:-10}
    
    if timeout $timeout curl -s -f "$health_url" >/dev/null 2>&1; then
        log_success "$service_name: HEALTHY"
        return 0
    else
        log_error "$service_name: UNHEALTHY"
        return 1
    fi
}

# Function to get service metrics
get_service_metrics() {
    local service_name=$1
    
    # Get container stats
    local stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" | grep "$service_name" || echo "N/A")
    
    if [ "$stats" != "N/A" ]; then
        echo "$stats"
    else
        echo "$service_name: Not running"
    fi
}

# Function to show service status
show_service_status() {
    echo ""
    echo "🔍 Production Service Status"
    echo "============================"
    
    # Check if production compose is running
    if ! docker compose -f docker-compose.production.yml ps >/dev/null 2>&1; then
        log_error "Production services are not running"
        echo "Start with: ./scripts/deploy-production.sh"
        return 1
    fi
    
    echo ""
    echo "Service Health:"
    echo "---------------"
    
    # Check blockchain
    check_service_health "Blockchain" "http://localhost:8545" 5
    
    # Check backend
    check_service_health "Backend" "http://localhost:5001/health" 5
    
    # Check frontend
    check_service_health "Frontend" "http://localhost:3000/health" 5
    
    # Check python-runner if running
    if docker compose -f docker-compose.production.yml ps | grep -q python-runner; then
        check_service_health "Python Runner" "http://localhost:5000/health" 5
    fi
    
    # Check cartesi services if running
    if docker compose -f docker-compose.production.yml ps | grep -q cartesi-node; then
        check_service_health "Cartesi Node" "http://localhost:5005" 5
    fi
    
    if docker compose -f docker-compose.production.yml ps | grep -q stock-exchange-dapp; then
        check_service_health "Stock Exchange DApp" "http://localhost:5007/health" 5
    fi
}

# Function to show resource usage
show_resource_usage() {
    echo ""
    echo "📊 Resource Usage"
    echo "=================="
    
    echo ""
    echo "Container Statistics:"
    echo "--------------------"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" | head -20
    
    echo ""
    echo "Disk Usage:"
    echo "-----------"
    echo "Docker volumes:"
    docker system df
    
    echo ""
    echo "Log files size:"
    find . -name "*.log" -exec du -sh {} \; 2>/dev/null | head -10 || echo "No log files found"
}

# Function to show recent logs
show_recent_logs() {
    local service=${1:-"all"}
    local lines=${2:-50}
    
    echo ""
    echo "📜 Recent Logs ($service, last $lines lines)"
    echo "============================================"
    
    if [ "$service" = "all" ]; then
        docker compose -f docker-compose.production.yml logs --tail=$lines
    else
        docker compose -f docker-compose.production.yml logs --tail=$lines "$service"
    fi
}

# Function to run basic functional tests
run_functional_tests() {
    echo ""
    echo "🧪 Basic Functional Tests"
    echo "=========================="
    
    # Test blockchain connectivity
    log_info "Testing blockchain connectivity..."
    if curl -s -X POST -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
       http://localhost:8545 | grep -q result; then
        log_success "Blockchain RPC: WORKING"
    else
        log_error "Blockchain RPC: FAILED"
    fi
    
    # Test backend API
    log_info "Testing backend API..."
    if curl -s -f http://localhost:5001/health | grep -q healthy; then
        log_success "Backend API: WORKING"
    else
        log_error "Backend API: FAILED"
    fi
    
    # Test frontend
    log_info "Testing frontend..."
    if curl -s -f http://localhost:3000/health >/dev/null 2>&1; then
        log_success "Frontend: WORKING"
    else
        log_error "Frontend: FAILED"
    fi
    
    # Test python-runner if available
    if docker compose -f docker-compose.production.yml ps | grep -q python-runner; then
        log_info "Testing Python Runner..."
        if curl -s -f http://localhost:5000/health | grep -q healthy; then
            log_success "Python Runner: WORKING"
        else
            log_error "Python Runner: FAILED"
        fi
    fi
}

# Function to backup configuration
backup_configuration() {
    local backup_dir="backups/production-$(date +%Y%m%d-%H%M%S)"
    
    echo ""
    echo "💾 Creating Configuration Backup"
    echo "================================="
    
    mkdir -p "$backup_dir"
    
    # Backup docker-compose files
    cp docker-compose.production.yml "$backup_dir/"
    
    # Backup environment files
    cp .env.production "$backup_dir/" 2>/dev/null || echo "No .env.production file to backup"
    
    # Backup secrets (without revealing content)
    if [ -d "secrets" ]; then
        mkdir -p "$backup_dir/secrets"
        ls -la secrets/ > "$backup_dir/secrets/secrets_list.txt"
    fi
    
    # Backup deployment info
    docker compose -f docker-compose.production.yml config > "$backup_dir/resolved-config.yml"
    
    # Save container info
    docker compose -f docker-compose.production.yml ps > "$backup_dir/running-services.txt"
    
    log_success "Configuration backed up to: $backup_dir"
}

# Main menu
show_menu() {
    echo ""
    echo "🔧 Cartesi Stock Exchange - Production Monitor"
    echo "=============================================="
    echo ""
    echo "1. Show service status"
    echo "2. Show resource usage"
    echo "3. Show recent logs (all services)"
    echo "4. Show logs for specific service"
    echo "5. Run functional tests"
    echo "6. Backup configuration"
    echo "7. Restart services"
    echo "8. Scale services"
    echo "9. Exit"
    echo ""
    read -p "Select option (1-9): " choice
    
    case $choice in
        1) show_service_status ;;
        2) show_resource_usage ;;
        3) show_recent_logs ;;
        4) 
            read -p "Enter service name (blockchain/backend/frontend/python-runner): " service
            read -p "Number of lines (default 50): " lines
            lines=${lines:-50}
            show_recent_logs "$service" "$lines"
            ;;
        5) run_functional_tests ;;
        6) backup_configuration ;;
        7)
            log_info "Restarting production services..."
            docker compose -f docker-compose.production.yml restart
            log_success "Services restarted"
            ;;
        8)
            read -p "Enter service to scale: " service
            read -p "Enter number of replicas: " replicas
            docker compose -f docker-compose.production.yml up -d --scale "$service=$replicas"
            log_success "Service scaled"
            ;;
        9) exit 0 ;;
        *) log_error "Invalid option" ;;
    esac
}

# Command line options
case ${1:-menu} in
    "status") show_service_status ;;
    "resources") show_resource_usage ;;
    "logs") show_recent_logs "${2:-all}" "${3:-50}" ;;
    "test") run_functional_tests ;;
    "backup") backup_configuration ;;
    "menu"|*) 
        # Interactive mode
        while true; do
            show_menu
            echo ""
            read -p "Press Enter to continue..."
        done
        ;;
esac
