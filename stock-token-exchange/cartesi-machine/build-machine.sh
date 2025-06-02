#!/bin/bash
# Enhanced build script for the Stock Token Exchange Cartesi Machine

set -e

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Building Stock Exchange Cartesi Machine..."

MACHINE_DIR=$(dirname $(readlink -f $0))
APP_DIR_IN_MACHINE="app"
DAPP_FS_BIN="$MACHINE_DIR/offchain_logic.py"
DAPP_FS="$MACHINE_DIR/stock-exchange-fs.ext2"
TEMPLATE_HASH_FILE="$MACHINE_DIR/template-hash.txt"

# Read environment variables for build-time configuration with enhanced defaults
EXCHANGE_MODE=${EXCHANGE_MODE:-"mock"}
LOG_LEVEL=${LOG_LEVEL:-"INFO"}
MAX_TRADES_PER_BATCH=${MAX_TRADES_PER_BATCH:-"100"}
MIN_TRADE_AMOUNT=${MIN_TRADE_AMOUNT:-"1"}
MAKER_FEE_BASIS_POINTS=${MAKER_FEE_BASIS_POINTS:-"10"}
TAKER_FEE_BASIS_POINTS=${TAKER_FEE_BASIS_POINTS:-"20"}

log "Building with configuration:"
log "  EXCHANGE_MODE: $EXCHANGE_MODE"
log "  LOG_LEVEL: $LOG_LEVEL"
log "  MAX_TRADES_PER_BATCH: $MAX_TRADES_PER_BATCH"
log "  MIN_TRADE_AMOUNT: $MIN_TRADE_AMOUNT"
log "  MAKER_FEE_BASIS_POINTS: $MAKER_FEE_BASIS_POINTS"
log "  TAKER_FEE_BASIS_POINTS: $TAKER_FEE_BASIS_POINTS"

# Validate environment variables
if [[ ! "$EXCHANGE_MODE" =~ ^(mock|real)$ ]]; then
    log "ERROR: EXCHANGE_MODE must be 'mock' or 'real'"
    exit 1
fi

if [[ ! "$LOG_LEVEL" =~ ^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$ ]]; then
    log "ERROR: LOG_LEVEL must be one of: DEBUG, INFO, WARNING, ERROR, CRITICAL"
    exit 1
fi

if ! [[ "$MAX_TRADES_PER_BATCH" =~ ^[0-9]+$ ]] || [ "$MAX_TRADES_PER_BATCH" -le 0 ]; then
    log "ERROR: MAX_TRADES_PER_BATCH must be a positive integer"
    exit 1
fi

# Check if required tools are available
if ! command -v genext2fs &> /dev/null; then
    log "Warning: genext2fs not found. Skipping filesystem creation."
    echo "0x0000000000000000000000000000000000000000000000000000000000000000" > "$TEMPLATE_HASH_FILE"
    exit 0
fi

if ! command -v cartesi-machine &> /dev/null; then
    log "Warning: cartesi-machine not found. Skipping machine build."
    echo "0x0000000000000000000000000000000000000000000000000000000000000000" > "$TEMPLATE_HASH_FILE"
    exit 0
fi

# Validate required files exist
if [ ! -f "$DAPP_FS_BIN" ]; then
    log "ERROR: offchain_logic.py not found at $DAPP_FS_BIN"
    exit 1
fi

# Create temporary directory for building the filesystem
MACHINE_TEMP_DIR=$(mktemp -d)
log "Using temporary directory: $MACHINE_TEMP_DIR"

# Create application directory structure
mkdir -p "$MACHINE_TEMP_DIR/$APP_DIR_IN_MACHINE"
mkdir -p "$MACHINE_TEMP_DIR/deps"

# Copy the main Python script
cp "$DAPP_FS_BIN" "$MACHINE_TEMP_DIR/$APP_DIR_IN_MACHINE/"

# Create enhanced configuration file with build-time environment variables
cat > "$MACHINE_TEMP_DIR/$APP_DIR_IN_MACHINE/config.json" << EOF
{
    "exchange_mode": "$EXCHANGE_MODE",
    "log_level": "$LOG_LEVEL",
    "max_trades_per_batch": $MAX_TRADES_PER_BATCH,
    "min_trade_amount": "$MIN_TRADE_AMOUNT",
    "fees": {
        "maker_fee_basis_points": $MAKER_FEE_BASIS_POINTS,
        "taker_fee_basis_points": $TAKER_FEE_BASIS_POINTS
    },
    "build_info": {
        "build_time": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
        "builder": "$(whoami)",
        "host": "$(hostname)",
        "version": "1.0.0"
    },
    "cartesi_config": {
        "ram_length": "128Mi",
        "rollup_enabled": true,
        "max_mcycle": 0
    }
}
EOF

