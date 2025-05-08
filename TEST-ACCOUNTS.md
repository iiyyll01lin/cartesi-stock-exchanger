# Testing Information for Cartesi Stock Exchange

## Default Hardhat Accounts

When running a local Hardhat network, these accounts are pre-funded with 10,000 ETH:

1. Account #0: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
   - Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

2. Account #1: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
   - Private Key: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

3. Account #2: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
   - Private Key: `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a`

4. Account #3: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`
   - Private Key: `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6`

5. Account #4: `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`
   - Private Key: `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a`

## How to Add Test ETH to MetaMask

1. Open MetaMask and ensure you're connected to the localhost network (http://localhost:8545)
2. Click on your account icon → Import Account
3. Select "Private Key" and paste one of the private keys above
4. The imported account will have 10,000 ETH for testing

## Using These Accounts for Testing

- **Account #0** is typically used as the contract deployer/admin
- You can use any of these accounts to test the deposit/withdrawal functionality
- The stock exchange contracts should recognize these addresses
