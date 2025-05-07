// Contract service
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '../utils/constants';
import { EXCHANGE_ABI, STOCK_TOKEN_ABI } from '../deployments';
import { Order } from '../types';

/**
 * Initialize contract instances
 */
export function initializeContracts(signer: ethers.Signer): {
  exchangeContract: ethers.Contract;
  tokenContract: ethers.Contract;
} {
  const exchangeContract = new ethers.Contract(
    CONTRACT_ADDRESSES.exchange,
    EXCHANGE_ABI,
    signer
  );
  
  const tokenContract = new ethers.Contract(
    CONTRACT_ADDRESSES.token,
    STOCK_TOKEN_ABI,
    signer
  );
  
  return {
    exchangeContract,
    tokenContract
  };
}

/**
 * Validate that contracts are deployed and accessible
 */
export async function validateContracts(provider: ethers.providers.Web3Provider | null): Promise<boolean> {
  if (!provider) {
    console.error("Cannot validate contracts: No provider available");
    return false;
  }
  
  try {
    console.log("Validating contracts at addresses:", CONTRACT_ADDRESSES);
    
    // Log the network we're connected to
    const network = await provider.getNetwork();
    console.log("Connected to network for contract validation:", network);
    
    // Check if the addresses are valid Ethereum addresses
    if (!ethers.utils.isAddress(CONTRACT_ADDRESSES.exchange) || 
        !ethers.utils.isAddress(CONTRACT_ADDRESSES.token)) {
      console.error("Invalid contract addresses", CONTRACT_ADDRESSES);
      return false;
    }
    
    // Try to get the deployed code at the contract addresses
    const exchangeCode = await provider.getCode(CONTRACT_ADDRESSES.exchange);
    const tokenCode = await provider.getCode(CONTRACT_ADDRESSES.token);
    
    console.log("Contract code lengths:", {
      exchange: exchangeCode.length,
      token: tokenCode.length,
      exchangeCodeEmpty: exchangeCode === '0x',
      tokenCodeEmpty: tokenCode === '0x'
    });
    
    // If there's no code at the address, the contract isn't deployed
    if (exchangeCode === '0x' || tokenCode === '0x') {
      console.error('Contracts not deployed at the specified addresses', {
        exchangeAddress: CONTRACT_ADDRESSES.exchange,
        tokenAddress: CONTRACT_ADDRESSES.token,
        exchangeCodeEmpty: exchangeCode === '0x',
        tokenCodeEmpty: tokenCode === '0x'
      });
      return false;
    }
    
    console.log("Contracts validated successfully");
    return true;
  } catch (error) {
    console.error("Error validating contracts:", error);
    return false;
  }
}

/**
 * Get token details
 */
export async function getTokenDetails(tokenContract: ethers.Contract): Promise<{name: string; symbol: string; decimals: number} | null> {
  if (!tokenContract) return null;
  
  try {
    const name = await tokenContract.name();
    const symbol = await tokenContract.symbol();
    const decimals = await tokenContract.decimals();
    
    return {
      name,
      symbol,
      decimals
    };
  } catch (error) {
    console.error("Error fetching token details:", error);
    return null;
  }
}

/**
 * Fetch balances from contracts
 */
