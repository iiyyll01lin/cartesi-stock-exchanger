// Type interfaces
import { ethers } from 'ethers';
import { TokenDetails, Order } from '../types'; // Assuming Order is defined here or imported elsewhere
import { CONTRACT_ADDRESSES } from '../utils/constants'; // Corrected import path

// Interface to properly type orders returned from the contract
interface OrderFromContract {
  user: string;
  token: string;
  amount: ethers.BigNumber;
  price: ethers.BigNumber;
  isBuyOrder: boolean;
  active: boolean;
}

/**
 * Helper function to determine the safe block range for the current network
 * @param provider Ethers provider
 * @returns Object containing information about safe block range
 */
async function getSafeBlockRange(provider: ethers.providers.Provider): Promise<{
  fromBlock: number | string,
  toBlock: number | string,
  isLocalNetwork: boolean
}> {
  try {
    // Get network information
    const network = await provider.getNetwork();
    
    // Check if we're on a local development network
    const isLocalNetwork = 
      network.chainId === 31337 || // Hardhat
      network.chainId === 1337 ||  // Ganache
      network.name === 'unknown';  // Usually means local network
    
    // Get latest block number with retry
    const latestBlock = await queryWithBackoff(() => provider.getBlockNumber());
    
    if (isLocalNetwork) {
      // For local networks, always use a very conservative approach
      // to avoid "invalid block tag" errors during development
      console.log(`Using conservative block range for local network (chainId: ${network.chainId})`);
      return {
        fromBlock: 0, // Always use the genesis block as starting point for local networks
        toBlock: "latest", // Use "latest" instead of a specific block number to avoid stale references
        isLocalNetwork
      };
    } else {
      // For production networks, use a more efficient approach
      const fromBlock = Math.max(0, latestBlock - 1000); // Look back ~1000 blocks (~4 hours on Ethereum)
      const toBlock = Math.max(0, latestBlock - 1); // Stay 1 block behind to avoid race conditions
      
      return { fromBlock, toBlock, isLocalNetwork };
    }
  } catch (error) {
    console.warn("Error determining safe block range:", error);
    // Extremely conservative fallback
    return { fromBlock: 0, toBlock: 1, isLocalNetwork: true };
  }
}

/**
 * Initialize contract instances
 */
export function initializeContracts(signer: ethers.Signer): {
  exchangeContract: ethers.Contract;
  tokenContract: ethers.Contract;
} {
  // Import directly from the deployments folder
  const { EXCHANGE_ABI, STOCK_TOKEN_ABI } = require('../deployments');
  
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
  
  return { exchangeContract, tokenContract };
}

/**
 * Validate that contracts exist at the expected addresses
 */
