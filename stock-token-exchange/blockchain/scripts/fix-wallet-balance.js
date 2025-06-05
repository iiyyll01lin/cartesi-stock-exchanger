const { ethers } = require("hardhat");

async function main() {
  try {
    console.log("Starting token balance diagnostic check and fix...");
    
    // Get signers
    const [owner, bob] = await ethers.getSigners();
    console.log(`Owner address: ${owner.address}`);
    console.log(`Bob's address: ${bob.address}`);
    
    // Get token contract
    const tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    console.log(`Token address: ${tokenAddress}`);
    const stockToken = await ethers.getContractAt("StockToken", tokenAddress);
    
    // Get token details
    const name = await stockToken.name();
    const symbol = await stockToken.symbol();
    const decimals = await stockToken.decimals();
    console.log(`Token details: ${name} (${symbol}), ${decimals} decimals`);
    
    // Check balances
    const ownerBalance = await stockToken.balanceOf(owner.address);
    console.log(`Owner's token balance: ${ethers.formatEther(ownerBalance)} ${symbol}`);
    
    const bobBalance = await stockToken.balanceOf(bob.address);
    console.log(`Bob's token balance: ${ethers.formatEther(bobBalance)} ${symbol}`);
    
    // If Bob has no tokens, mint some
    if (bobBalance.eq(0)) {
      console.log("Bob has no tokens! Attempting to mint 1000 tokens to Bob's address...");
      const tx = await stockToken.connect(owner).mint(bob.address, ethers.parseEther("1000"));
      await tx.wait();
      console.log("Tokens minted! Transaction hash:", tx.hash);
      
      // Verify the new balance
      const newBalance = await stockToken.balanceOf(bob.address);
      console.log(`Bob's new token balance: ${ethers.formatEther(newBalance)} ${symbol}`);
    }

    // Check if Bob's wallet is properly approved for the Exchange
    const exchangeAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    const exchange = await ethers.getContractAt("Exchange", exchangeAddress);
    const allowance = await stockToken.allowance(bob.address, exchangeAddress);
    console.log(`Bob's allowance for the exchange: ${ethers.formatEther(allowance)} ${symbol}`);
    
    if (allowance.lt(ethers.parseEther("1000"))) {
      console.log("Setting approval for Exchange contract...");
      const approveTx = await stockToken.connect(bob).approve(exchangeAddress, ethers.parseEther("1000"));
      await approveTx.wait();
      console.log("Approval set! Transaction hash:", approveTx.hash);
      
      // Verify the new allowance
      const newAllowance = await stockToken.allowance(bob.address, exchangeAddress);
      console.log(`Bob's new allowance for the exchange: ${ethers.formatEther(newAllowance)} ${symbol}`);
    }
    
    // Get exchange token balance for Bob
    let exchangeTokenBalance;
    try {
      exchangeTokenBalance = await exchange.getUserTokenBalance(bob.address, tokenAddress);
      console.log(`Bob's exchange token balance: ${ethers.formatEther(exchangeTokenBalance)} ${symbol}`);
    } catch (error) {
      console.error("Error getting exchange token balance:", error);
      exchangeTokenBalance = BigInt(0);
    }
    
    // Deposit tokens to the exchange if needed
    if (exchangeTokenBalance.lt(ethers.parseEther("100"))) {
      console.log("Depositing tokens to the exchange for Bob...");
      try {
        // Deposit 100 tokens to the exchange
        const depositAmount = ethers.parseEther("100");
        const depositTx = await exchange.connect(bob).depositToken(tokenAddress, depositAmount);
        await depositTx.wait();
        console.log("Tokens deposited to exchange! Transaction hash:", depositTx.hash);
        
        // Verify the new exchange balance
        const newExchangeBalance = await exchange.getUserTokenBalance(bob.address, tokenAddress);
        console.log(`Bob's new exchange token balance: ${ethers.formatEther(newExchangeBalance)} ${symbol}`);
      } catch (error) {
        console.error("Error depositing tokens to exchange:", error);
      }
    }
    
    console.log("Balance check and fixes completed successfully!");
  } catch (error) {
    console.error("Error in diagnosis script:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error in script:", error);
    process.exit(1);
  });
