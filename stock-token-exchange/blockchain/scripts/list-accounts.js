// Simple script to list Hardhat accounts and balances
async function main() {
  const accounts = await ethers.getSigners();
  
  console.log("Default Hardhat Accounts:");
  for (let i = 0; i < accounts.length; i++) {
    const balance = await ethers.provider.getBalance(accounts[i].address);
    console.log(
      `${i}: ${accounts[i].address} (${ethers.formatEther(balance)} ETH)`
    );
    if (i === 0) {
      console.log(`   Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
