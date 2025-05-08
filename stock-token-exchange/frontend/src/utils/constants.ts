// Constants used across the application
import {
  EXCHANGE_ADDRESS,
  STOCK_TOKEN_ADDRESS,
  CONTRACT_CHAIN_ID,
} from '../deployments';

// API Configuration
export const API_BASE_URL = 'http://localhost:5001';

// Contract configuration
export const CONTRACT_ADDRESSES = {
  exchange: EXCHANGE_ADDRESS,
  token: STOCK_TOKEN_ADDRESS,
};

// Chain configuration
export const CHAIN_CONFIG = {
  chainId: CONTRACT_CHAIN_ID || 31337, // Fallback to Hardhat's default chain ID
  chainIdHex: CONTRACT_CHAIN_ID ? `0x${CONTRACT_CHAIN_ID.toString(16)}` : '0x7a69', // 0x7a69 is hex for 31337
  chainName: 'Hardhat Local Network',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: ['http://localhost:8545'],
  blockExplorerUrls: []
};
