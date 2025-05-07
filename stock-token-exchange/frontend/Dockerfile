# Use an official Node runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Create necessary directories
RUN mkdir -p /app/src/deployments
RUN mkdir -p /app/scripts
RUN mkdir -p /app/deployments_src

# Copy the entire frontend source code
COPY . .

# Create a simple deployment file if it doesn't exist
RUN echo "// This file is auto-generated\nexport const EXCHANGE_ADDRESS = \"0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512\";\nexport const STOCK_TOKEN_ADDRESS = \"0x5FbDB2315678afecb367f032d93F642f64180aa3\";\nexport const EXCHANGE_ABI = [];\nexport const STOCK_TOKEN_ABI = [];\nexport const CONTRACT_CHAIN_ID = 31337;\nexport default {exchange:{address:EXCHANGE_ADDRESS,abi:EXCHANGE_ABI},stockToken:{address:STOCK_TOKEN_ADDRESS,abi:STOCK_TOKEN_ABI},chainId:CONTRACT_CHAIN_ID};" > /app/src/deployments/index.ts

# React apps typically run on port 3000
EXPOSE 3000

# Set the entrypoint script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Use the entry script as the entrypoint
ENTRYPOINT ["/app/docker-entrypoint.sh"]
