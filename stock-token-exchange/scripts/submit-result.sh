#!/bin/bash
# Submit the mock Cartesi computation result
# Usage: ./submit-result.sh <cartesi_index> <encoded_result_data>

# Set default values if not provided
CARTESI_INDEX=${1:-0}  # Default to index 0 if not provided
RESULT_DATA=${2:-"0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000016345785d8a0000"}  # Default data

echo "Submitting result for Cartesi index: $CARTESI_INDEX"
cd "$(dirname "$0")/.." || exit 1  # Move to project root

# Run the script in node directly to avoid hardhat argument parsing issues
npx hardhat run --network localhost scripts/submit-mock-result.js "$CARTESI_INDEX" "$RESULT_DATA"

# If that fails, try with node directly
if [ $? -ne 0 ]; then
  echo "Hardhat run failed, trying with node directly..."
  
  # Export the computation index and result data as environment variables
  export COMPUTATION_INDEX="$CARTESI_INDEX"
  export RESULT_DATA="$RESULT_DATA"
  
  # Use node directly with a modified version that reads from env vars
  node -e "
    const fs = require('fs');
    const path = require('path');
    const { ethers } = require('hardhat');
    
    async function main() {
      // Get values from environment
      const computationIndex = process.env.COMPUTATION_INDEX;
      const encodedData = process.env.RESULT_DATA;
      
      console.log(\`Submitting result for computation index: \${computationIndex}\`);
      
      // Get the MockCartesiCompute contract instance
      const MockCartesiCompute = await ethers.getContractFactory('MockCartesiCompute');
      // Get the deployed instance
      const deploymentPath = path.join(__dirname, 'deployments/localhost/MockCartesiCompute.json');
      let mockCartesiCompute;
      
      if (fs.existsSync(deploymentPath)) {
        const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        mockCartesiCompute = await MockCartesiCompute.attach(deployment.address);
        
        // Submit the result to the contract
        const tx = await mockCartesiCompute.submitResult(computationIndex, encodedData);
        await tx.wait();
        console.log(\`Successfully submitted result for index \${computationIndex}\`);
        console.log(\`Transaction hash: \${tx.hash}\`);
      } else {
        console.error('MockCartesiCompute deployment not found');
        process.exit(1);
      }
    }
    
    main().catch(error => {
      console.error(error);
      process.exit(1);
    });
  "
fi
