// Check exchange contract methods and balances
const ethers = require('ethers');
const fs = require('fs');
const path = require('path');

// Read ABIs
const exchangeABI = require('../artifacts/contracts/Exchange.sol/Exchange.json').abi;
const tokenABI = require('../artifacts/contracts/StockToken.sol/StockToken.json').abi;

// Get contract addresses from deployments
const deployments = JSON.parse(fs.readFileSync(path.join(__dirname, '../deployments/localhost/deployments.json'), 'utf8'));
const exchangeAddress = deployments.Exchange;
const tokenAddress = deployments.StockToken;

async function main() {
  try {
    // Connect to local blockchain
    const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    console.log('Connected to provider');
    
    // Check network
    const network = await provider.getNetwork();
    console.log('Network:', network);
    
    // Get accounts
    const accounts = await provider.listAccounts();
    console.log('Accounts available:', accounts.length);
    console.log('First account:', accounts[0]);
    
    // Connect contracts
    const exchangeContract = new ethers.Contract(exchangeAddress, exchangeABI, provider);
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, provider);
    console.log('Contracts initialized');
    
    // Check if contract functions exist
    const exchangeFunctions = Object.keys(exchangeContract.functions);
    console.log('Exchange contract functions:', exchangeFunctions);
    
    // Check balances for first account
    const userAddress = accounts[0];
    
    // ETH balance in wallet
    const ethBalance = await provider.getBalance(userAddress);
    console.log('ETH wallet balance:', ethers.utils.formatEther(ethBalance));
    
    // Token balance in wallet
    const tokenBalance = await tokenContract.balanceOf(userAddress);
    console.log('Token wallet balance:', ethers.utils.formatEther(tokenBalance));
    
    // ETH balance in exchange
    let exchangeEthBalance;
    try {
      if (exchangeFunctions.includes('getUserEthBalance')) {
        exchangeEthBalance = await exchangeContract.getUserEthBalance(userAddress);
        console.log('Exchange ETH balance (getUserEthBalance):', ethers.utils.formatEther(exchangeEthBalance));
      } else {
        console.log('getUserEthBalance function not found');
      }
    } catch (error) {
      console.error('Error calling getUserEthBalance:', error.message);
    }
    
    // Token balance in exchange
    let exchangeTokenBalance;
    try {
      if (exchangeFunctions.includes('getUserTokenBalance')) {
        exchangeTokenBalance = await exchangeContract.getUserTokenBalance(userAddress, tokenAddress);
        console.log('Exchange token balance (getUserTokenBalance):', ethers.utils.formatEther(exchangeTokenBalance));
      } else {
        console.log('getUserTokenBalance function not found');
      }
    } catch (error) {
      console.error('Error calling getUserTokenBalance:', error.message);
    }
    
    // Check raw storage in contract
    if (exchangeFunctions.includes('ethDeposits')) {
      try {
        const ethDeposits = await exchangeContract.ethDeposits(userAddress);
        console.log('Raw ethDeposits storage:', ethers.utils.formatEther(ethDeposits));
      } catch (error) {
        console.error('Error reading ethDeposits:', error.message);
      }
    } else {
      console.log('ethDeposits accessor not available (private mapping)');
    }
    
    console.log('Verification complete');
  } catch (error) {
    console.error('Error:', error);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
