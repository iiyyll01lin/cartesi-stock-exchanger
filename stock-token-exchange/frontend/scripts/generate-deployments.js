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

// Check if we can get contract information from environment variables
const getAddressFromEnv = (varName) => {
  if (process.env[varName]) {
    console.log(`Using ${varName} from environment: ${process.env[varName]}`);
    return process.env[varName];
  }
  return null;
};

// Read the contract files
try {
  const exchangeFilePath = path.join(DEPLOYMENTS_DIR, 'Exchange.json');
  const stockTokenFilePath = path.join(DEPLOYMENTS_DIR, 'StockToken.json');
  
  let exchangeDeployment, stockTokenDeployment;
  
  // Try to read from deployment files if they exist
  if (fs.existsSync(exchangeFilePath) && fs.existsSync(stockTokenFilePath)) {
    console.log('Found contract deployment files, using those...');
    exchangeDeployment = JSON.parse(fs.readFileSync(exchangeFilePath, 'utf8'));
    stockTokenDeployment = JSON.parse(fs.readFileSync(stockTokenFilePath, 'utf8'));
  } 
  // Fall back to hardcoded values from previous successful deployment
  else {
    console.log('Deployment files not found, using fallback values...');
    
    // Try to get addresses from environment variables first
    const exchangeAddress = getAddressFromEnv('EXCHANGE_CONTRACT_ADDRESS') || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
    const tokenAddress = getAddressFromEnv('STOCK_TOKEN_ADDRESS') || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
    
    // Create minimal deployment objects with addresses
    exchangeDeployment = { 
      address: exchangeAddress,
      abi: require('./fallback-abis/exchange-abi.json')
    };
    
    stockTokenDeployment = {
      address: tokenAddress,
      abi: require('./fallback-abis/token-abi.json')
    };
  }
  
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