export async function validateContracts(
  provider: ethers.providers.Provider
): Promise<boolean> {
  const maxRetries = 3; // Total attempts will be maxRetries + 1 for the first try
  let attempt = 0;
  const retryDelayMs = 2500; // Increased delay to allow network to settle

  console.log('Attempting to validate contracts at addresses:', CONTRACT_ADDRESSES);

  while (attempt <= maxRetries) {
    attempt++;
    console.log(`Contract validation attempt ${attempt}/${maxRetries + 1}.`);

    try {
      const network = await provider.getNetwork();
      console.log('Provider network for validation:', network);

      // ALWAYS use "latest" for getCode during validation to avoid stale block issues.
      const blockTagToUse: ethers.providers.BlockTag = "latest";
      console.log(`Using block tag: "${blockTagToUse}" for contract code fetching.`);

      const exchangeCode = await provider.getCode(CONTRACT_ADDRESSES.exchange, blockTagToUse);
      const tokenCode = await provider.getCode(CONTRACT_ADDRESSES.token, blockTagToUse);

      // A contract not deployed will have '0x' or sometimes '0x0' as its code.
      const exchangeCodeEmpty = !exchangeCode || exchangeCode === '0x' || exchangeCode === '0x0';
      const tokenCodeEmpty = !tokenCode || tokenCode === '0x' || tokenCode === '0x0';

      console.log('Contract code query results:', {
        exchangeAddress: CONTRACT_ADDRESSES.exchange,
        exchangeCodeLength: exchangeCode?.length,
        exchangeCodeIsEmpty: exchangeCodeEmpty,
        tokenAddress: CONTRACT_ADDRESSES.token,
        tokenCodeLength: tokenCode?.length,
        tokenCodeIsEmpty: tokenCodeEmpty,
      });

      if (!exchangeCodeEmpty && !tokenCodeEmpty) {
        console.log('Contracts validated successfully.');
        return true;
      } else {
        console.warn('Contract validation failed on attempt ${attempt}: One or both contracts have no code at the specified addresses.');
        if (attempt > maxRetries) {
          console.error('Contract validation failed after maximum attempts. Addresses might be incorrect or contracts not deployed.');
          return false;
        }
      }
    } catch (error: any) {
      console.error(`Error during contract validation attempt ${attempt}:`, error);
      const errorMessage = String(error.message).toLowerCase();
      const errorDataMessage = String(error.data?.message).toLowerCase();
      const errorCode = error.code;

      // Check for specific error messages/codes that indicate block desync or RPC issues
      const isRetryableError = 
        errorMessage.includes('invalid block tag') ||
        errorMessage.includes('block not found') ||
        errorMessage.includes('header not found') || // Common with Hardhat resets
        errorDataMessage.includes('invalid block tag') ||
        errorDataMessage.includes('header not found') ||
        errorCode === -32000 || // Often used by nodes for block-related issues
        errorCode === -32603;   // Generic internal JSON-RPC error

      if (isRetryableError) {
        console.warn(`Retryable error detected (e.g., invalid block tag, RPC issue). Retrying (${attempt}/${maxRetries})...`);
        if (attempt > maxRetries) {
          console.error('Retryable error persisted after maximum attempts during contract validation.');
          return false;
        }
      } else {
        console.error('Non-retryable error encountered during contract validation. Aborting.');
        return false; // For non-block-related errors, fail fast
      }
    }
    // Wait before the next retry, but not after the last attempt
    if (attempt <= maxRetries) {
      console.log(`Waiting ${retryDelayMs}ms before next validation attempt...`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }

  console.error('Contract validation ultimately failed after all attempts.');
  return false;
}

/**
 * Fetch token details
 */
export async function fetchTokenDetails(
  tokenContract: ethers.Contract
): Promise<TokenDetails | null> {
  try {
    const name = await tokenContract.name();
    const symbol = await tokenContract.symbol();
    const decimals = await tokenContract.decimals();
    
    return { name, symbol, decimals };
  } catch (error) {
    console.error('Error fetching token details:', error);
    return null;
  }
}

/**
 * Get token details
 * Alias for fetchTokenDetails for backward compatibility
 */
export async function getTokenDetails(
  tokenContract: ethers.Contract
): Promise<TokenDetails | null> {
  return fetchTokenDetails(tokenContract);
}

/**
 * Fetch user balances
 */
export async function fetchBalances(
  userAddress: string,
  provider: ethers.providers.Web3Provider,
  tokenContract: ethers.Contract,
  exchangeContract: ethers.Contract
): Promise<{
  ethBalance: string;
  tokenBalance: string;
  exchangeEthBalance: string;
  exchangeTokenBalance: string;
} | null> {
  try {
    // Validate input parameters
    if (!userAddress || !ethers.utils.isAddress(userAddress)) {
      console.error(`Invalid user address: ${userAddress}`);
      return null;
    }
    
    if (!tokenContract?.address) {
      console.error(`Invalid token contract: ${tokenContract}`);
      return null;
    }
    
    if (!exchangeContract?.address) {
      console.error(`Invalid exchange contract: ${exchangeContract}`);
      return null;
    }
    
    console.log(`[contracts.ts] Fetching token balance for user ${userAddress} on token ${tokenContract.address} using provider ${provider.connection.url}`);
    
    // Fetch ETH balance from the provider (wallet balance)
    const ethBalanceBigNumber = await provider.getBalance(userAddress);
    console.log(`[contracts.ts] ETH balance: ${ethers.utils.formatEther(ethBalanceBigNumber)}`);
    
    // Fetch token balance using multiple approaches (for debugging)
    let tokenBalanceBigNumber;
    
    try {
      // Attempt 1: Using the direct contract call
      tokenBalanceBigNumber = await tokenContract.balanceOf(userAddress);
      console.log(`[contracts.ts] Raw tokenBalanceBigNumber for ${userAddress}: ${tokenBalanceBigNumber.toString()}`);
      console.log(`[contracts.ts] Wallet token balance (direct): ${ethers.utils.formatEther(tokenBalanceBigNumber)}`);
    } catch (error) {
      console.error(`[contracts.ts] Error with direct token balance call:`, error);
      
      try {
        // Attempt 2: Using a signer to make the call
        const signer = provider.getSigner();
        const tokenWithSigner = tokenContract.connect(signer);
        tokenBalanceBigNumber = await tokenWithSigner.balanceOf(userAddress);
        console.log(`[contracts.ts] Wallet token balance (with signer): ${ethers.utils.formatEther(tokenBalanceBigNumber)}`);
      } catch (signerError) {
        console.error(`[contracts.ts] Signer attempt also failed:`, signerError);
        
        try {
          // Attempt 3: Using a read-only provider
          const readOnlyProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
          const readOnlyTokenContract = new ethers.Contract(tokenContract.address, tokenContract.interface, readOnlyProvider);
          tokenBalanceBigNumber = await readOnlyTokenContract.balanceOf(userAddress);
          console.log(`[contracts.ts] Wallet token balance (read-only provider): ${ethers.utils.formatEther(tokenBalanceBigNumber)}`);
        } catch (readOnlyError) {
          console.error(`[contracts.ts] Read-only provider attempt also failed:`, readOnlyError);
          // Default to zero if all attempts fail
          tokenBalanceBigNumber = ethers.BigNumber.from(0);
        }
      }
    }

    // Fetch exchange balances
    let exchangeEthBalance, exchangeTokenBalance;
    
    try {
      exchangeEthBalance = await exchangeContract.getUserEthBalance(userAddress);
      console.log(`[contracts.ts] Exchange ETH balance: ${ethers.utils.formatEther(exchangeEthBalance)}`);
    } catch (error) {
      console.error(`[contracts.ts] Error getting exchange ETH balance:`, error);
      exchangeEthBalance = ethers.BigNumber.from(0);
    }
    
    try {
      exchangeTokenBalance = await exchangeContract.getUserTokenBalance(userAddress, tokenContract.address);
      console.log(`[contracts.ts] Exchange token balance: ${ethers.utils.formatEther(exchangeTokenBalance)}`);
    } catch (error) {
      console.error(`[contracts.ts] Error getting exchange token balance:`, error);
      exchangeTokenBalance = ethers.BigNumber.from(0);
    }
    
    // Format all balances consistently
    const result = {
      ethBalance: ethers.utils.formatEther(ethBalanceBigNumber),
      tokenBalance: ethers.utils.formatEther(tokenBalanceBigNumber),
      exchangeEthBalance: ethers.utils.formatEther(exchangeEthBalance),
      exchangeTokenBalance: ethers.utils.formatEther(exchangeTokenBalance)
    };
    
    console.log(`[contracts.ts] Final balance results:`, result);
    return result;
  } catch (error) {
    console.error(`[contracts.ts] Critical error fetching balances:`, error);
    return null;
  }
}

/**
 * Fetch balances from contracts
 * This is an optimized version that reduces redundant network calls
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
  try {
    if (!tokenContract || !exchangeContract || !userAddress) {
      return null;
    }
    
    // Use a direct JsonRpcProvider for more reliable connections
    const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    
    // Create static contract instances
    const staticTokenContract = new ethers.Contract(
      tokenContract.address,
      tokenContract.interface,
      provider
    );
    
    const staticExchangeContract = new ethers.Contract(
      exchangeContract.address,
      exchangeContract.interface,
      provider
    );
    
    // Use Promise.all to make parallel requests for better performance
    const [ethBalance, tokenBalance, exchangeEthBalance, exchangeTokenBalance] = await Promise.all([
      provider.getBalance(userAddress).catch(() => ethers.BigNumber.from(0)),
      staticTokenContract.balanceOf(userAddress).catch(() => ethers.BigNumber.from(0)),
      staticExchangeContract.getUserEthBalance(userAddress).catch(() => ethers.BigNumber.from(0)),
      staticExchangeContract.getUserTokenBalance(userAddress, tokenContract.address).catch(() => ethers.BigNumber.from(0))
    ]);
    
    // Format results
    const result = {
      ethBalance: ethers.utils.formatEther(ethBalance),
      tokenBalance: ethers.utils.formatEther(tokenBalance),
      exchangeEthBalance: ethers.utils.formatEther(exchangeEthBalance),
      exchangeTokenBalance: ethers.utils.formatEther(exchangeTokenBalance)
    };
    
    return result;
  } catch (error) {
    console.error("[contracts.ts] Error in fetchBalancesFromContracts:", error);
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
      // Use our helper function to get a safe block range for the current network
      const { fromBlock, toBlock, isLocalNetwork } = await getSafeBlockRange(exchangeContract.provider);
      console.log(`Using block range: ${fromBlock} to ${toBlock} (localNetwork: ${isLocalNetwork})`);
      
      // Use a safer approach: from 0 to latest block with error handling and retry logic
      let placedEvents: ethers.Event[] = []; 
      let cancelledEvents: ethers.Event[] = []; 
      let filledEvents: ethers.Event[] = [];
      
      try {
        // Use our backoff helper for all event queries
        placedEvents = await queryWithBackoff(() => 
          exchangeContract.queryFilter(placedFilter, fromBlock, toBlock)
        );
        
        cancelledEvents = await queryWithBackoff(() => 
          exchangeContract.queryFilter(cancelledFilter, fromBlock, toBlock)
        );
        
        filledEvents = await queryWithBackoff(() => 
          exchangeContract.queryFilter(filledFilter, fromBlock, toBlock)
        );
      } catch (filterError) {
        console.warn("Error querying events with block range, trying without 'to' block:", filterError);
        
        // Try with just the 'from' parameter and use backoff for retries
        try {
          placedEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(placedFilter, fromBlock)
          );
          
          cancelledEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(cancelledFilter, fromBlock)
          );
          
          filledEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(filledFilter, fromBlock)
          );
        } catch (fallbackFilterError) {
          console.warn("Error querying events with 'from' block, trying without block specification:", fallbackFilterError);
          
          // Last resort: no block range at all
          try {
            placedEvents = await queryWithBackoff(() => 
              exchangeContract.queryFilter(placedFilter)
            );
            
            cancelledEvents = await queryWithBackoff(() => 
              exchangeContract.queryFilter(cancelledFilter)
            );
            
            filledEvents = await queryWithBackoff(() => 
              exchangeContract.queryFilter(filledFilter)
            );
          } catch (noBlockFilterError) {
            console.error("Error querying events without block specification:", noBlockFilterError);
            // Continue with empty arrays
            placedEvents = [];
            cancelledEvents = [];
            filledEvents = [];
          }
        }
      }

      // Get the latest block number to use for querying
      const latestBlock = await queryWithBackoff(() => exchangeContract.provider.getBlockNumber());
      
      // Validate the block number before querying events
      if (latestBlock < 0) {
        console.error("Invalid block number detected. Aborting event query.");
        return [];
      }
      
      // Reset events arrays for retry with different approach
      placedEvents = []; 
      cancelledEvents = []; 
      filledEvents = [];
      
      try {
        // Try with an explicit block range first
        try {
          // Check if the block exists to prevent "invalid block tag" errors
          await queryWithBackoff(() => exchangeContract.provider.getBlock(latestBlock));
          
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
        console.warn("Error querying events even without specifying a 'to' block:", filterError);
        
        // Try again without specifying any block range at all
        try {
          placedEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(placedFilter)
          );
          cancelledEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(cancelledFilter)
          );
          filledEvents = await queryWithBackoff(() => 
            exchangeContract.queryFilter(filledFilter)
          );
        } catch (finalFallbackError) {
          console.error("Error querying events even without block specification:", finalFallbackError);
          // Continue with empty arrays
          placedEvents = [];
          cancelledEvents = [];
          filledEvents = [];
        }
      }
      
      console.log(`Found events: ${placedEvents.length} placed, ${cancelledEvents.length} cancelled, ${filledEvents.length} filled`);
      
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
          const order = await queryWithBackoff<OrderFromContract>(() => 
            exchangeContract.getOrder(orderId)
          );
          
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
      const orderCount = await queryWithBackoff<ethers.BigNumber>(() => exchangeContract.getOrderCount());
      const orderCountNum = orderCount.toNumber();
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
          if (order && order.active) {
            blockchainOrders.push({
              id: i,
              user: order.user,
              token: order.token,
              amount: parseFloat(ethers.utils.formatEther(order.amount)),
              price: parseFloat(ethers.utils.formatEther(order.price)),
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
      return [];
    }
  }
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
    const orderCount = await queryWithBackoff<ethers.BigNumber>(() => exchangeContract.getOrderCount());
    const orderCountNum = orderCount.toNumber();
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
            amount: parseFloat(ethers.utils.formatEther(order.amount)),
            price: parseFloat(ethers.utils.formatEther(order.price)),
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
): Promise<ethers.ContractTransaction> {
  if (!exchangeContract) {
    throw new Error("Exchange contract not initialized");
  }
  
  // Convert amounts to Wei
  const amountInWei = ethers.utils.parseEther(amount);
  const priceInWei = ethers.utils.parseEther(price);
  
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
      gasLimit: 500000
    }
  );
  
  return tx;
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
  
  // Call the cancelOrder function with explicit gas limit
  const tx = await exchangeContract.cancelOrder(orderId, {
    gasLimit: 200000
  });
  
  return tx;
}

/**
 * Deposit ETH to the exchange
 */
export async function depositEth(
  exchangeContract: ethers.Contract,
  amount: string
): Promise<ethers.ContractTransaction> {
  if (!exchangeContract) {
    throw new Error("Exchange contract not initialized");
  }
  
  // Convert amount to Wei
  const amountInWei = ethers.utils.parseEther(amount);
  
  // Call the depositEth function with the ETH value
  const tx = await exchangeContract.depositEth({
    value: amountInWei,
    gasLimit: 200000
  });
  
  return tx;
}

/**
 * Withdraw ETH from the exchange
 */
export async function withdrawEth(
  exchangeContract: ethers.Contract,
  amount: string
): Promise<ethers.ContractTransaction> {
  if (!exchangeContract) {
    throw new Error("Exchange contract not initialized");
  }
  
  // Convert amount to Wei
  const amountInWei = ethers.utils.parseEther(amount);
  
  // Call the withdrawEth function
  const tx = await exchangeContract.withdrawEth(amountInWei, {
    gasLimit: 200000
  });
  
  return tx;
}

/**
 * Deposit tokens to the exchange
 */
export async function depositTokens(
  exchangeContract: ethers.Contract,
  tokenContract: ethers.Contract,
  amount: string
): Promise<ethers.ContractTransaction> {
  if (!exchangeContract || !tokenContract) {
    throw new Error("Contracts not initialized");
  }
  
  // Convert amount to Wei
  const amountInWei = ethers.utils.parseEther(amount);
  
  // First approve the exchange to transfer tokens
  const approveTx = await tokenContract.approve(
    exchangeContract.address,
    amountInWei,
    {
      gasLimit: 100000
    }
  );
  
  // Wait for approval transaction to be mined
  await approveTx.wait();
  
  // Now deposit the tokens
  const depositTx = await exchangeContract.depositToken(
    tokenContract.address,
    amountInWei,
    {
      gasLimit: 200000
    }
  );
  
  return depositTx;
}

/**
 * Withdraw tokens from the exchange
 */
export async function withdrawTokens(
  exchangeContract: ethers.Contract,
  tokenAddress: string,
  amount: string
): Promise<ethers.ContractTransaction> {
  if (!exchangeContract) {
    throw new Error("Exchange contract not initialized");
  }
  
  // Convert amount to Wei
  const amountInWei = ethers.utils.parseEther(amount);
  
  // Call the withdrawToken function
  const tx = await exchangeContract.withdrawToken(
    tokenAddress,
    amountInWei,
    {
      gasLimit: 200000
    }
  );
  
  return tx;
}

/**
 * Helper function to retry blockchain queries with exponential backoff
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
      const isBlockTagError = error?.data?.message?.includes("invalid block tag");
      const shouldRetry = 
        // Block tag errors (common during network switches)
        isBlockTagError ||
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
      
      // For block tag errors specifically, we can modify the query function
      // to try again with "latest" block tag
      if (isBlockTagError && typeof queryFn.toString === 'function') {
        const fnString = queryFn.toString();
        console.log('Detected invalid block tag error, will retry with latest block tag');
        
        // If we've identified this is likely caused by stale block references,
        // add a small delay to allow the provider to refresh its state
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
      retryCount++;
    }
  }
  
  // If we've exhausted retries, throw the last error
  throw lastError;
}

/**
 * Fetch orders from API
 */
export async function fetchOrdersFromApi(baseUrl: string, tokenAddress: string): Promise<Order[]> {
  try {
    const response = await fetch(`${baseUrl}/orders?token=${tokenAddress}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.error('API orders response is not an array:', data);
      return [];
    }
    
    return data as Order[];
  } catch (error) {
    console.error('Error fetching orders from API:', error);
    return [];
  }
}