export async function fetchBalancesFromContracts(
  userAddress: string,
  tokenContract: ethers.Contract,
  exchangeContract: ethers.Contract
): Promise<{
  ethBalance: string;
  tokenBalance: string;
  exchangeEthBalance: string;
  exchangeTokenBalance: string;
} | null> {
  if (!userAddress || !tokenContract || !exchangeContract) return null;
  
  try {
    // Get user's wallet ETH balance (not on the exchange)
    const ethProvider = exchangeContract.provider;
    const ethBalance = await ethProvider.getBalance(userAddress);
    
    // Get user's wallet token balance (not on the exchange)
    const tokenBalance = await tokenContract.balanceOf(userAddress);
    
    // Get user's exchange ETH balance
    let exchangeEthBalance;
    try {
      // Check if function exists
      if (typeof exchangeContract.getUserEthBalance === 'function') {
        exchangeEthBalance = await exchangeContract.getUserEthBalance(userAddress);
      } else {
        console.error('getUserEthBalance function not found on exchange contract');
        exchangeEthBalance = ethers.BigNumber.from(0);
      }
    } catch (error) {
      console.error('Error getting exchange ETH balance:', error);
      exchangeEthBalance = ethers.BigNumber.from(0);
    }
    
    // Get user's exchange token balance
    let exchangeTokenBalance;
    try {
      // Check if function exists
      if (typeof exchangeContract.getUserTokenBalance === 'function') {
        exchangeTokenBalance = await exchangeContract.getUserTokenBalance(
          userAddress,
          CONTRACT_ADDRESSES.token
        );
      } else {
        console.error('getUserTokenBalance function not found on exchange contract');
        exchangeTokenBalance = ethers.BigNumber.from(0);
      }
    } catch (error) {
      console.error('Error getting exchange token balance:', error);
      exchangeTokenBalance = ethers.BigNumber.from(0);
    }
    
    // Log balances for debugging
    console.log('User balances:', {
      userAddress,
      walletEth: ethers.utils.formatEther(ethBalance),
      walletToken: ethers.utils.formatEther(tokenBalance),
      exchangeEth: ethers.utils.formatEther(exchangeEthBalance),
      exchangeToken: ethers.utils.formatEther(exchangeTokenBalance)
    });
    
    return {
      ethBalance: ethers.utils.formatEther(ethBalance),
      tokenBalance: ethers.utils.formatEther(tokenBalance),
      exchangeEthBalance: ethers.utils.formatEther(exchangeEthBalance),
      exchangeTokenBalance: ethers.utils.formatEther(exchangeTokenBalance)
    };
  } catch (error) {
    console.error("Error fetching balances:", error);
    return null;
  }
}

/**
 * Fetch orders from blockchain
 */
export async function fetchBlockchainOrders(exchangeContract: ethers.Contract): Promise<Order[]> {
  if (!exchangeContract) return [];
  
  try {
    // Create a filter for OrderPlaced events
    const placedFilter = exchangeContract.filters.OrderPlaced();
    // Create a filter for OrderCancelled events
    const cancelledFilter = exchangeContract.filters.OrderCancelled();
    // Create a filter for OrderFilled events 
    const filledFilter = exchangeContract.filters.OrderFilled();
    
    // Fetch recent events (adjust the block range as needed)
    const placedEvents = await exchangeContract.queryFilter(placedFilter, -5000);
    const cancelledEvents = await exchangeContract.queryFilter(cancelledFilter, -5000);
    const filledEvents = await exchangeContract.queryFilter(filledFilter, -5000);
    
    // Track cancelled and filled order IDs
    const cancelledOrderIds = new Set(
      cancelledEvents.map(event => event.args?.orderId.toString())
    );
    const filledOrderIds = new Set(
      filledEvents.map(event => event.args?.orderId.toString())
    );
    
    // Process each OrderPlaced event
    const blockchainOrders: Order[] = [];
    
    for (const event of placedEvents) {
      const orderId = event.args?.orderId.toString();
      
      // Skip if the order was cancelled or filled
      if (cancelledOrderIds.has(orderId) || filledOrderIds.has(orderId)) {
        continue;
      }
      
      try {
        // Get order details
        const order = await exchangeContract.getOrder(orderId);
        
        blockchainOrders.push({
          id: parseInt(orderId),
          user: order.user,
          token: order.token,
          amount: parseFloat(ethers.utils.formatEther(order.amount)),
          price: parseFloat(ethers.utils.formatEther(order.price)),
          isBuyOrder: order.isBuyOrder,
          active: order.active
        });
      } catch (error) {
        console.error(`Error fetching order ${orderId}:`, error);
      }
    }
    
    return blockchainOrders;
  } catch (error) {
    console.error("Error fetching blockchain orders:", error);
    throw error;
  }
}

/**
 * Place an order on the blockchain
 */
export async function placeOrder(
  exchangeContract: ethers.Contract,
  tokenAddress: string,
  amount: string,
  price: string,
  isBuyOrder: boolean
): Promise<ethers.ContractTransaction> {
  if (!exchangeContract) {
    throw new Error("Exchange contract not initialized");
  }
  
  // Convert amounts to Wei
  const amountInWei = ethers.utils.parseEther(amount);
  const priceInWei = ethers.utils.parseEther(price);
  
  // Call the placeOrder function
  return await exchangeContract.placeOrder(
    tokenAddress,
    amountInWei,
    priceInWei,
    isBuyOrder
  );
}

/**
 * Cancel an order on the blockchain
 */
export async function cancelOrder(
  exchangeContract: ethers.Contract,
  orderId: number
): Promise<ethers.ContractTransaction> {
  if (!exchangeContract) {
    throw new Error("Exchange contract not initialized");
  }
  
  return await exchangeContract.cancelOrder(orderId);
}
