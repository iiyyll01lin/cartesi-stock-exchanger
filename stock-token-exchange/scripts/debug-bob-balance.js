// Direct check of Bob's token balance with detailed error logging
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  try {
    console.log("Starting balance check for Bob...");
    
    // Configure provider
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    console.log("Provider initialized");
    
    // Bob's address
    const bobAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    console.log(`Using Bob's address: ${bobAddress}`);
    
    // Load ABIs
    console.log("Loading contract ABIs...");
    const tokenAbiPath = path.join(__dirname, "../artifacts/contracts/StockToken.sol/StockToken.json");
    const tokenAbi = JSON.parse(fs.readFileSync(tokenAbiPath, "utf8")).abi;
    console.log("Token ABI loaded");
    
    // Token contract address - using hardcoded address from logs
    const tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    console.log(`Using token address: ${tokenAddress}`);
    
    // Connect to token contract
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
    console.log("Token contract instance created");
    
    // Get token info for verification
    const name = await tokenContract.name();
    const symbol = await tokenContract.symbol();
    const decimals = await tokenContract.decimals();
    console.log(`Token info: ${name} (${symbol}), ${decimals} decimals`);
    
    // Get Bob's balance with full error details
    console.log("Calling balanceOf for Bob...");
    try {
      const balance = await tokenContract.balanceOf(bobAddress);
      console.log(`Raw balance: ${balance.toString()}`);
      console.log(`Formatted balance: ${ethers.utils.formatUnits(balance, decimals)} ${symbol}`);
    } catch (balanceError) {
      console.error("Error fetching balance:", balanceError);
      
      // Try with a different provider implementation
      console.log("Trying with default provider...");
      const defaultProvider = ethers.getDefaultProvider("http://localhost:8545");
      const defaultTokenContract = new ethers.Contract(tokenAddress, tokenAbi, defaultProvider);
      try {
        const defaultBalance = await defaultTokenContract.balanceOf(bobAddress);
        console.log(`Balance using default provider: ${ethers.utils.formatUnits(defaultBalance, decimals)} ${symbol}`);
      } catch (defaultBalanceError) {
        console.error("Default provider also failed:", defaultBalanceError);
      }
    }
    
    // Try to get token owner
    try {
      console.log("Trying to get token owner...");
      const owner = await tokenContract.owner();
      console.log(`Token owner: ${owner}`);
    } catch (ownerError) {
      console.log("Could not get owner:", ownerError.message);
    }
    
    // Check total supply to see if any tokens exist
    try {
      console.log("Checking total supply...");
      const totalSupply = await tokenContract.totalSupply();
      console.log(`Total supply: ${ethers.utils.formatUnits(totalSupply, decimals)} ${symbol}`);
    } catch (supplyError) {
      console.error("Error checking total supply:", supplyError);
    }
    
  } catch (error) {
    console.error("Critical error in script:", error);
  }
}

main()
  .then(() => console.log("Debug completed"))
  .catch(error => console.error("Fatal error:", error));
