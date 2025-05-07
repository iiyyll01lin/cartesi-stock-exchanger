// Direct check of exchange contract
const { ethers } = require("hardhat");

async function main() {
  try {
    // Get deployed contract
    const Exchange = await ethers.getContractFactory("Exchange");
    const StockToken = await ethers.getContractFactory("StockToken");
    
    // Use hardhat-deploy to get the deployed contracts
    const exchange = await ethers.getContract("Exchange");
    const stockToken = await ethers.getContract("StockToken");
    
    console.log("Exchange address:", exchange.address);
    console.log("Token address:", stockToken.address);
    
    // Get first account
    const [owner] = await ethers.getSigners();
    console.log("Using account:", owner.address);
    
    // Check balances
    const ethBalance = await exchange.getUserEthBalance(owner.address);
    console.log("ETH in exchange:", ethers.utils.formatEther(ethBalance));
    
    const tokenBalance = await exchange.getUserTokenBalance(owner.address, stockToken.address);
    console.log("Tokens in exchange:", ethers.utils.formatEther(tokenBalance));
    
    // Deposit 1 ETH for testing
    console.log("Depositing 1 ETH...");
    const depositTx = await exchange.depositETH({ value: ethers.utils.parseEther("1.0") });
    await depositTx.wait();
    console.log("Deposit transaction confirmed");
    
    // Check balance again
    const newEthBalance = await exchange.getUserEthBalance(owner.address);
    console.log("New ETH in exchange:", ethers.utils.formatEther(newEthBalance));
    
    // Check balances using direct mapping (requires exposing mapping in contract)
    try {
      // This will only work if ethDeposits is public and accessible
      const directEthBalance = await exchange.ethDeposits(owner.address);
      console.log("Direct access to ethDeposits:", ethers.utils.formatEther(directEthBalance));
    } catch (error) {
      console.log("Could not directly access ethDeposits (normal if it's private)");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
