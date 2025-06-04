import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import * as dotenv from "dotenv";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// Load environment variables from .env file
dotenv.config();

// Default private key (DO NOT use in production)
const DEFAULT_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat default #0

// Enhanced compiler cache configuration
const getCompilerCachePath = () => {
  // Check for environment override
  if (process.env.HARDHAT_COMPILER_CACHE) {
    return process.env.HARDHAT_COMPILER_CACHE;
  }
  
  // Docker environment
  if (fs.existsSync('/app/.hardhat-cache')) {
    return '/app/.hardhat-cache';
  }
  
  // Default user cache
  return path.join(os.homedir(), '.cache', 'hardhat-nodejs');
};

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20", // For your main project contracts
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true, // Enable IR mode to solve "Stack too deep" errors
        },
      }
    ],
  },
  
  // Enhanced path configuration with compiler cache
  paths: {
    cache: process.env.HARDHAT_CACHE_DIR || "./cache",
    artifacts: "./artifacts",
    sources: "./contracts",
    tests: "./test",
  },

  // Network configurations with enhanced error handling
  networks: {
    // Hardhat local network 
    hardhat: {
      chainId: 31337,
      gas: 8000000,
      gasPrice: 1000000000,
      blockGasLimit: 10000000,
      allowUnlimitedContractSize: true,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
              count: 20
      },
      mining: {
        auto: true,
        interval: 0 // 立即挖掘，避免交易延遲
      }
    },
    
    // Localhost with Cartesi Compute installed
    localhost: {
      url: "http://blockchain:8545",  // Use Docker service name instead of localhost
      // Use all 20 default Hardhat accounts for testing
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        path: "m/44'/60'/0'/0",
        count: 20
      },
      gas: 8000000,    // 增加 gas 限制以處理複雜交易
      gasPrice: 1000000000, // 增加到 1 gwei，確保高於 baseFeePerGas
      blockGasLimit: 10000000, // 設置區塊 gas 限制
      allowUnlimitedContractSize: true, // 允許部署大型合約
      mining: {
        auto: true,
        interval: 1000 // 每 1 秒挖掘一個新區塊
      },
      hardfork: "london" // 使用 London 硬分叉，支持 EIP-1559
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
    }
  },
  
  // TypeChain configuration for ethers v6
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
    alwaysGenerateOverloads: false,
    externalArtifacts: ["externalArtifacts/*.json"],
    dontOverrideCompile: false
  },
};

export default config;