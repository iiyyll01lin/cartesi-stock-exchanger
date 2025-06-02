import * as fs from 'fs';
import * as path from 'path';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

// Cartesi template hash file path
const TEMPLATE_HASH_FILE = path.join(__dirname, '..', '..', 'stock-token-exchange', 'cartesi-machine', 'template-hash.txt');

// Default template hash (fallback)
const DEFAULT_TEMPLATE_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

// Read template hash from file or use default
const getTemplateHash = (): string => {
  try {
    if (fs.existsSync(TEMPLATE_HASH_FILE)) {
      const hash = fs.readFileSync(TEMPLATE_HASH_FILE, 'utf8').trim();
      console.log(`Using Cartesi template hash from file: ${hash}`);
      return hash;
    }
  } catch (error) {
    console.warn(`Warning: Could not read template hash from ${TEMPLATE_HASH_FILE}: ${error}`);
  }
  
  console.warn(`Warning: Using default template hash: ${DEFAULT_TEMPLATE_HASH}`);
  return DEFAULT_TEMPLATE_HASH;
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  // Check compiler settings
  console.log('Checking Hardhat configuration...');
  console.log(`Solidity compiler version: ${hre.config.solidity.compilers[0].version}`);
  console.log(`ViaIR enabled: ${hre.config.solidity.compilers[0].settings.viaIR}`);
  console.log(`Optimizer enabled: ${hre.config.solidity.compilers[0].settings.optimizer.enabled}`);

  console.log(`Deployer address: ${deployer}`);
  
  // Deploy StockToken
  console.log('Deploying StockToken...');
  const stockToken = await deploy('StockToken', {
    from: deployer,
    args: ["Stock Token", "STOCK", deployer], // Name, symbol, and initial owner
    log: true,
  });
  console.log(`StockToken deployed at: ${stockToken.address}`);
  
  // Deploy MockCartesiCompute
  console.log('Deploying MockCartesiCompute...');
  const mockCartesiCompute = await deploy('MockCartesiCompute', {
    from: deployer,
    args: [], // No constructor arguments
    log: true,
  });
  console.log(`MockCartesiCompute deployed at: ${mockCartesiCompute.address}`);

  // Attempt to get the real CartesiCompute address (from Cartesi SDK deployment)
  let realCartesiComputeAddress: string;
  try {
    // This assumes the Cartesi SDK deploys a contract named 'CartesiCompute'
    // Adjust the name if the SDK uses a different one (e.g., 'InputBox')
    const cartesiComputeSdk = await get('CartesiCompute'); // Or the correct name for the main Cartesi interaction contract
    realCartesiComputeAddress = cartesiComputeSdk.address;
    console.log(`Found real CartesiCompute SDK contract at: ${realCartesiComputeAddress}`);
  } catch (e) {
    console.warn(`Real CartesiCompute SDK contract not found or network not configured for it. Using MockCartesiCompute address as placeholder for real: ${mockCartesiCompute.address}. Error: ${(e as Error).message}`);
    // Fallback: if real CartesiCompute is not found (e.g. local test without SDK deployed),
    // use mock address as a placeholder to avoid deployment failure.
    // The Exchange contract logic should handle this (e.g. admin can update later).
    realCartesiComputeAddress = mockCartesiCompute.address; // Placeholder
  }
  
  const templateHash = getTemplateHash();
  
  // Simple and clear: defaults to mock unless explicitly set to 'real'
  const startWithMock = process.env.INITIAL_CARTESI_MODE !== 'real';
  const initialCartesiComputeAddress = startWithMock ? mockCartesiCompute.address : realCartesiComputeAddress;

  console.log(`Deploying Exchange in ${startWithMock ? 'MOCK' : 'REAL'} Cartesi mode`);
  const exchange = await deploy('Exchange', {
    from: deployer,
    args: [
      realCartesiComputeAddress, // Corrected: Pass the actual real Cartesi address
      mockCartesiCompute.address, // Corrected: Pass the mock Cartesi address
      templateHash,
      startWithMock
    ],
    log: true,
  });
  console.log(`Exchange deployed at: ${exchange.address}`);
  
  // Mint some initial tokens to deployer
  const initialMintAmount = ethers.parseEther('1000'); // 1000 tokens
  console.log(`Minting initial tokens: ${ethers.formatEther(initialMintAmount)} STOCK`);
  
  const stockTokenContract = await ethers.getContractAt('StockToken', stockToken.address);
  await stockTokenContract.mint(deployer, initialMintAmount);
  
  // Deposit some initial ETH to Exchange for testing
  const initialEthDeposit = ethers.parseEther('1'); // 1 ETH
  console.log(`Depositing ${ethers.formatEther(initialEthDeposit)} ETH to Exchange`);
  
  const exchangeContract = await ethers.getContractAt('Exchange', exchange.address);
  await exchangeContract.depositETH({ value: initialEthDeposit });
  
  console.log('Initial setup completed successfully!');
  
  // Update environment variables
  const updateEnvFile = (envFilePath: string, isRoot: boolean) => {
    const prefix = isRoot ? "Root " : "";
    try {
      let envContent = "";
      if (fs.existsSync(envFilePath)) {
        console.log(`Updating ${prefix}.env file with contract addresses...`);
        envContent = fs.readFileSync(envFilePath, 'utf8');
      } else {
        console.log(`Creating new ${prefix}.env file with contract addresses...`);
      }
      
      const updates = {
        EXCHANGE_CONTRACT_ADDRESS: exchange.address,
        STOCK_TOKEN_ADDRESS: stockToken.address,
        // Store the active one, plus specific real/mock addresses
        CARTESI_COMPUTE_ADDRESS: initialCartesiComputeAddress, 
        REAL_CARTESI_COMPUTE_ADDRESS: realCartesiComputeAddress,
        MOCK_CARTESI_COMPUTE_ADDRESS: mockCartesiCompute.address,
        CARTESI_TEMPLATE_HASH: templateHash,
        INITIAL_CARTESI_MODE: startWithMock ? 'mock' : 'real'
      };

      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (envContent.match(regex)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      }
      
      // Add default values if not present and creating new root .env
      if (!fs.existsSync(envFilePath) && isRoot) {
        if (!envContent.includes("NODE_URL=")) envContent += "\nNODE_URL=http://localhost:8545";
        if (!envContent.includes("MAX_ORDERS_PER_BATCH=")) envContent += "\nMAX_ORDERS_PER_BATCH=100";
      }
      
      fs.writeFileSync(envFilePath, envContent.trim() + '\n'); // Ensure a trailing newline
      console.log(`${prefix}Environment file updated successfully!`);
      
    } catch (error) {
      console.warn(`Warning: Could not update ${prefix}.env file: ${error}`);
    }
  };

  const stockTokenExchangeEnvPath = path.join(__dirname, '..', '..', 'stock-token-exchange', '.env');
  updateEnvFile(stockTokenExchangeEnvPath, false);

  const rootEnvFilePath = path.join(__dirname, '..', '..', '..', '.env');
  updateEnvFile(rootEnvFilePath, true);
};

func.tags = ['StockExchange'];

export default func;