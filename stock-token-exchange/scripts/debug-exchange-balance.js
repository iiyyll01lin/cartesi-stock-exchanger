// filepath: /mnt/d/workspace/cartesi-stock-exchange/stock-token-exchange/scripts/debug-exchange-balance.js
const { ethers } = require("hardhat");

/**
 * This script checks exchange token balances for Bob and deposits tokens if needed
 */
async function main() {
  try {
    console.log("Starting exchange token balance diagnostic...");
    
    // Get signers
    const [owner, bob] = await ethers.getSigners();
    console.log(`Owner address: ${owner.address}`);
    console.log(`Bob's address: ${bob.address}`);
    
    // Contract addresses
    const tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const exchangeAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    console.log(`Token address: ${tokenAddress}`);
    console.log(`Exchange address: ${exchangeAddress}`);
    
    // Get contract instances
    const stockToken = await ethers.getContractAt("StockToken", tokenAddress);
    const exchange = await ethers.getContractAt("Exchange", exchangeAddress);
    
    // Get token details
    const name = await stockToken.name();
    const symbol = await stockToken.symbol();
    const decimals = await stockToken.decimals();
    console.log(`Token details: ${name} (${symbol}), ${decimals} decimals`);
    
    // Check token balance in wallet
    const bobWalletBalance = await stockToken.balanceOf(bob.address);
    console.log(`Bob's wallet token balance: ${ethers.formatEther(bobWalletBalance)} ${symbol}`);
    
    // Check exchange token balance
    try {
      const bobExchangeBalance = await exchange.getUserTokenBalance(bob.address, tokenAddress);
      console.log(`Bob's exchange token balance: ${ethers.formatEther(bobExchangeBalance)} ${symbol}`);
      
      // If exchange balance is zero but wallet balance is not, deposit some tokens
      if (bobExchangeBalance.eq(0) && !bobWalletBalance.eq(0)) {
        console.log("Bob has tokens in wallet but not in exchange. Setting up deposit...");
        
        // Check allowance first
        const allowance = await stockToken.allowance(bob.address, exchangeAddress);
        console.log(`Current allowance: ${ethers.formatEther(allowance)} ${symbol}`);
        
        // Approve if needed
        if (allowance.lt(ethers.parseEther("100"))) {
          console.log("Setting approval for Exchange contract...");
          const approveTx = await stockToken.connect(bob).approve(exchangeAddress, ethers.parseEther("1000"));
          await approveTx.wait();
          console.log("Approval set! Transaction hash:", approveTx.hash);
        }
        
        // Deposit tokens to exchange
        console.log("Depositing 100 tokens to exchange...");
        const depositAmount = ethers.parseEther("100");
        const depositTx = await exchange.connect(bob).depositToken(tokenAddress, depositAmount);
        await depositTx.wait();
        console.log("Tokens deposited! Transaction hash:", depositTx.hash);
        
        // Verify the new exchange balance
        const newExchangeBalance = await exchange.getUserTokenBalance(bob.address, tokenAddress);
        console.log(`Bob's new exchange token balance: ${ethers.formatEther(newExchangeBalance)} ${symbol}`);
      }
    } catch (error) {
      console.error("Error checking exchange balance:", error);
    }
    
    console.log("Exchange balance diagnostic completed!");
  } catch (error) {
    console.error("Critical error in script:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
