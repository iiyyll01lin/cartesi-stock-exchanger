// Orders hook
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { Order, OrderFilterType } from '../types';
import { getOrders } from '../services/blockchain';
import { placeOrder, cancelOrder } from '../services/contracts';
import { submitOrderToApi, cancelOrderViaApi } from '../services/api';
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
      const fetchedOrders = await getOrders(exchangeContract, account);
      setOrders(fetchedOrders);
      
      if (fetchedOrders.length > 0) {
        addNotification('success', `Found ${fetchedOrders.length} orders`);
      } else {
        addNotification('info', 'No orders found');
      }
    } catch (error: any) {
      console.error("Error fetching orders:", error);
      addNotification('error', `Failed to fetch orders: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [exchangeContract, account, tokenAddress, addNotification]);
  
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
        
        // Refresh orders
        await fetchOrders();
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
      
      addNotification('error', `Failed to place order: ${error.message}`);
      
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
    fetchOrders
  };
}
