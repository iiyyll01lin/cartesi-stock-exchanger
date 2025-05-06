#!/bin/bash

# Test script to verify all the endpoints needed for UI testing

echo "Testing API status..."
curl -s http://localhost:5001/api/status | jq

echo -e "\nTesting trigger matching endpoint..."
curl -s -X POST http://localhost:5001/trigger-matching | jq

echo -e "\nTesting process results endpoint..."
curl -s -X POST http://localhost:5001/process-results/0 | jq

echo -e "\nTesting balance endpoint..."
# Replace with a valid user address from your setup
USER_ADDRESS="0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
curl -s http://localhost:5001/api/balance/$USER_ADDRESS | jq

echo -e "\nTesting deposit endpoint (ETH)..."
curl -s -X POST http://localhost:5001/api/deposit \
  -H "Content-Type: application/json" \
  -d "{\"userAddress\":\"$USER_ADDRESS\",\"amount\":1,\"isEth\":true}" | jq

echo -e "\nTesting deposit endpoint (Token)..."
TOKEN_ADDRESS="0x5FbDB2315678afecb367f032d93F642f64180aa3"
curl -s -X POST http://localhost:5001/api/deposit \
  -H "Content-Type: application/json" \
  -d "{\"userAddress\":\"$USER_ADDRESS\",\"tokenAddress\":\"$TOKEN_ADDRESS\",\"amount\":10,\"isEth\":false}" | jq

echo -e "\nTesting balance after deposits..."
curl -s http://localhost:5001/api/balance/$USER_ADDRESS | jq

echo -e "\nTesting order placement..."
curl -s -X POST http://localhost:5001/api/orders \
  -H "Content-Type: application/json" \
  -d "{\"userAddress\":\"$USER_ADDRESS\",\"tokenAddress\":\"$TOKEN_ADDRESS\",\"amount\":5,\"price\":0.1,\"isBuy\":true}" | jq

echo -e "\nTesting order fetching..."
curl -s http://localhost:5001/api/orders | jq

echo -e "\nTesting withdraw endpoint (ETH)..."
curl -s -X POST http://localhost:5001/api/withdraw \
  -H "Content-Type: application/json" \
  -d "{\"userAddress\":\"$USER_ADDRESS\",\"amount\":0.5,\"isEth\":true}" | jq

echo -e "\nTesting withdraw endpoint (Token)..."
curl -s -X POST http://localhost:5001/api/withdraw \
  -H "Content-Type: application/json" \
  -d "{\"userAddress\":\"$USER_ADDRESS\",\"tokenAddress\":\"$TOKEN_ADDRESS\",\"amount\":2,\"isEth\":false}" | jq

echo -e "\nTesting final balance..."
curl -s http://localhost:5001/api/balance/$USER_ADDRESS | jq
