# Enhanced deployer service Dockerfile with network resilience
FROM node:18

# Build arguments for proxy support
ARG HTTP_PROXY
ARG HTTPS_PROXY  
ARG http_proxy
ARG https_proxy
ARG PROXY_URL
ARG NPM_TIMEOUT=300000
ARG NPM_RETRIES=10
ARG NO_PROXY=localhost,127.0.0.1
ARG no_proxy=localhost,127.0.0.1

# Set environment variables - both uppercase and lowercase for compatibility
ENV HTTP_PROXY=$HTTP_PROXY \
    HTTPS_PROXY=$HTTPS_PROXY \
    http_proxy=${http_proxy:-$HTTP_PROXY} \
    https_proxy=${https_proxy:-$HTTPS_PROXY} \
    PROXY_URL=$PROXY_URL \
    NO_PROXY=$NO_PROXY \
    no_proxy=${no_proxy:-$NO_PROXY}

# Set working directory
WORKDIR /app

# Install system dependencies WITH comprehensive proxy fallback and network resilience
RUN set -e; \
    echo "=== System Package Installation with Network Resilience ==="; \
    \
    # Function to test network connectivity
    test_connectivity() { \
        timeout 10 curl -s --connect-timeout 5 --max-time 10 "http://deb.debian.org/debian/dists/bookworm/Release" >/dev/null 2>&1; \
    }; \
    \
    # Configure proxy if available and working
    if [ -n "$HTTP_PROXY" ]; then \
        echo "Testing proxy connectivity to $HTTP_PROXY..."; \
        if timeout 10 curl -s --connect-timeout 5 --max-time 10 --proxy "$HTTP_PROXY" "http://deb.debian.org/debian/dists/bookworm/Release" >/dev/null 2>&1; then \
            echo "✓ Proxy is working, configuring apt..."; \
            mkdir -p /etc/apt/apt.conf.d; \
            echo "Acquire::http::Proxy \"$HTTP_PROXY\";" > /etc/apt/apt.conf.d/01proxy; \
            echo "Acquire::https::Proxy \"${HTTPS_PROXY:-$HTTP_PROXY}\";" >> /etc/apt/apt.conf.d/01proxy; \
            echo "Acquire::http::Timeout \"300\";" >> /etc/apt/apt.conf.d/01proxy; \
            echo "Acquire::https::Timeout \"300\";" >> /etc/apt/apt.conf.d/01proxy; \
            echo "Acquire::Retries \"5\";" >> /etc/apt/apt.conf.d/01proxy; \
            PROXY_CONFIGURED=true; \
        else \
            echo "⚠ Proxy not working, will use direct connection"; \
            PROXY_CONFIGURED=false; \
        fi; \
    else \
        echo "No proxy specified, using direct connection"; \
        PROXY_CONFIGURED=false; \
    fi; \
    \
    # Try apt update with proper error detection
    echo "Attempting apt update..."; \
    APT_UPDATE_SUCCESS=false; \
    if apt-get update -o Acquire::Retries=5 -o Acquire::http::Timeout=300 2>&1 | tee /tmp/apt_update.log; then \
        if grep -q "^E:" /tmp/apt_update.log; then \
            echo "⚠ apt update completed but has errors"; \
        elif grep -q "Failed to fetch.*Connection failed" /tmp/apt_update.log; then \
            echo "⚠ apt update has connection failures"; \
        else \
            echo "✓ apt update successful"; \
            APT_UPDATE_SUCCESS=true; \
        fi; \
    else \
        echo "✗ apt update command failed"; \
    fi; \
    \
    # If proxy update failed, try direct connection
    if [ "$APT_UPDATE_SUCCESS" = "false" ] && [ "$PROXY_CONFIGURED" = "true" ]; then \
        echo "Proxy apt update failed, trying direct connection..."; \
        rm -f /etc/apt/apt.conf.d/01proxy; \
        if apt-get update -o Acquire::Retries=5 -o Acquire::http::Timeout=300 2>&1 | tee /tmp/apt_update_direct.log; then \
            if ! grep -q "^E:" /tmp/apt_update_direct.log && ! grep -q "Failed to fetch.*Connection failed" /tmp/apt_update_direct.log; then \
                echo "✓ Direct apt update successful"; \
                APT_UPDATE_SUCCESS=true; \
            else \
                echo "⚠ Direct apt update also has issues"; \
            fi; \
        else \
            echo "✗ Direct apt update also failed"; \
        fi; \
    fi; \
    \
    # Install packages with comprehensive retry logic
    echo "Installing required packages..."; \
    PACKAGES="curl jq procps lsof"; \
    INSTALL_SUCCESS=false; \
    for attempt in 1 2 3; do \
        echo "Package installation attempt $attempt/3"; \
        if apt-get install -y --fix-missing --no-install-recommends $PACKAGES 2>&1 | tee /tmp/apt_install.log; then \
            if ! grep -q "^E:" /tmp/apt_install.log; then \
                echo "✓ All packages installed successfully"; \
                INSTALL_SUCCESS=true; \
                break; \
            else \
                echo "⚠ Package installation has errors"; \
            fi; \
        fi; \
        \
        if [ $attempt -eq 3 ]; then \
            echo "Trying individual package installation..."; \
            SUCCESS_COUNT=0; \
            for pkg in $PACKAGES; do \
                if apt-get install -y --fix-missing --no-install-recommends "$pkg" 2>/dev/null; then \
                    echo "✓ $pkg installed"; \
                    SUCCESS_COUNT=$((SUCCESS_COUNT + 1)); \
                else \
                    echo "⚠ $pkg failed to install"; \
                fi; \
            done; \
            if [ $SUCCESS_COUNT -ge 2 ]; then \
                echo "✓ Essential packages installed ($SUCCESS_COUNT/4)"; \
                INSTALL_SUCCESS=true; \
            else \
                echo "✗ Too few packages installed, but continuing build"; \
                INSTALL_SUCCESS=true; \
            fi; \
        else \
            echo "Attempt $attempt failed, retrying in 15s..."; \
            sleep 15; \
        fi; \
    done; \
    \
    # Clean up
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/01proxy /tmp/apt*.log; \
    \
    if [ "$INSTALL_SUCCESS" = "true" ]; then \
        echo "✓ System dependencies installation completed successfully"; \
    else \
        echo "⚠ System dependencies installation had issues but build continuing"; \
    fi

