# User Manual Test Flow for Stock Token Exchange UI

This document provides a step-by-step guide for testing the Stock Token Exchange UI functionality.

## Prerequisites

- Docker and Docker Compose are installed and running
- The application is running via `docker compose up --build -d`
- MetaMask browser extension is installed and configured

## Test Flow

### 1. Initial Setup

1. Open your browser and navigate to [http://localhost:3000](http://localhost:3000)
2. Verify that the application loads with dark theme by default
3. Ensure you have MetaMask configured with the following:
   - Network: Localhost 8545
   - At least 2 accounts with ETH (Alice and Bob)

### 2. Connect Wallet

1. Click "Connect MetaMask" in the header
2. Approve the connection request in the MetaMask popup
3. Verify your account address appears in the UI

### 3. Switch to Alice's Account

1. In MetaMask, switch to Alice's account
2. Verify the account address updates in the UI

### 4. Deposit Funds (Alice)

1. Enter `1` in the ETH deposit field
2. Click "Deposit ETH"
3. Confirm the transaction in MetaMask
4. Verify Alice's ETH balance in the exchange updates

### 5. Place Buy Order (Alice)

1. Enter `10` for Amount (STOCK)
2. Enter `0.1` for Price (ETH per STOCK)
3. Ensure "Buy Order" is selected
4. Click "Place Order"
5. Confirm the transaction in MetaMask
6. Verify the order appears in the Order Book

### 6. Switch to Bob's Account

1. In MetaMask, switch to Bob's account
2. Verify the account address updates in the UI

### 7. Deposit Tokens (Bob)

1. Enter `10` in the STOCK deposit field
2. Click "Deposit STOCK"
3. Confirm the transaction in MetaMask
4. Verify Bob's STOCK balance in the exchange updates

### 8. Place Sell Order (Bob)

1. Enter `10` for Amount (STOCK)
2. Enter `0.1` for Price (ETH per STOCK)
3. Ensure "Sell Order" is selected
4. Click "Place Order"
5. Confirm the transaction in MetaMask
6. Verify the order appears in the Order Book

### 9. Verify Order Book

1. Check that both orders appear in the Order Book section
2. Verify the order details are correct:
   - Alice's buy order: 10 STOCK at 0.1 ETH each
   - Bob's sell order: 10 STOCK at 0.1 ETH each

### 10. Trigger Order Matching (Admin)

1. As an admin, use the backend API to trigger matching:
   ```bash
   curl -X POST http://localhost:5001/trigger-matching
   ```
2. Verify a successful response

### 11. Process Matching Results (Admin)

1. As an admin, use the backend API to process the results:
   ```bash
   curl -X POST http://localhost:5001/process-results/0
   ```
2. Verify a successful response

### 12. Verify Final State

1. Check that both orders are marked as filled in the Order Book
2. Switch to Alice's account and verify her balances:
   - ETH balance should be decreased by 1 ETH
   - STOCK balance should be increased by 10 tokens
3. Switch to Bob's account and verify his balances:
   - ETH balance should be increased by 1 ETH
   - STOCK balance should be decreased by 10 tokens

### 13. Withdraw Funds (Alice)

1. Using Alice's account:
   - Enter `10` in the STOCK withdraw field
   - Click "Withdraw STOCK"
   - Confirm the transaction in MetaMask
   - Verify Alice's STOCK balance in MetaMask increases

### 14. Withdraw Funds (Bob)

1. Using Bob's account:
   - Enter `1` in the ETH withdraw field
   - Click "Withdraw ETH"
   - Confirm the transaction in MetaMask
   - Verify Bob's ETH balance in MetaMask increases

### 15. Test Theme Toggle

1. Note that the UI defaults to dark theme on first load
2. Click on the theme toggle button (🌙) in the header to switch to light theme
3. Verify the UI switches to light theme (☀️)
4. Refresh the page and verify the light theme preference persists
5. Click the theme toggle button (☀️) again to switch back to dark theme
6. Verify the UI returns to dark theme (🌙)
7. Refresh the page and verify the dark theme preference persists

## Troubleshooting

If you encounter issues during testing:

1. Check the browser console for any JavaScript errors
2. Verify network connectivity to the backend ([http://localhost:5001](http://localhost:5001))
3. Ensure MetaMask is connected to the correct network (Localhost 8545)
4. Check Docker Compose logs for any backend/contract errors:
   ```bash
   docker compose logs -f backend
   ```

## Test Result Validation

The test is successful if:
1. All orders are properly displayed in the UI
2. The order matching process completes successfully
3. Balances update correctly after trading
4. Funds can be withdrawn back to the wallet
5. Theme toggle correctly switches between light and dark modes (with dark mode as default)
