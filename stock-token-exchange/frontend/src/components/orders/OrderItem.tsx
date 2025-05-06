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
    <div className={`order-item ${order.isBuyOrder ? 'buy' : 'sell'}`}>
      <div>
        <strong>Order ID:</strong> {order.id}
      </div>
      <div>
        <strong>User:</strong> {formatAddress(order.user)}
        {isUserOrder && <span className="your-order"> (You)</span>}
      </div>
      <div>
        <strong>Token:</strong> {formatAddress(order.token)}
      </div>
      <div>
        <strong>Amount:</strong> {order.amount}
      </div>
      <div>
        <strong>Price:</strong> {order.price}
      </div>
      <div>
        <strong>Status:</strong> {order.active ? 'Active' : 'Inactive'}
      </div>
      {isUserOrder && order.active && (
        <div className="order-actions">
          <button onClick={() => onCancel(order.id)}>
            Cancel Order
          </button>
        </div>
      )}
    </div>
  );
};

export default OrderItem;
