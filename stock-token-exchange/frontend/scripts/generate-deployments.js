// Simple script to generate deployments file from contract artifacts
const fs = require('fs');
const path = require('path');

// Determine if we're running in Docker or locally
const isDocker = fs.existsSync('/app/deployments_src');

// Set paths based on environment
const DEPLOYMENTS_DIR = isDocker 
  ? '/app/deployments_src/localhost' 
  : path.join(__dirname, '../../deployments/localhost');
  
const OUTPUT_DIR = isDocker
  ? '/app/src/deployments'
  : path.join(__dirname, '../src/deployments');
  
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'index.ts');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  console.log(`Creating directory: ${OUTPUT_DIR}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('Reading contract deployments...');

// Read the contract files
try {
  const exchangeFilePath = path.join(DEPLOYMENTS_DIR, 'Exchange.json');
  const stockTokenFilePath = path.join(DEPLOYMENTS_DIR, 'StockToken.json');
  
  if (!fs.existsSync(exchangeFilePath)) {
    throw new Error(`Exchange contract file not found at ${exchangeFilePath}`);
  }
  
  if (!fs.existsSync(stockTokenFilePath)) {
    throw new Error(`StockToken contract file not found at ${stockTokenFilePath}`);
  }
  
  const exchangeDeployment = JSON.parse(fs.readFileSync(exchangeFilePath, 'utf8'));
  const stockTokenDeployment = JSON.parse(fs.readFileSync(stockTokenFilePath, 'utf8'));
  
  console.log(`Exchange address: ${exchangeDeployment.address}`);
  console.log(`StockToken address: ${stockTokenDeployment.address}`);
  
  // Create a backup of existing file if it exists
  if (fs.existsSync(OUTPUT_FILE)) {
    const backupFile = `${OUTPUT_FILE}.bak`;
    console.log(`Creating backup of existing file at ${backupFile}`);
    fs.copyFileSync(OUTPUT_FILE, backupFile);
  }
  
  // Generate the TypeScript file content
  const content = `// This file is auto-generated from contract deployment information
// Generated on: ${new Date().toISOString()}

// Contract addresses
export const EXCHANGE_ADDRESS = "${exchangeDeployment.address}";
export const STOCK_TOKEN_ADDRESS = "${stockTokenDeployment.address}";

// Contract ABIs - Full ABIs from deployment files
export const EXCHANGE_ABI = ${JSON.stringify(exchangeDeployment.abi, null, 2)};
export const STOCK_TOKEN_ABI = ${JSON.stringify(stockTokenDeployment.abi, null, 2)};

// Network info (Hardhat local network)
export const CONTRACT_CHAIN_ID = 31337;

// Default export with all info
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
  
  // Write the file
  fs.writeFileSync(OUTPUT_FILE, content);
  console.log(`Successfully wrote deployments to: ${OUTPUT_FILE}`);
} catch (error) {
  console.error('Error generating deployments file:', error);
  process.exit(1);
}
