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
  chainId: CONTRACT_CHAIN_ID,
  chainIdHex: `0x${CONTRACT_CHAIN_ID.toString(16)}`,
  chainName: 'Hardhat Local Network',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: ['http://localhost:8545'],
  blockExplorerUrls: []
};
