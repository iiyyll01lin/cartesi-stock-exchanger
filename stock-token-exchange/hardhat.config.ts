import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Export contract deployments to frontend
import "./scripts/export-deployments";

// Default private key (DO NOT use in production)
const DEFAULT_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat default #0

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  
  networks: {
    // Hardhat local network 
    hardhat: {
      chainId: 31337
    },
    
    // Localhost with Cartesi Compute installed
    localhost: {
      url: "http://localhost:8545",
      accounts: [process.env.PRIVATE_KEY || DEFAULT_PRIVATE_KEY],
      timeout: 60000
    },
    
    // Add additional network configurations as needed
    // e.g. testnet configurations for deploying to public networks
  },
  
  // Named accounts for deployment scripts
  namedAccounts: {
    deployer: {
      default: 0, // Use the first account as deployer by default
    },
    admin: {
      default: 0, // Use the first account as admin by default
    }
  },
  
  // External contract information (Cartesi Compute address per network)
  external: {
    contracts: [
      {
        artifacts: "node_modules/@cartesi/compute-sdk/export/artifacts",
        deploy: "node_modules/@cartesi/compute-sdk/export/deploy"
      }
    ],
    deployments: {
      localhost: ["node_modules/@cartesi/compute-sdk/export/deployments/localhost"],
      // Add other networks as needed
    }
  },
  
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
};

export default config;