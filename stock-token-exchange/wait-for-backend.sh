#!/bin/bash

MAX_ATTEMPTS=10
SLEEP_SECONDS=5
ENDPOINT=http://localhost:5001/api/status

echo "Waiting for backend to be ready..."

for ((i=1; i<=$MAX_ATTEMPTS; i++)); do
  echo "Attempt $i of $MAX_ATTEMPTS..."
  
  if curl -s -f $ENDPOINT > /dev/null 2>&1; then
    echo "Backend is ready!"
    exit 0
  else
    echo "Backend not ready, waiting $SLEEP_SECONDS seconds..."
    sleep $SLEEP_SECONDS
  fi
done

echo "Backend did not become ready after $MAX_ATTEMPTS attempts"
exit 1
