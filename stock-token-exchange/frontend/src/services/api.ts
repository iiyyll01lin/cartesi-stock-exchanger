// API service
import { ApiOrderResponse, ApiBalanceResponse, ApiStatusResponse, ApiResponse, Order } from '../types';
import { API_BASE_URL } from '../utils/constants';

/**
 * Make an API call with timeout handling
 */
export async function callApi<T = any>(
  endpoint: string, 
  method: 'GET' | 'POST' = 'GET', 
  data?: any,
  timeoutMs = 10000
): Promise<T> {
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      ...(data && { body: JSON.stringify(data) })
    };
    
    // Add timeout to prevent hanging indefinitely
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    // Check for HTTP errors
    if (!response.ok) {
      // Try to parse error message if available
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || `Error: ${response.status} ${response.statusText}`;
      } catch {
        errorMessage = `HTTP error! status: ${response.status}`;
      }
      throw new Error(errorMessage);
    }
    
    return await response.json() as T;
  } catch (error: any) {
    // Handle timeout errors
    if (error.name === 'AbortError') {
      console.error(`API call to ${endpoint} timed out after ${timeoutMs}ms`);
      throw new Error(`Request timed out. Make sure the backend server is running at ${API_BASE_URL}`);
    }
    
    console.error(`API call to ${endpoint} failed:`, error);
    throw error;
  }
}

/**
 * Check server status
 */
export async function checkServerStatus(): Promise<ApiStatusResponse | null> {
  try {
    return await callApi<ApiStatusResponse>('/api/status');
  } catch (error) {
    console.error("Failed to check server status:", error);
    return null;
  }
}

/**
 * Fetch orders from API
 */
export async function fetchOrdersFromApi(): Promise<Order[]> {
  try {
    // Fetch orders from the backend API
    const data = await callApi<ApiOrderResponse[]>('/api/orders');
    
    // In case we get empty data
    if (!data || data.length === 0) {
      console.log("No orders found in API");
      return [];
    }
    
    // Convert API response to Order format
    return data.map(apiOrder => ({
      id: apiOrder.id,
      user: apiOrder.user,
      token: apiOrder.token,
      amount: Number(apiOrder.amount),
      price: Number(apiOrder.price),
      isBuyOrder: apiOrder.isBuyOrder,
      active: apiOrder.active
    }));
  } catch (error) {
    console.error("Failed to fetch orders from backend:", error);
    throw error;
  }
}

/**
 * Fetch user balance from API
 */
export async function fetchUserBalanceFromApi(userAddress: string): Promise<ApiBalanceResponse | null> {
  if (!userAddress) return null;
  
  try {
    return await callApi<ApiBalanceResponse>(`/api/balance/${userAddress}`);
  } catch (error) {
    console.error("Failed to fetch balance from API:", error);
    return null;
  }
}

/**
 * Submit an order via API
 */
export async function submitOrderToApi(
  user: string, 
  token: string, 
  amount: string, 
  price: string, 
  isBuyOrder: boolean
): Promise<ApiResponse> {
  const orderData = {
    user,
    token,
    amount,
    price,
    isBuyOrder
  };
  
  return await callApi<ApiResponse>('/api/orders', 'POST', orderData);
}

/**
 * Cancel an order via API
 */
export async function cancelOrderViaApi(orderId: number, user: string): Promise<ApiResponse> {
  return await callApi<ApiResponse>(`/api/orders/${orderId}/cancel`, 'POST', { user });
}

/**
 * Get order details by ID
 */
export async function getOrderById(orderId: number): Promise<ApiOrderResponse | null> {
  try {
    return await callApi<ApiOrderResponse>(`/api/orders/${orderId}`);
  } catch (error) {
    console.error(`Failed to fetch order #${orderId}:`, error);
    return null;
  }
}

/**
 * Process order matches (admin function)
 */
export async function processOrderMatches(adminAddress: string): Promise<ApiResponse> {
  return await callApi<ApiResponse>('/api/admin/process-matches', 'POST', { admin: adminAddress });
}
