# Multi-stage build for optimized production image
FROM node:18-alpine as builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Simple npm configuration without external dependencies
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set strict-ssl false

# Install dependencies with package-lock.json mismatch handling
RUN set -e; \
    if npm ci --verbose; then \
        echo "NPM ci successful"; \
    else \
        echo "npm ci failed, likely package-lock.json mismatch (ethers v5/v6). Fixing..."; \
        rm -f package-lock.json; \
        npm install --legacy-peer-deps --verbose; \
        echo "NPM install successful after fixing lock file"; \
    fi

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built application from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration if you have one
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
