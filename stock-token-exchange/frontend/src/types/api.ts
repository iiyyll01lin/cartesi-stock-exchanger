// API response types
export interface ApiOrderResponse {
  id: number;
  user: string;
  token: string;
  amount: string;
  price: string;
  isBuyOrder: boolean;
  active: boolean;
}

export interface ApiBalanceResponse {
  eth: string;
  token: string;
  exchange_eth: string;
  exchange_token: string;
}

export interface ApiStatusResponse {
  status: string;
  ethereum_node?: boolean;
  exchange_contract?: boolean;
  stock_token_contract?: boolean;
  version?: string;
}

export interface ApiResponse {
  status: 'success' | 'error';
  message?: string;
  [key: string]: any; // Allow additional properties
}
