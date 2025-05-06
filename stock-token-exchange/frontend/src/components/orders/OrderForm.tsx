import React from 'react';

interface OrderFormProps {
  orderType: 'buy' | 'sell';
  setOrderType: (type: 'buy' | 'sell') => void;
  orderAmount: string;
  setOrderAmount: (amount: string) => void;
  orderPrice: string;
  setOrderPrice: (price: string) => void;
  orderAmountError: string | null;
  orderPriceError: string | null;
  onPlaceOrder: () => void;
  isLoading: boolean;
}

const OrderForm: React.FC<OrderFormProps> = ({
  orderType,
  setOrderType,
  orderAmount,
  setOrderAmount,
  orderPrice,
  setOrderPrice,
  orderAmountError,
  orderPriceError,
  onPlaceOrder,
  isLoading
}) => {
  return (
    <div className="section">
      <h2>Place Order</h2>
      <div className="order-form">
        <div>
          <label>Order Type:</label>
          <select 
            value={orderType} 
            onChange={e => setOrderType(e.target.value as 'buy' | 'sell')}
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div>
          <label>Amount:</label>
          <input 
            type="text" 
            value={orderAmount} 
            onChange={e => setOrderAmount(e.target.value)} 
            placeholder="Enter amount" 
          />
          {orderAmountError && <div className="error-message">{orderAmountError}</div>}
        </div>
        <div>
          <label>Price:</label>
          <input 
            type="text" 
            value={orderPrice} 
            onChange={e => setOrderPrice(e.target.value)} 
            placeholder="Enter price" 
          />
          {orderPriceError && <div className="error-message">{orderPriceError}</div>}
        </div>
        <div className="form-actions">
          <button 
            onClick={onPlaceOrder}
            disabled={isLoading}
          >
            Place {orderType === 'buy' ? 'Buy' : 'Sell'} Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderForm;
