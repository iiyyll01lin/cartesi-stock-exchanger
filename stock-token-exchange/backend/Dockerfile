FROM python:3.9-slim

WORKDIR /app/backend

# Install system dependencies first
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    netcat-openbsd \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .

# Dependencies will be installed at runtime by entrypoint.sh

# Copy the backend code
COPY . .

# Copy the entrypoint script from the local directory
COPY entrypoint.sh /app/backend/entrypoint.sh
RUN chmod +x /app/backend/entrypoint.sh

# Set Flask environment
ENV FLASK_APP=server.py
ENV FLASK_DEBUG=1
ENV HOST=0.0.0.0

# Expose port
EXPOSE 5001

# Start Flask server
ENTRYPOINT ["/app/backend/entrypoint.sh"]
