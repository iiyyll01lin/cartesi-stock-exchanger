/**
 * This script submits a mock result to the MockCartesiCompute contract.
 * It simulates what would happen when Cartesi Compute returns a result.
 * 
 * Usage: npx hardhat run scripts/submit-mock-result.js --network localhost [computationIndex] [encodedData]
 */

const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  // Get the computation index and encoded data from command line args
  // Parse command line arguments, handling both direct script and hardhat run scripts
  let args = process.argv.slice(2);
  
  // When running with hardhat run script, we need to account for the network argument
  if (args.length > 0 && (args[0] === '--network' || args[0].startsWith('--'))) {
    // Skip the '--network localhost' arguments if present
    args = args.slice(2);
  }
  
  const computationIndex = args[0];
  const encodedData = args[1];
  
  if (!computationIndex) {
    console.error("Error: Missing computation index argument");
    console.error("Usage: npx hardhat run scripts/submit-mock-result.js --network localhost <computationIndex> <encodedData>");
    process.exit(1);
  }
  
  if (!encodedData) {
    console.error("Error: Missing encoded data argument");
    console.error("Usage: npx hardhat run scripts/submit-mock-result.js --network localhost <computationIndex> <encodedData>");
    process.exit(1);
  }
  
  console.log(`Submitting mock result for computation index: ${computationIndex}`);
  
  try {
    // Get the MockCartesiCompute contract instance
    let mockCartesiComputeAddress = process.env.CARTESI_COMPUTE_ADDRESS;
    let mockCartesiCompute;
    
    // If not in env, try to get from deployments
    if (!mockCartesiComputeAddress) {
      try {
        const { deployments } = hre;
        if (deployments && typeof deployments.get === 'function') {
          const mockCartesiDeployment = await deployments.get('MockCartesiCompute');
          mockCartesiComputeAddress = mockCartesiDeployment.address;
          console.log(`Found MockCartesiCompute address from deployments: ${mockCartesiComputeAddress}`);
        } else {
          throw new Error("deployments.get is not available");
        }
      } catch (deployError) {
        console.log("Couldn't find MockCartesiCompute in deployments, trying to read from file...");
        
        try {
          // Try to read from deployments JSON file
          const deploymentsPath = path.join(__dirname, '../deployments/localhost/MockCartesiCompute.json');
          if (fs.existsSync(deploymentsPath)) {
            const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
            mockCartesiComputeAddress = deployment.address;
            console.log(`Found MockCartesiCompute address from file: ${mockCartesiComputeAddress}`);
          } else {
            console.log("MockCartesiCompute.json not found, trying Exchange.json to extract Cartesi address...");
            // Try to get from Exchange.sol contract
            const exchangeDeploymentPath = path.join(__dirname, '../deployments/localhost/Exchange.json');
            if (fs.existsSync(exchangeDeploymentPath)) {
              const exchangeDeployment = JSON.parse(fs.readFileSync(exchangeDeploymentPath, 'utf8'));
              // Look at the constructor args
              if (exchangeDeployment.args && exchangeDeployment.args.length >= 1) {
                mockCartesiComputeAddress = exchangeDeployment.args[0];
                console.log(`Using CartesiCompute address from Exchange constructor args: ${mockCartesiComputeAddress}`);
              }
            }
          }
        } catch (fileError) {
          console.error(`Error reading deployment files: ${fileError.message}`);
        }
      }
    }
    
    if (!mockCartesiComputeAddress) {
      throw new Error("Could not determine MockCartesiCompute contract address!");
    }
    
    // Get signers
    const [deployer] = await ethers.getSigners();
    
    // Get the contract instance
    try {
      const MockCartesiComputeFactory = await ethers.getContractFactory("MockCartesiCompute");
      mockCartesiCompute = await MockCartesiComputeFactory.attach(mockCartesiComputeAddress);
      console.log(`Attached to MockCartesiCompute at address: ${mockCartesiComputeAddress}`);
    } catch (contractError) {
      console.error(`Error getting contract: ${contractError.message}`);
      
      // Fallback to using JSON Interface if contract factory fails
      try {
        const mockAbi = [
          "function submitResult(uint256 _index, bytes memory _resultData)",
          "function getResult(uint256 _index) view returns (bool, bool, address, bytes)"
        ];
        mockCartesiCompute = new ethers.Contract(
          mockCartesiComputeAddress,
          mockAbi,
          deployer
        );
        console.log("Created contract instance using minimal ABI");
      } catch (fallbackError) {
        console.error(`Failed to create contract with minimal ABI: ${fallbackError.message}`);
        throw fallbackError;
      }
    }
    
    // Now submit the result
    console.log(`Calling submitResult(${computationIndex}, ${encodedData.substring(0, 50)}...)`);
    const tx = await mockCartesiCompute.submitResult(computationIndex, encodedData);
    await tx.wait();
    console.log(`Result submitted successfully! Transaction hash: ${tx.hash}`);
    
    // Verify the result was stored by calling getResult
    const result = await mockCartesiCompute.getResult(computationIndex);
    console.log(`Verified result - hasResult: ${result[0]}, finalized: ${result[1]}`);
    
  } catch (error) {
    console.error(`Error submitting mock result: ${error.message}`);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
