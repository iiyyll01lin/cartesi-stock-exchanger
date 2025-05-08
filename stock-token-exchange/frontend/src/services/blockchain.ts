// Blockchain service
import { ethers } from 'ethers';
import { Order } from '../types';
import { fetchBlockchainOrders } from './contracts';
import { fetchOrdersFromApi } from './api';

/**
 * Create a Web3Provider from MetaMask
 */
export function getProvider(): ethers.providers.Web3Provider | null {
  if (!window.ethereum) return null;
  return new ethers.providers.Web3Provider(window.ethereum);
}

/**
 * Check connections and gather diagnostic information
 */
export async function checkConnections(provider: ethers.providers.Web3Provider | null): Promise<string[]> {
  const connectionDetails = [];
  
  // Check MetaMask connection
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const metamaskConnected = accounts.length > 0;
      connectionDetails.push(`MetaMask: ${metamaskConnected ? 'Connected' : 'Not Connected'}`);
      
      if (metamaskConnected) {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const decimalChainId = parseInt(chainId, 16);
        connectionDetails.push(`Current Chain ID: ${decimalChainId} (${chainId})`);
      }
    } catch (error: any) {
      connectionDetails.push(`MetaMask Error: ${error.message}`);
    }
  } else {
    connectionDetails.push("MetaMask: Not Detected");
  }
  
  // Check blockchain node connection
  if (provider) {
    try {
      const network = await provider.getNetwork();
      connectionDetails.push(`Blockchain Node: Connected (${network.name}, Chain ID: ${network.chainId})`);
    } catch (error: any) {
      connectionDetails.push(`Blockchain Node Error: ${error.message}`);
    }
  } else {
    connectionDetails.push("Blockchain Node: Not Connected");
  }
  
  return connectionDetails;
}

/**
 * Get orders - first try blockchain, fall back to API
 */
export async function getOrders(
  exchangeContract: ethers.Contract | null,
  account?: string | null
): Promise<Order[]> {
  // First try to fetch from the blockchain
  if (exchangeContract) {
    try {
      // Add a timeout to prevent hanging if the blockchain request takes too long
      return await Promise.race([
        fetchBlockchainOrders(exchangeContract),
        new Promise<Order[]>((_, reject) => 
          setTimeout(() => reject(new Error("Blockchain fetch timeout")), 8000)
        )
      ]) as Order[];
    } catch (error) {
      console.error("Error fetching blockchain orders:", error);
      // No need to show the error to the user - we'll fall back to API silently
      throw error; // Re-throw the error so caller can handle the fallback
    }
  }
  
  // Fallback: Fetch orders from the backend API
  try {
    return await fetchOrdersFromApi();
  } catch (error) {
    console.error("Failed to fetch orders from API:", error);
    return [];
  }
}
