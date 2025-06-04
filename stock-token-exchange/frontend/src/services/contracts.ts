// Contract service
import { ethers, ContractTransactionResponse } from 'ethers';
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
export async function validateContracts(provider: ethers.BrowserProvider | null): Promise<boolean> {
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
    if (!ethers.isAddress(CONTRACT_ADDRESSES.exchange) || 
        !ethers.isAddress(CONTRACT_ADDRESSES.token)) {
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
    const ethProvider = exchangeContract.runner?.provider;
    if (!ethProvider) {
      throw new Error("Provider not available");
    }
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
        exchangeEthBalance = BigInt(0);
      }
    } catch (error) {
      console.error('Error getting exchange ETH balance:', error);
      exchangeEthBalance = BigInt(0);
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
        exchangeTokenBalance = BigInt(0);
      }
    } catch (error) {
      console.error('Error getting exchange token balance:', error);
      exchangeTokenBalance = BigInt(0);
    }
    
    // Log balances for debugging
    console.log('User balances:', {
      userAddress,
      walletEth: ethers.formatEther(ethBalance),
      walletToken: ethers.formatEther(tokenBalance),
      exchangeEth: ethers.formatEther(exchangeEthBalance),
      exchangeToken: ethers.formatEther(exchangeTokenBalance)
    });
    
    return {
      ethBalance: ethers.formatEther(ethBalance),
      tokenBalance: ethers.formatEther(tokenBalance),
      exchangeEthBalance: ethers.formatEther(exchangeEthBalance),
      exchangeTokenBalance: ethers.formatEther(exchangeTokenBalance)
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
    
    console.log("Fetching events from blockchain...");
    
    try {
      // Get latest block number with error handling
      let latestBlock: number;
      try {
        // Get the current network to determine appropriate block strategy
        const provider = exchangeContract.runner?.provider;
        if (!provider) {
          throw new Error("Provider not available");
        }
        const network = await provider.getNetwork();
        latestBlock = await provider.getBlockNumber();
        console.log(`Current block number: ${latestBlock} on network chainId: ${network.chainId}`);
        
        // Use network-aware block selection strategy
        if (network.chainId === BigInt(31337)) { // Hardhat local network
          // For Hardhat local nodes, be extremely conservative
          // Start from block 0 to avoid "invalid block tag" errors
          latestBlock = 0;
          console.log(`Hardhat network detected - using conservative block number: ${latestBlock}`);
        } else if (network.chainId === BigInt(1337)) { // Ganache local network
          // For other local networks, use a safe offset
          latestBlock = Math.max(0, latestBlock - 1);
          console.log(`Local network detected - using safe block number: ${latestBlock}`);
        } else {
          // For public networks, use a larger offset to account for potential reorgs
          latestBlock = Math.max(0, latestBlock - 3);
          console.log(`Public network detected - using block number with reorg protection: ${latestBlock}`);
        }
      } catch (blockError) {
        console.warn("Error getting latest block number:", blockError);
        console.log("Falling back to block number 0");
        latestBlock = 0; // Safest fallback
      }

      // Validate the block number before querying events
      if (latestBlock < 0) {
        console.error("Invalid block number detected. Aborting event query.");
        return [];
      }
      
      // Use a safer approach: from 0 to latest block with error handling
      let placedEvents: (ethers.Log | ethers.EventLog)[] = []; 
      let cancelledEvents: (ethers.Log | ethers.EventLog)[] = []; 
      let filledEvents: (ethers.Log | ethers.EventLog)[] = [];
      
      try {
        // Try with an explicit block range first
        try {
          // Check if the block exists to prevent "invalid block tag" errors
          const provider = exchangeContract.runner?.provider;
          if (!provider) {
            throw new Error("Provider not available");
          }
          await queryWithBackoff(() => provider.getBlock(latestBlock));
          
          // Use our backoff helper for all event queries
          placedEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(placedFilter, 0, latestBlock)
          );
          cancelledEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(cancelledFilter, 0, latestBlock)
          );
          filledEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(filledFilter, 0, latestBlock)
          );
        } catch (rangeError) {
          // If we get an error with explicit block range, try a simpler approach
          console.warn("Error querying events with block range, trying without block range:", rangeError);
          
          // Try with just the 'from' parameter and use backoff for retries
          placedEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(placedFilter, 0)
          );
          cancelledEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(cancelledFilter, 0)
          );
          filledEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(filledFilter, 0)
          );
        }
      } catch (filterError) {
        console.warn("Error querying events with latest block, trying without block specification:", filterError);
        
        // Try again without specifying a block range at all
        try {
          placedEvents = await exchangeContract.queryFilter(placedFilter);
          cancelledEvents = await exchangeContract.queryFilter(cancelledFilter);
          filledEvents = await exchangeContract.queryFilter(filledFilter);
        } catch (fallbackFilterError) {
          console.error("Error querying events even without block specification:", fallbackFilterError);
          // Continue with empty arrays
          placedEvents = [];
          cancelledEvents = [];
          filledEvents = [];
        }
      }
      
      console.log(`Found events: ${placedEvents.length} placed, ${cancelledEvents.length} cancelled, ${filledEvents.length} filled`);
      
      // Track cancelled and filled order IDs
      const cancelledOrderIds = new Set(
        cancelledEvents
          .filter((event): event is ethers.EventLog => 'args' in event)
          .map(event => event.args?.orderId.toString())
      );
      const filledOrderIds = new Set(
        filledEvents
          .filter((event): event is ethers.EventLog => 'args' in event)
          .map(event => event.args?.orderId.toString())
      );
      
      // Process each OrderPlaced event
      const blockchainOrders: Order[] = [];
      
      for (const event of placedEvents) {
        // Skip if this is a Log without args (shouldn't happen with our filters, but for type safety)
        if (!('args' in event)) {
          continue;
        }
        
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
            amount: parseFloat(ethers.formatEther(order.amount)),
            price: parseFloat(ethers.formatEther(order.price)),
            isBuyOrder: order.isBuyOrder,
            active: order.active
          });
        } catch (error) {
          console.error(`Error fetching order ${orderId}:`, error);
        }
      }
      
      return blockchainOrders;
    } catch (queryError) {
      console.error("Error querying events:", queryError);
      console.log("Falling back to simplified order fetching...");
      
      // Fallback to just getting the latest few orders without using events
      return await fetchLatestOrdersSimple(exchangeContract);
    }
  } catch (error) {
    console.error("Error fetching blockchain orders:", error);
    console.log("Falling back to manual order retrieval via contract call");
    
    try {
      // Check if the getOrderCount function exists
      if (!exchangeContract.getOrderCount || typeof exchangeContract.getOrderCount !== 'function') {
        console.warn("getOrderCount function not found in contract, falling back to alternative method");
        return await fetchLatestOrdersSimple(exchangeContract);
      }
      
      // Get order count with proper typing
      const orderCount = await queryWithBackoff<bigint>(() => exchangeContract.getOrderCount());
      const orderCountNum = Number(orderCount);
      console.log(`Total orders in contract: ${orderCountNum}`);
      
      const blockchainOrders: Order[] = [];
      
      // Fetch each order by ID (only recent orders to avoid too many calls)
      const maxOrdersToFetch = 20;
      const startOrderId = orderCountNum > maxOrdersToFetch ? orderCountNum - maxOrdersToFetch + 1 : 1;
      
      for (let i = startOrderId; i <= orderCountNum; i++) {
        try {
          // Check if getOrder function exists
          if (!exchangeContract.getOrder || typeof exchangeContract.getOrder !== 'function') {
            console.warn("getOrder function not found in contract");
            break;
          }
          
          // Use backoff with proper typing
          const order = await queryWithBackoff<OrderFromContract>(() => exchangeContract.getOrder(i));
          
          // Only include active orders
          if (order.active) {
            blockchainOrders.push({
              id: i,
              user: order.user,
              token: order.token,
              amount: parseFloat(ethers.formatEther(order.amount)),
              price: parseFloat(ethers.formatEther(order.price)),
              isBuyOrder: order.isBuyOrder,
              active: order.active
            });
          }
        } catch (orderError) {
          console.error(`Error fetching order ${i}:`, orderError);
        }
      }
      
      console.log(`Fetched ${blockchainOrders.length} active orders via direct contract calls`);
      return blockchainOrders;
    } catch (fallbackError) {
      console.error("Fallback order fetching also failed:", fallbackError);
      return []; // Return empty array instead of throwing
    }
  }
}

