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
    if (fs.existsSync(hashFilePath)) {
      const hashFromFile = fs.readFileSync(hashFilePath, 'utf8').trim();
      console.log(`Using Cartesi template hash from file: ${hashFromFile}`);
      return hashFromFile;
    }
  } catch (error) {
    console.error(`Error reading template hash file: ${error}`);
  }
  
  console.log(`WARNING: Using placeholder Cartesi template hash.`);
  console.log(`Run "./build-machine.sh" in cartesi-machine directory to generate actual hash.`);
  return PLACEHOLDER_HASH;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const { deployer, admin } = await getNamedAccounts();

  const chainId = await getChainId();
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
  if (process.env.MINT_TEST_TOKENS === "true") {
    const stockTokenContract = await ethers.getContractAt("StockToken", stockToken.address);
    const mintAmount = ethers.parseUnits("1000", 18); // 1000 tokens with 18 decimals
    
    console.log(`Minting ${mintAmount} tokens to ${deployer}...`);
    const tx = await stockTokenContract.mint(deployer, mintAmount);
    await tx.wait();
    console.log(`Minted test tokens to ${deployer}`);
  }

  return true;
};

func.tags = ["StockToken", "Exchange", "StockExchange"];
func.dependencies = []; // Add dependencies if any

export default func;