// Direct check of Bob's token balance
const { ethers } = require("hardhat");

async function main() {
  console.log("Checking Bob's token balance directly from contract...");
  
  // Bob's address from TEST-ACCOUNTS.md
  const bobAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  
  // Get the deployed token contract
  const tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const stockToken = await ethers.getContractAt("StockToken", tokenAddress);
  
  // Check balance
  const balance = await stockToken.balanceOf(bobAddress);
  console.log(`Bob's AAPL token balance: ${ethers.utils.formatEther(balance)} AAPL`);
  
  // Get the contract name and symbol for verification
  const name = await stockToken.name();
  const symbol = await stockToken.symbol();
  console.log(`Token details: ${name} (${symbol})`);
  
  // Check total supply
  const totalSupply = await stockToken.totalSupply();
  console.log(`Total supply: ${ethers.utils.formatEther(totalSupply)} ${symbol}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
