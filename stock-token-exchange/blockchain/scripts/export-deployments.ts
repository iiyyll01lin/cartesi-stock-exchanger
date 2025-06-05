import { extendEnvironment } from "hardhat/config";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import hre from "hardhat";

// This script exports contract deployments data to the frontend
// It outputs address and ABI information after each deployment

extendEnvironment((hre) => {
  // Listen for the "deployments.complete" event which triggers after a deployment is completed
  hre.deployments.on("deployments.complete", async () => {
    const { network } = hre;
    console.log(`\nExporting contract deployments for network ${network.name}...`);
    
    // Get all deployed contracts
    const allDeployments = await hre.deployments.all();
    
    // Create a simplified deployment object with just addresses and ABIs
    const deploymentData: Record<string, any> = {};
    
    for (const [name, deployment] of Object.entries(allDeployments)) {
      // Only include our contracts (Exchange and StockToken)
      if (name === "Exchange" || name === "StockToken") {
        console.log(`Processing contract: ${name}`);
        
        // Get the full ABI from artifacts
        const artifact = await hre.artifacts.readArtifact(name);
        
        deploymentData[name] = {
          address: deployment.address,
          abi: artifact.abi,
          chainId: network.config.chainId || 31337
        };
      }
    }
    
    // Create directories if they don't exist
    const frontendDir = resolve(__dirname, "../frontend");
    const deploymentDir = join(frontendDir, "src/deployments");
    
    if (!existsSync(deploymentDir)) {
      mkdirSync(deploymentDir, { recursive: true });
    }
    
    // Write deployment data to a JSON file
    const deploymentFile = join(deploymentDir, `${network.name}.json`);
    writeFileSync(
      deploymentFile,
      JSON.stringify(deploymentData, null, 2)
    );
    
    // Create an index.ts file to export the contract info
    const indexFile = join(deploymentDir, "index.ts");
    
    const indexContent = `
// This file is auto-generated after contract deployment
import { ethers } from 'ethers';
import ${network.name}Deployments from './${network.name}.json';

// Contract addresses
export const EXCHANGE_ADDRESS = ${network.name}Deployments.Exchange.address as string;
export const STOCK_TOKEN_ADDRESS = ${network.name}Deployments.StockToken.address as string;

// Contract ABIs
export const EXCHANGE_ABI = ${network.name}Deployments.Exchange.abi;
export const STOCK_TOKEN_ABI = ${network.name}Deployments.StockToken.abi;

// Network info
export const CONTRACT_CHAIN_ID = ${network.name}Deployments.Exchange.chainId as number;

export default {
  exchange: {
    address: EXCHANGE_ADDRESS,
    abi: EXCHANGE_ABI
  },
  stockToken: {
    address: STOCK_TOKEN_ADDRESS,
    abi: STOCK_TOKEN_ABI
  },
  chainId: CONTRACT_CHAIN_ID
};
`;
    
    writeFileSync(indexFile, indexContent);
    
    console.log(`Contract deployments exported to: ${deploymentFile}`);
    console.log(`Contract TypeScript exports created at: ${indexFile}`);
  });
});