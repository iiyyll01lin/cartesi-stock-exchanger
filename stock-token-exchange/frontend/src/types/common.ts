// Common types used throughout the application

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
  autoClose?: boolean;
}

export interface Transaction {
  id: string;
  hash: string;
  type: 'deposit' | 'withdraw' | 'order' | 'cancel';
  amount?: string;
  token?: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: number;
  message?: string;
}

// Window type extension for MetaMask
declare global {
  interface Window {
    ethereum?: any; // MetaMask provider
  }
}
