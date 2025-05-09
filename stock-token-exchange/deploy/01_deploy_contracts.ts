import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Template hash configuration
// This is the template hash from running build-machine.sh in cartesi-machine directory
// The hash file path is relative to this script
const TEMPLATE_HASH_FILE = "../cartesi-machine/template-hash.txt";
// Fallback placeholder hash (all zeros) for development without Cartesi machine
const PLACEHOLDER_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

// Read template hash from file if it exists, otherwise use placeholder
function getCartesiTemplateHash(): string {
  try {
    const hashFilePath = path.resolve(__dirname, TEMPLATE_HASH_FILE);
    if (fs.existsSync(hashFilePath)) { // Removed erroneous characters
      return fs.readFileSync(hashFilePath, "utf-8").trim();
    }
  } catch (error) {
    console.error(`Error reading template hash file: ${error}`);
  }
  
  console.log(`WARNING: Using placeholder Cartesi template hash.`);
  console.log(`Run "./build-machine.sh" in cartesi-machine directory to generate actual hash.`);
  return PLACEHOLDER_HASH;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers, network } = hre; // Ensure ethers is from hre, add network
  const { deploy, execute, get } = deployments; // Add execute and get
  const { deployer, admin } = await getNamedAccounts();

  const chainId = network.config.chainId; // Get chainId from network.config
  console.log(`Deploying to chain ID: ${chainId}`);
  console.log(`Deployer account: ${deployer}`);
  console.log(`Admin account: ${admin || deployer}`);

  // Get the Cartesi template hash
  const CARTESI_TEMPLATE_HASH = getCartesiTemplateHash();
  
  // 1. Deploy StockToken (for testing, we deploy a token for "Apple Inc.")
  const stockToken = await deploy("StockToken", {
    from: deployer,
    args: ["Apple Inc. Stock Token", "AAPL", deployer], // Added deployer as initialOwner
    log: true,
  });
  console.log(`StockToken deployed at ${stockToken.address}`);

  // 2. Get the Cartesi Compute contract address
  let cartesiComputeAddress;
  try {
    // Try to get the address from deployments
    const cartesiCompute = await deployments.get("CartesiCompute");
    cartesiComputeAddress = cartesiCompute.address;
    console.log(`Found CartesiCompute at ${cartesiComputeAddress}`);
  } catch (error) {
    console.log("CartesiCompute not found in deployments, check if it's deployed on this network");
    console.log("For testing, you can use a mock address");
    cartesiComputeAddress = "0x0000000000000000000000000000000000000001"; // Mock address for testing
  }

  // 3. Deploy Exchange
  const exchange = await deploy("Exchange", {
    from: deployer,
    args: [cartesiComputeAddress, CARTESI_TEMPLATE_HASH],
    log: true,
  });
  console.log(`Exchange deployed at ${exchange.address}`);

  // 4. Optional: Mint some tokens to the deployer for testing
  console.log(`Checking MINT_TEST_TOKENS environment variable: '${process.env.MINT_TEST_TOKENS}'`);
  if (process.env.MINT_TEST_TOKENS === "true") {
    console.log("MINT_TEST_TOKENS is true. Proceeding with minting test tokens.");
    const stockTokenContract = await ethers.getContractAt("StockToken", stockToken.address);
    const mintAmount = ethers.utils.parseUnits("1000", 18); // 1000 tokens with 18 decimals
    
    // Address for Bob (Account #1 from TEST-ACCOUNTS.md: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
    const bobAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; 

    console.log(`Attempting to mint ${ethers.utils.formatUnits(mintAmount, 18)} AAPL tokens to Bob (${bobAddress})...`);
    const tx = await stockTokenContract.mint(bobAddress, mintAmount);
    console.log(`Mint transaction sent: ${tx.hash}. Waiting for confirmation...`);
    await tx.wait();
    console.log(`Successfully minted ${ethers.utils.formatUnits(mintAmount, 18)} AAPL tokens to Bob (${bobAddress})`);

    // If you also want to mint to the deployer (Account #0), you can add:
    // const deployerAddress = (await ethers.getSigners())[0].address;
    // console.log(`Attempting to mint ${ethers.utils.formatUnits(mintAmount, 18)} AAPL tokens to deployer (${deployerAddress})...`);
    // const txDeployer = await stockTokenContract.mint(deployerAddress, mintAmount);
    // console.log(`Mint transaction for deployer sent: ${txDeployer.hash}. Waiting for confirmation...`);
    // await txDeployer.wait();
    // console.log(`Successfully minted ${ethers.utils.formatUnits(mintAmount, 18)} AAPL tokens to deployer (${deployerAddress})`);
  } else {
    console.log("MINT_TEST_TOKENS is not 'true' or not set. Skipping minting of test tokens.");
  }

  return true; // Ensures the script exits correctly for hardhat-deploy
};

func.id = "deploy_stock_exchange_contracts"; // Add unique ID for hardhat-deploy
func.tags = ["StockToken", "Exchange", "StockExchange"];
func.dependencies = []; // Add dependencies if any

export default func;