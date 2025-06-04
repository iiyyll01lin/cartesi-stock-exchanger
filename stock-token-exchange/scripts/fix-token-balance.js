// Check chain state and mint tokens manually if needed
const { ethers } = require("hardhat");

async function main() {
  console.log("Checking chain state and token balances...");
  
  // Get signers
  const [deployer] = await ethers.getSigners();
  console.log(`Using deployer account: ${deployer.address}`);
  
  // Bob's address (Account #1)
  const bobAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  console.log(`Bob's address: ${bobAddress}`);
  
  // Get token contract
  const tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  console.log(`Token address: ${tokenAddress}`);
  const stockToken = await ethers.getContractAt("StockToken", tokenAddress);
  
  // Get token details
  const name = await stockToken.name();
  const symbol = await stockToken.symbol();
  const decimals = await stockToken.decimals();
  console.log(`Token details: ${name} (${symbol}), ${decimals} decimals`);
  
  // Get token owner
  const owner = await stockToken.owner();
  console.log(`Token owner: ${owner}`);
  console.log(`Is deployer the owner? ${owner === deployer.address}`);
  
  // Check Bob's balance
  const bobBalance = await stockToken.balanceOf(bobAddress);
  console.log(`Bob's current balance: ${ethers.formatUnits(bobBalance, decimals)} ${symbol}`);
  
  // Check total supply
  const totalSupply = await stockToken.totalSupply();
  console.log(`Total supply: ${ethers.formatUnits(totalSupply, decimals)} ${symbol}`);
  
  // If Bob's balance is 0, mint tokens
  if (bobBalance.eq(0)) {
    console.log("Bob has no tokens. Attempting to mint 1000 AAPL tokens...");
    
    if (owner !== deployer.address) {
      console.error("Cannot mint tokens: deployer is not the token owner");
      return;
    }
    
    const mintAmount = ethers.parseUnits("1000", 18); // 1000 tokens
    const tx = await stockToken.mint(bobAddress, mintAmount);
    console.log(`Mint transaction sent: ${tx.hash}. Waiting for confirmation...`);
    await tx.wait();
    
    // Check new balance
    const newBalance = await stockToken.balanceOf(bobAddress);
    console.log(`Bob's new balance: ${ethers.formatUnits(newBalance, decimals)} ${symbol}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error:", error);
    process.exit(1);
  });
