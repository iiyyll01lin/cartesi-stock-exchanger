FROM python:3.9-slim

WORKDIR /app/backend

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Set Flask environment
ENV FLASK_APP=server.py
ENV FLASK_DEBUG=1
ENV HOST=0.0.0.0

# Expose port
EXPOSE 5001

# Start Flask server
CMD ["flask", "run", "--host=0.0.0.0", "--port=5001"]