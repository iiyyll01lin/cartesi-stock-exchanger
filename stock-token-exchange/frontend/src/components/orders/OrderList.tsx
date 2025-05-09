import React from 'react';
import { Order } from '../../types';
import OrderItem from './OrderItem';
import OrderFilters from './OrderFilters';
import { OrderFilterType } from '../../types';

interface OrderListProps {
  orders: Order[];
  account: string | null;
  orderFilter: OrderFilterType;
  setOrderFilter: (filter: OrderFilterType) => void;
  showMyOrdersOnly: boolean;
  setShowMyOrdersOnly: (show: boolean) => void;
  onCancelOrder: (orderId: number) => void;
}

const OrderList: React.FC<OrderListProps> = ({
  orders,
  account,
  orderFilter,
  setOrderFilter,
  showMyOrdersOnly,
  setShowMyOrdersOnly,
  onCancelOrder
}) => {
  return (
    <div className="trade-section order-book-section">
      <div className="section-header">
        <h2>Order Book</h2>
      </div>
      
      <div className="section-content">
        <div className="filter-container">
          <OrderFilters
            orderFilter={orderFilter}
            setOrderFilter={setOrderFilter}
            showMyOrdersOnly={showMyOrdersOnly}
            setShowMyOrdersOnly={setShowMyOrdersOnly}
          />
        </div>
        
        {orders.length === 0 ? (
          <div className="no-orders">
            <div className="empty-state">
              <i className="icon-empty"></i>
              <p>No orders found. Create a new order below.</p>
            </div>
          </div>
        ) : (
          <div className="order-list">
            <div className="order-header">
              <div className="order-header-item">Order ID</div>
              <div className="order-header-item">User</div>
              <div className="order-header-item">Token</div>
              <div className="order-header-item">Amount</div>
              <div className="order-header-item">Price</div>
              <div className="order-header-item">Status</div>
              <div className="order-header-item">Actions</div>
            </div>
            {orders.map(order => (
              <OrderItem
                key={order.id}
                order={order}
                account={account}
                onCancel={onCancelOrder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderList;
