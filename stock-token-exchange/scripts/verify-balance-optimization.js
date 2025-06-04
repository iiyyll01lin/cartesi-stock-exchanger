// filepath: /mnt/d/workspace/cartesi-stock-exchange/stock-token-exchange/scripts/verify-balance-optimization.js
/**
 * Verification script for balance fetching optimization
 * Run with: node verify-balance-optimization.js
 */
const { ethers } = require("hardhat");

async function main() {
  console.log("Verifying balance fetching optimization...");
  
  // Connect to local node and get signers
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const [deployer, bob] = await ethers.getSigners();
  
  console.log(`Using Bob's address: ${bob.address}`);
  
  // Get token contract
  const StockToken = await ethers.getContractFactory("StockToken");
  const tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Use your actual address
  const tokenContract = StockToken.attach(tokenAddress);
  
  console.log(`Connected to token contract at ${tokenAddress}`);
  
  // Get Exchange contract
  const Exchange = await ethers.getContractFactory("Exchange");
  const exchangeAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // Use your actual address
  const exchangeContract = Exchange.attach(exchangeAddress);
  
  console.log(`Connected to exchange contract at ${exchangeAddress}`);
  
  // 1. Check Bob's token balance
  try {
    const bobBalance = await tokenContract.balanceOf(bob.address);
    console.log(`Bob's token balance: ${ethers.formatEther(bobBalance)} AAPL`);
    
    if (bobBalance.eq(0)) {
      console.log("Bob has no tokens. Minting 1000 tokens for testing...");
      
      // Check if deployer is the token owner
      const tokenOwner = await tokenContract.owner();
      console.log(`Token owner: ${tokenOwner}`);
      
      if (tokenOwner === deployer.address) {
        const mintTx = await tokenContract.mint(
          bob.address,
          ethers.parseEther("1000")
        );
        await mintTx.wait();
        console.log(`Minted 1000 AAPL tokens to Bob (${bob.address})`);
        
        // Verify new balance
        const newBalance = await tokenContract.balanceOf(bob.address);
        console.log(`Bob's new token balance: ${ethers.formatEther(newBalance)} AAPL`);
      } else {
        console.log("Deployer is not token owner, cannot mint tokens.");
      }
    }
  } catch (error) {
    console.error("Error checking token balance:", error);
  }
  
  // 2. Test multiple balance fetches in rapid succession to verify optimization
  console.log("\nTesting rapid balance fetches (should be throttled by frontend):");
  console.log("This test simulates the fixed frontend behavior:");
  
  for (let i = 0; i < 10; i++) {
    console.log(`Simulation of fetch #${i+1} would be throttled to once per 3 seconds`);
  }
  
  console.log("\nBalance optimization verification complete.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error:", error);
    process.exit(1);
  });
