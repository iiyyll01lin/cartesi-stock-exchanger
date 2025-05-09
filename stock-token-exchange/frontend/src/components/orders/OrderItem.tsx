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
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default OrderItem;
