import React from 'react';
import { Order } from '../../types';
import { formatAddress } from '../../utils/formatting';

interface OrderItemProps {
  order: Order;
  account: string | null;
  onCancel: (orderId: number) => void;
}

const OrderItem: React.FC<OrderItemProps> = ({ order, account, onCancel }) => {
  const isUserOrder = account && order.user.toLowerCase() === account.toLowerCase();
  
  return (
    <div className={`order-item ${order.isBuyOrder ? 'buy-order' : 'sell-order'} ${isUserOrder ? 'your-order' : ''}`}>
      <div className="order-cell order-id">
        <span>{order.id}</span>
      </div>
      
      <div className="order-cell order-user">
        <span title={order.user}>{formatAddress(order.user)}</span>
        {isUserOrder && <span className="user-badge">You</span>}
      </div>
      
      <div className="order-cell order-token">
        <span title={order.token}>{formatAddress(order.token)}</span>
      </div>
      
      <div className="order-cell order-amount">
        <span>{order.amount}</span>
      </div>
      
      <div className="order-cell order-price">
        <span>{order.price}</span>
      </div>
      
      <div className="order-cell order-status">
        <span className={`status-badge ${order.active ? 'active' : 'inactive'}`}>
          {order.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      
      <div className="order-cell order-actions">
        {isUserOrder && order.active && (
          <button 
            onClick={() => onCancel(order.id)}
            className="cancel-button"
            title="Cancel this order"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 6H5H21" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V6H19Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M10 11V17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M14 11V17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>

          </button>
        )}
      </div>
    </div>
  );
};

export default OrderItem;
