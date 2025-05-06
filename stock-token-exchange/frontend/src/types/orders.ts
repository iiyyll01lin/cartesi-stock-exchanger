// Order-related types
export interface Order {
  id: number;
  user: string;
  token: string;
  amount: number;
  price: number;
  isBuyOrder: boolean;
  active: boolean;
}

export type OrderFilterType = 'all' | 'buy' | 'sell';
