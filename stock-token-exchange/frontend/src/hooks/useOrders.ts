// Orders hook
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { Order, OrderFilterType } from '../types';
import { getOrders } from '../services/blockchain';
import { placeOrder, cancelOrder } from '../services/contracts';
import { submitOrderToApi, cancelOrderViaApi, fetchOrdersFromApi } from '../services/api';
import { useNotifications } from './useNotifications';
import { validateAmount, validatePrice } from '../utils/validation';

export function useOrders(
  account: string | null,
  exchangeContract: ethers.Contract | null,
  tokenAddress: string
) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [orderFilter, setOrderFilter] = useState<OrderFilterType>('all');
  const [showMyOrdersOnly, setShowMyOrdersOnly] = useState<boolean>(false);
  const [orderAmount, setOrderAmount] = useState<string>("");
  const [orderPrice, setOrderPrice] = useState<string>("");
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [orderAmountError, setOrderAmountError] = useState<string | null>(null);
  const [orderPriceError, setOrderPriceError] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  
  // Fetch orders
  const fetchOrders = useCallback(async () => {
    if (!tokenAddress) return;
    
    try {
      setIsLoading(true);
      console.log("Fetching orders for token:", tokenAddress);
      
      let blockchainOrders: Order[] = [];
      let apiOrders: Order[] = [];
      
      // Try to get blockchain orders first
      if (exchangeContract) {
        try {
          // Try to get blockchain orders with proper error handling
          blockchainOrders = await getOrders(exchangeContract);
          console.log(`Fetched ${blockchainOrders.length} orders from blockchain`);
        } catch (blockchainError) {
          console.error("Error fetching blockchain orders:", blockchainError);
          
          // Don't show error notification for blockchain fetch issues
          // as they are common during network switching
          console.log("Silently handling blockchain fetch error");
        }
      }
      
      // Always try to get API orders as backup
      try {
        apiOrders = await fetchOrdersFromApi();
        console.log(`Fetched ${apiOrders.length} orders from API`);
      } catch (apiError) {
        console.error("Error fetching API orders:", apiError);
        
        // Only show error if we couldn't get blockchain orders either
        if (blockchainOrders.length === 0) {
          addNotification('error', 'Unable to fetch orders. Please check your connection.');
        }
      }
      
      // Combine and deduplicate orders from both sources
      // In case of duplicates, prefer blockchain orders
      const combinedOrders = mergeOrders(blockchainOrders, apiOrders);
      
      console.log(`Fetched ${combinedOrders.length} orders:`, combinedOrders);
      setOrders(combinedOrders);
    } catch (error) {
      console.error("Error in fetchOrders:", error);
      // Only show this error notification for truly unexpected errors
      addNotification('error', 'Unexpected error fetching orders');
    } finally {
      setIsLoading(false);
    }
  }, [tokenAddress, exchangeContract, addNotification]);
  
  // Check for order count and latest order - useful for debugging
  const checkOrderInfo = useCallback(async () => {
    if (!exchangeContract) return;
    
    try {
      // First check if the contract is ready by checking a simple property
      try {
        // Use a simpler call like address instead of a function call
        const contractAddress = await exchangeContract.address;
        console.log("Contract is accessible at address:", contractAddress);
      } catch (accessError) {
        console.error("Contract may not be fully initialized:", accessError);
        return; // Exit early if contract isn't ready
      }
      
      // Check if the contract has a getOrderCount function
      if (exchangeContract.getOrderCount && typeof exchangeContract.getOrderCount === 'function') {
        try {
          const orderCount = await exchangeContract.getOrderCount();
          console.log("Order count in contract:", orderCount.toString());
          
          // Try to fetch the latest order for debugging
          if (orderCount > 0) {
            try {
              const latestOrder = await exchangeContract.getOrder(orderCount);
              console.log("Latest order in contract:", {
                id: orderCount.toString(),
                user: latestOrder.user,
                amount: ethers.utils.formatEther(latestOrder.amount),
                price: ethers.utils.formatEther(latestOrder.price),
                active: latestOrder.active,
                isBuyOrder: latestOrder.isBuyOrder
              });
            } catch (e) {
              console.error("Error fetching latest order:", e);
            }
          }
        } catch (e) {
          console.error("Error checking contract order count:", e);
        }
      } else {
        console.warn("Exchange contract does not have getOrderCount method - this is expected if you're using a version without this view function");
      }
    } catch (error) {
      console.error("Error in checkOrderInfo:", error);
    }
  }, [exchangeContract]);
  
  // Filter orders
  const getFilteredOrders = useCallback(() => {
    return orders.filter((order: Order) => {
      // Filter by order type (buy/sell)
      if (orderFilter === 'buy' && !order.isBuyOrder) return false;
      if (orderFilter === 'sell' && order.isBuyOrder) return false;
      
      // Filter by user's orders only
      if (showMyOrdersOnly && account && order.user.toLowerCase() !== account.toLowerCase()) {
        return false;
      }
      
      return true;
    });
  }, [orders, orderFilter, showMyOrdersOnly, account]);
  
  // Place mock order via API
  const handleMockPlaceOrder = useCallback(async (isBuyOrder: boolean) => {
    if (!account || !orderAmount || !orderPrice) {
      addNotification('error', 'Please connect wallet and fill order details.');
      return;
    }
    
    try {
      const result = await submitOrderToApi(
        account,
        tokenAddress,
        orderAmount,
        orderPrice,
        isBuyOrder
      );
      
      if (result && (result.id || (result.order && result.order.id))) {
        const orderId = result.id || result.order.id;
        addNotification('success', `Order #${orderId} placed successfully!`);
        
        // Clear form fields
        setOrderAmount("");
        setOrderPrice("");
        
        // Refresh orders
        await fetchOrders();
      } else if (result && result.error) {
        addNotification('error', `Failed to submit mock order: ${result.error}`);
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error: any) {
      console.error("Error submitting mock order:", error);
      addNotification('error', `Error submitting mock order: ${error.message}`);
    }
  }, [account, tokenAddress, orderAmount, orderPrice, addNotification, fetchOrders]);

  // Place order
  const handlePlaceOrder = useCallback(async (isBuyOrder: boolean) => {
    if (!account) {
      addNotification('error', 'Please connect your wallet first');
      return;
    }
    
    // Validate inputs
    const amountError = validateAmount(orderAmount);
    if (amountError) {
      setOrderAmountError(amountError);
      addNotification('error', amountError);
      return;
    }
    
    const priceError = validatePrice(orderPrice);
    if (priceError) {
      setOrderPriceError(priceError);
      addNotification('error', priceError);
      return;
    }
    
    // Pre-check for sufficient ETH balance for buy orders
    if (isBuyOrder && exchangeContract) {
      try {
        const amount = parseFloat(orderAmount);
        const price = parseFloat(orderPrice);
        const totalCost = amount * price;
        
        // Get current ETH balance in the exchange
        const balance = await exchangeContract.ethDeposits(account);
        const balanceInEth = parseFloat(ethers.utils.formatEther(balance));
        
        console.log("ETH Balance Check for Buy Order:", {
          userAddress: account,
          requiredETH: totalCost,
          actualBalanceWei: balance.toString(),
          actualBalanceETH: balanceInEth,
          tokenAmount: amount,
          pricePerToken: price,
          hasEnoughBalance: balanceInEth >= totalCost
        });
        
        // Add a small safety margin (0.5%) to account for potential rounding issues
        const safetyMargin = totalCost * 0.005;
        if (balanceInEth < (totalCost + safetyMargin)) {
          const errorMsg = `Insufficient ETH in your exchange balance. You need ${totalCost.toFixed(4)} ETH but only have ${balanceInEth.toFixed(4)} ETH. Please deposit slightly more ETH than required to account for potential rounding issues.`;
          addNotification('error', errorMsg);
          return;
        }
      } catch (error) {
        console.error("Error checking ETH balance:", error);
        // Continue with the transaction attempt even if balance check fails
      }
    }
    
    setIsLoading(true);
    
    try {
      if (exchangeContract) {
        // Try blockchain order
        const tx = await placeOrder(
          exchangeContract,
          tokenAddress,
          orderAmount,
          orderPrice,
          isBuyOrder
        );
        
        addNotification('info', `Order transaction sent! Waiting for confirmation...`);
        
        // Wait for the transaction to be mined
        await tx.wait();
        
        addNotification('success', `${isBuyOrder ? 'Buy' : 'Sell'} order placed successfully!`);
        
        // Clear form fields
        setOrderAmount("");
        setOrderPrice("");
        setOrderAmountError(null);
        setOrderPriceError(null);
        
        // Refresh orders - add a small delay to ensure blockchain events are processed
        setTimeout(async () => {
          console.log("Refreshing orders after successful transaction");
          await fetchOrders();
        }, 2000); // 2 second delay
      } else {
        // Fallback to API
        addNotification('warning', 'No blockchain connection. Using API fallback...');
        await handleMockPlaceOrder(isBuyOrder);
      }
    } catch (error: any) {
      console.error("Error placing order:", error);
      
      // Check if it's a user rejection
      if (error.code === 4001) {
        addNotification('warning', 'Order placement cancelled by user');
        return;
      }
      
      // Parse error message for common issues and make it more user-friendly
      let errorMessage = error.message;
      
      // Check for "Insufficient ETH for buy order" error
      if (error.message && error.message.includes('Insufficient ETH for buy order')) {
        errorMessage = 'You do not have enough ETH in your exchange balance. Please deposit more ETH before placing this buy order.';
      } 
      // Unpredictable gas limit errors often happen with failed transactions
      else if (error.message && error.message.includes('UNPREDICTABLE_GAS_LIMIT')) {
        if (error.message.includes('Insufficient ETH for buy order')) {
          errorMessage = 'You do not have enough ETH in your exchange balance. Please deposit more ETH before placing this buy order.';
        } else {
          errorMessage = 'Transaction failed. There may be an issue with the contract or your inputs.';
        }
      }
      
      addNotification('error', `Failed to place order: ${errorMessage}`);
      
      // Try fallback
      try {
        addNotification('warning', `Blockchain order failed. Trying API fallback...`);
        await handleMockPlaceOrder(isBuyOrder);
      } catch (fallbackError: any) {
        console.error("Fallback order placement also failed:", fallbackError);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    account, exchangeContract, tokenAddress, orderAmount, orderPrice, 
    addNotification, fetchOrders, handleMockPlaceOrder
  ]);
  
  // Cancel order
  const handleCancelOrder = useCallback(async (orderId: number) => {
    if (!account) {
      addNotification('error', 'Please connect your wallet first');
      return;
    }
    
    setIsLoading(true);
    
    // First try to cancel via blockchain if available
    if (exchangeContract) {
      try {
        const tx = await cancelOrder(exchangeContract, orderId);
        
        addNotification('info', `Cancel transaction sent! Waiting for confirmation...`);
        
        await tx.wait();
        addNotification('success', `Order #${orderId} cancelled successfully!`);
        
        // Refresh orders
        await fetchOrders();
      } catch (error: any) {
        console.error(`Failed to cancel order #${orderId} via blockchain:`, error);
        
        // If the error indicates a user rejection, don't fallback to API
        if (error.code === 4001) {
          addNotification('warning', 'Order cancellation cancelled by user');
          setIsLoading(false);
          return;
        }
        
        // Otherwise, try using the backend API as fallback
        addNotification('warning', `Blockchain cancel failed. Trying API fallback...`);
        await cancelOrderViaApi(orderId, account);
      }
    } else {
      // No blockchain connection, use API directly
      try {
        const result = await cancelOrderViaApi(orderId, account);
        
        if (result && result.status === 'success') {
          addNotification('success', `Order #${orderId} cancelled successfully!`);
          
          // Refresh orders
          await fetchOrders();
        } else {
          throw new Error(result?.message || 'Unknown error');
        }
      } catch (error: any) {
        console.error(`Failed to cancel order #${orderId} via API:`, error);
        addNotification('error', `Failed to cancel order: ${error.message}`);
      }
    }
    
    setIsLoading(false);
  }, [account, exchangeContract, addNotification, fetchOrders]);
  
  // Fetch orders when component mounts
  useEffect(() => {
    if (account) {
      fetchOrders();
    }
  }, [account, exchangeContract, fetchOrders]);
  
  // Debug: Check order info when contracts are loaded
  useEffect(() => {
    if (exchangeContract) {
      checkOrderInfo();
    }
  }, [exchangeContract, checkOrderInfo]);
  
  return {
    orders,
    filteredOrders: getFilteredOrders(),
    isLoading,
    orderFilter,
    setOrderFilter,
    showMyOrdersOnly,
    setShowMyOrdersOnly,
    orderAmount,
    setOrderAmount,
    orderPrice,
    setOrderPrice,
    orderType,
    setOrderType,
    orderAmountError,
    orderPriceError,
    handlePlaceOrder,
    handleCancelOrder,
    fetchOrders,
    checkOrderInfo
  };
}

/**
 * Helper function to merge and deduplicate orders from multiple sources
 */
function mergeOrders(blockchainOrders: Order[], apiOrders: Order[]): Order[] {
  // Create a map of blockchain orders by ID for fast lookup
  const blockchainOrderMap = new Map<number, Order>();
  blockchainOrders.forEach(order => {
    blockchainOrderMap.set(order.id, order);
  });
  
  // Add API orders that aren't already in blockchain orders
  const uniqueApiOrders = apiOrders.filter(apiOrder => 
    !blockchainOrderMap.has(apiOrder.id)
  );
  
  // Combine all orders
  return [...blockchainOrders, ...uniqueApiOrders];
}