/**
 * Helper function to execute a blockchain query with exponential backoff retries
 * Helps with network transitions and temporary connection issues
 */
async function queryWithBackoff<T>(
  queryFn: () => Promise<T>, 
  maxRetries = 3,
  initialDelayMs = 500
): Promise<T> {
  let retryCount = 0;
  let lastError: any;
  
  while (retryCount <= maxRetries) {
    try {
      // Attempt the query
      return await queryFn();
    } catch (error: any) {
      lastError = error;
      
      // Check if we should retry based on error type
      const shouldRetry = 
        // Block tag errors (common during network switches)
        error?.data?.message?.includes("invalid block tag") ||
        // JSON-RPC errors (common during network transitions)
        error?.message?.includes("Internal JSON-RPC error") ||
        // Other connection errors
        error?.message?.includes("connection") ||
        error?.message?.includes("network");
      
      if (!shouldRetry || retryCount >= maxRetries) {
        break;
      }
      
      // Calculate exponential backoff delay
      const delayMs = initialDelayMs * Math.pow(2, retryCount);
      console.log(`Retrying blockchain query in ${delayMs}ms (attempt ${retryCount + 1}/${maxRetries})...`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
      retryCount++;
    }
  }
  
  // If we've exhausted retries, throw the last error
  throw lastError;
}

/**
 * Simple fallback method for fetching orders when other methods fail
 * This doesn't rely on any specific contract view functions
 */
async function fetchLatestOrdersSimple(exchangeContract: ethers.Contract): Promise<Order[]> {
  console.log("Using simple fallback method to fetch orders");
  
  try {
    // Check if the contract has a getOrderCount function
    if (!exchangeContract.getOrderCount || typeof exchangeContract.getOrderCount !== 'function') {
      console.warn("getOrderCount function not found in contract, cannot fetch orders");
      return [];
    }
    
    // Get order count with retry logic
    const orderCount = await queryWithBackoff<bigint>(() => exchangeContract.getOrderCount());
    const orderCountNum = Number(orderCount);
    console.log(`Total orders in contract: ${orderCountNum}`);
    
    if (orderCountNum === 0) {
      return [];
    }
    
    const blockchainOrders: Order[] = [];
    
    // Fetch each order by ID (only recent orders to avoid too many calls)
    const maxOrdersToFetch = 20;
    const startOrderId = orderCountNum > maxOrdersToFetch ? orderCountNum - maxOrdersToFetch + 1 : 1;
    
    for (let i = startOrderId; i <= orderCountNum; i++) {
      try {
        // Use backoff for each order fetch with proper typing
        const order = await queryWithBackoff<OrderFromContract>(() => exchangeContract.getOrder(i));
        
        // Only include active orders
        if (order && order.active) {
          blockchainOrders.push({
            id: i,
            user: order.user,
            token: order.token,
            amount: parseFloat(ethers.formatEther(order.amount)),
            price: parseFloat(ethers.formatEther(order.price)),
            isBuyOrder: order.isBuyOrder,
            active: order.active
          });
        }
      } catch (orderError) {
        console.error(`Error fetching order ${i}:`, orderError);
      }
    }
    
    console.log(`Fetched ${blockchainOrders.length} active orders via simple method`);
    return blockchainOrders;
  } catch (error) {
    console.error("Error in simple order fetching:", error);
    return [];
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
): Promise<ContractTransactionResponse> {
  if (!exchangeContract) {
    throw new Error("Exchange contract not initialized");
  }
  
  // Convert amounts to Wei
  const amountInWei = ethers.parseEther(amount);
  const priceInWei = ethers.parseEther(price);
  
  // Log transaction details for debugging
  console.log("Placing order with parameters:", {
    tokenAddress,
    amount,
    amountInWei: amountInWei.toString(),
    price,
    priceInWei: priceInWei.toString(),
    isBuyOrder,
    calculatedCost: parseFloat(amount) * parseFloat(price)
  });
  
  // Call the placeOrder function with explicit gas limit to avoid estimation issues
  const tx = await exchangeContract.placeOrder(
    tokenAddress,
    amountInWei,
    priceInWei,
    isBuyOrder,
    {
      gasLimit: 500000 // Set a reasonable gas limit to avoid estimation failures
    }
  );
  
  console.log("Order placement transaction sent:", {
    hash: tx.hash,
    from: tx.from,
    to: tx.to
  });
  
  // Wait for the transaction to be mined
  const receipt = await (tx as any).wait();
  
  console.log("Order placement transaction confirmed:", {
    hash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status, // 1 = success, 0 = failure
    logs: receipt.logs.length
  });
  
  return tx;
}

/**
 * Cancel an order on the blockchain
 */
export async function cancelOrder(
  exchangeContract: ethers.Contract,
  orderId: number
): Promise<ContractTransactionResponse> {
  if (!exchangeContract) {
    throw new Error("Exchange contract not initialized");
  }
  
  const tx = await exchangeContract.cancelOrder(orderId);
  console.log("Order cancellation transaction sent:", {
    hash: tx.hash,
    from: tx.from,
    to: tx.to
  });
  
  // Wait for the transaction to be mined
  await (tx as any).wait();
  
  return tx;
}

/**
 * Interface to properly type contract orders
 */
interface OrderFromContract {
  user: string;
  token: string;
  amount: bigint;
  price: bigint;
  isBuyOrder: boolean;
  active: boolean;
}
