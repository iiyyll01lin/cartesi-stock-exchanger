import React from 'react';
import { OrderFilterType } from '../../types';

interface OrderFiltersProps {
  orderFilter: OrderFilterType;
  setOrderFilter: (filter: OrderFilterType) => void;
  showMyOrdersOnly: boolean;
  setShowMyOrdersOnly: (show: boolean) => void;
}

const OrderFilters: React.FC<OrderFiltersProps> = ({
  orderFilter,
  setOrderFilter,
  showMyOrdersOnly,
  setShowMyOrdersOnly
}) => {
  return (
    <div className="order-filters">
      <select 
        value={orderFilter} 
        onChange={e => setOrderFilter(e.target.value as OrderFilterType)}
      >
        <option value="all">All Orders</option>
        <option value="buy">Buy Orders</option>
        <option value="sell">Sell Orders</option>
      </select>
      <label>
        <input 
          type="checkbox" 
          checked={showMyOrdersOnly} 
          onChange={e => setShowMyOrdersOnly(e.target.checked)} 
        />
        Show My Orders Only
      </label>
    </div>
  );
};

export default OrderFilters;
