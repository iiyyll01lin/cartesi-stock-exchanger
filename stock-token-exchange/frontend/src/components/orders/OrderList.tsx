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
    <div className="section">
      <h2>Order Book</h2>
      <OrderFilters
        orderFilter={orderFilter}
        setOrderFilter={setOrderFilter}
        showMyOrdersOnly={showMyOrdersOnly}
        setShowMyOrdersOnly={setShowMyOrdersOnly}
      />
      
      {orders.length === 0 ? (
        <div className="no-orders">
          No orders found. Create a new order below.
        </div>
      ) : (
        <div className="order-list">
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
  );
};

export default OrderList;