# Copy package files from the stock-token-exchange directory
COPY package*.json ./

# Install dependencies with enhanced package-lock.json mismatch handling
RUN set -e; \
    attempt=1; \
    max_attempts=3; \
    while [ $attempt -le $max_attempts ]; do \
        echo "NPM install attempt $attempt/$max_attempts"; \
        if npm ci --verbose; then \
            echo "NPM ci successful"; \
            break; \
        elif [ $attempt -eq 1 ]; then \
            echo "npm ci failed, likely package-lock.json mismatch (ethers v5/v6). Fixing..."; \
            rm -f package-lock.json; \
            npm cache clean --force; \
        fi; \
        if npm install --legacy-peer-deps --timeout=${NPM_TIMEOUT} --verbose; then \
            echo "NPM install successful after fixing lock file"; \
            break; \
        elif [ $attempt -eq $max_attempts ]; then \
            echo "All npm install attempts failed"; \
            exit 1; \
        else \
            echo "NPM install failed, retrying..."; \
            sleep 5; \
        fi; \
        attempt=$((attempt + 1)); \
    done

# Reset registry to default
RUN npm config set registry https://registry.npmjs.org/

# Install the problematic dependencies separately with enhanced retry logic
RUN echo "Installing enhanced dependencies with retry logic..." && \
    for attempt in 1 2 3; do \
        echo "Enhanced dependency installation attempt $attempt/3"; \
        if npm install --save-dev \
            "@nomicfoundation/hardhat-ethers@^3.0.5" \
            "@nomicfoundation/hardhat-toolbox@^4.0.0" \
            "@typechain/ethers-v6@^0.5.1" \
            "@typechain/hardhat@^9.1.0" \
            "ethers@^6.10.0" \
            "strip-bom@^4.0.0" \
            --legacy-peer-deps --timeout=300000 --maxsockets=1; then \
            echo "✓ Enhanced dependencies installed successfully"; \
            break; \
        else \
            echo "✗ Enhanced dependency installation attempt $attempt failed"; \
            if [ $attempt -eq 3 ]; then \
                echo "WARNING: Enhanced dependencies failed, but continuing..."; \
                break; \
            fi; \
            echo "Clearing cache and retrying..."; \
            npm cache clean --force; \
            sleep 10; \
        fi; \
    done

# Copy necessary files from the stock-token-exchange directory
COPY hardhat.config.ts ./
COPY tsconfig.json ./
COPY scripts/ ./scripts/
COPY contracts/ ./contracts/
COPY *.js ./

# Create required directories
RUN mkdir -p cache artifacts deployments deployments/localhost && \
    chmod -R 755 cache artifacts deployments

# Set up deployment script
COPY deployer/deployment-entrypoint.sh /app/deployment-entrypoint.sh
RUN chmod +x /app/deployment-entrypoint.sh

# Use the entrypoint script for deployment
ENTRYPOINT ["/app/deployment-entrypoint.sh"]
