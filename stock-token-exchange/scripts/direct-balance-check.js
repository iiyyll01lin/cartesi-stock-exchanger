// Direct fetch of token balance using ethers.js without hardhat
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  // Configure provider
  const provider = new ethers.JsonRpcProvider('http://localhost:8545');
  
  // Get ABI from our fallback file
  const tokenAbiPath = path.join(__dirname, '../frontend/scripts/fallback-abis/token-abi.json');
  const tokenAbi = JSON.parse(fs.readFileSync(tokenAbiPath, 'utf8'));
  
  // Token contract address
  const tokenAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  
  // Connect to token contract
  const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
  
  // Bob's address
  const bobAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  
  // Get token details
  const name = await tokenContract.name();
  const symbol = await tokenContract.symbol();
  const decimals = await tokenContract.decimals();
  
  console.log(`Token details: ${name} (${symbol}), ${decimals} decimals`);
  
  // Get Bob's balance
  const balance = await tokenContract.balanceOf(bobAddress);
  console.log(`Bob's token balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
  
  // Get connected account
  const accounts = await provider.listAccounts();
  console.log('Available accounts:', accounts);
  
  // Check if Bob's address is among the available accounts
  const isBobAvailable = accounts.some(account => 
    account.toLowerCase() === bobAddress.toLowerCase()
  );
  
  console.log(`Is Bob's address available: ${isBobAvailable}`);
}

main()
  .then(() => console.log('Balance check completed'))
  .catch(error => console.error('Error checking balance:', error));