# Also create legacy config.env for backward compatibility
cat > "$MACHINE_TEMP_DIR/$APP_DIR_IN_MACHINE/config.env" << EOF
EXCHANGE_MODE=$EXCHANGE_MODE
EXCHANGE_MODE=$EXCHANGE_MODE
LOG_LEVEL=$LOG_LEVEL
MAX_TRADES_PER_BATCH=$MAX_TRADES_PER_BATCH
MIN_TRADE_AMOUNT=$MIN_TRADE_AMOUNT
MAKER_FEE_BASIS_POINTS=$MAKER_FEE_BASIS_POINTS
TAKER_FEE_BASIS_POINTS=$TAKER_FEE_BASIS_POINTS
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

log "Configuration files created successfully"
log "JSON config:"
cat "$MACHINE_TEMP_DIR/$APP_DIR_IN_MACHINE/config.json" | head -10

# Install Python dependencies into the machine
log "Installing Python dependencies..."
python3 -m pip install --target "$MACHINE_TEMP_DIR/deps" eth-abi==4.0.0

# Copy requirements file if it exists
if [ -f "$MACHINE_DIR/requirements.txt" ]; then
    log "Installing additional dependencies from requirements.txt..."
    python3 -m pip install --target "$MACHINE_TEMP_DIR/deps" -r "$MACHINE_DIR/requirements.txt"
fi

# Create the filesystem
log "Creating filesystem..."
genext2fs -b 1024 -d "$MACHINE_TEMP_DIR" "$DAPP_FS"

# Check if Cartesi Machine tools are available
if ! command -v cartesi-machine &> /dev/null; then
    log "Cartesi Machine tools not found. Skipping machine build."
    log "To build the machine, ensure Cartesi tools are in your PATH."
    # Create a dummy template hash file if it doesn't exist, so deploy script doesn't fail
    if [ ! -f "$TEMPLATE_HASH_FILE" ]; then
        echo "0x0000000000000000000000000000000000000000000000000000000000000000" > "$TEMPLATE_HASH_FILE"
        log "Created dummy template hash file: $TEMPLATE_HASH_FILE"
    fi
    exit 0
fi

# Build the Cartesi machine with environment variables
log "Building Cartesi machine..."
cartesi-machine \
    --max-mcycle=0 \
    --initial-hash \
    --store="$MACHINE_DIR" \
    --flash-drive="label:root,filename:$DAPP_FS" \
    --env="EXCHANGE_MODE=$EXCHANGE_MODE" \
    --env="LOG_LEVEL=$LOG_LEVEL" \
    --env="MAX_TRADES_PER_BATCH=$MAX_TRADES_PER_BATCH" \
    --env="MIN_TRADE_AMOUNT=$MIN_TRADE_AMOUNT" \
    --env="MAKER_FEE_BASIS_POINTS=$MAKER_FEE_BASIS_POINTS" \
    --env="TAKER_FEE_BASIS_POINTS=$TAKER_FEE_BASIS_POINTS" \
    --env="PYTHONPATH=/mnt/root/deps:/mnt/root/$APP_DIR_IN_MACHINE" \
    -- "python3 /mnt/root/$APP_DIR_IN_MACHINE/offchain_logic.py" \
    > /dev/null

# Extract and save the template hash
TEMPLATE_HASH=$(cartesi-machine --max-mcycle=0 --initial-hash --store="$MACHINE_DIR" --flash-drive="label:root,filename:$DAPP_FS" --env="EXCHANGE_MODE=$EXCHANGE_MODE" --env="LOG_LEVEL=$LOG_LEVEL" --env="MAX_TRADES_PER_BATCH=$MAX_TRADES_PER_BATCH" --env="MIN_TRADE_AMOUNT=$MIN_TRADE_AMOUNT" --env="MAKER_FEE_BASIS_POINTS=$MAKER_FEE_BASIS_POINTS" --env="TAKER_FEE_BASIS_POINTS=$TAKER_FEE_BASIS_POINTS" --env="PYTHONPATH=/mnt/root/deps:/mnt/root/$APP_DIR_IN_MACHINE" -- "python3 /mnt/root/$APP_DIR_IN_MACHINE/offchain_logic.py" 2>/dev/null | tail -n 1)

echo "$TEMPLATE_HASH" > "$TEMPLATE_HASH_FILE"
log "Template hash saved: $TEMPLATE_HASH"

# Create machine info file
cat > "$MACHINE_DIR/info.json" << EOF
{
    "build_timestamp": $(date +%s),
    "build_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "template_hash": "$TEMPLATE_HASH",
    "config": $(cat "$MACHINE_TEMP_DIR/$APP_DIR_IN_MACHINE/config.json"),
    "machine_dir": "$MACHINE_DIR"
}
EOF

log "Machine info saved to: $MACHINE_DIR/info.json"

# Clean up
rm -rf "$MACHINE_TEMP_DIR"
rm -f "$DAPP_FS"

log "✅ Stock Exchange Cartesi Machine built successfully! 🎉"