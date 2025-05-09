import React from 'react';
import { OrderFilterType } from '../../types';
import './OrderFilters.css';

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
        className="order-filter-select"
        aria-label="Filter orders by type"
      >
        <option value="all">All Orders</option>
        <option value="buy">Buy Orders</option>
        <option value="sell">Sell Orders</option>
      </select>
      
      <div className="my-orders-filter">
        <label htmlFor="show-my-orders-checkbox" className="checkbox-container">
          <span className="checkbox-custom">
            <input 
              type="checkbox" 
              id="show-my-orders-checkbox"
              checked={showMyOrdersOnly} 
              onChange={e => setShowMyOrdersOnly(e.target.checked)}
              aria-label="Show only my orders" 
            />
            <span className="checkmark"></span>
          </span>
          <span className="checkbox-text">My Orders Only</span>
          <span className="checkbox-tooltip" title="When checked, only shows orders you've placed">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <text x="12" y="17" textAnchor="middle" fill="currentColor" fontSize="16" fontWeight="bold">?</text>
            </svg>
          </span>
        </label>
      </div>
    </div>
  );
};

export default OrderFilters;
