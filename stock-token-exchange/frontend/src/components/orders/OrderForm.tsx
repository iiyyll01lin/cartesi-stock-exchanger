import React, { useMemo } from 'react';
import { parseEther, formatEther } from 'ethers/lib/utils';

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
  exchangeEthBalance: string;
  isConnectedToCorrectNetwork?: boolean;
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
  isLoading,
  exchangeEthBalance,
  isConnectedToCorrectNetwork = true
}) => {
  // Calculate total cost for buy orders (amount * price)
  const totalCost = useMemo(() => {
    if (!orderAmount || !orderPrice) return '0';
    try {
      // Use safe multiplication (parseEther handles decimal conversion)
      const amount = parseFloat(orderAmount);
      const price = parseFloat(orderPrice);
      if (isNaN(amount) || isNaN(price)) return '0';
      return (amount * price).toFixed(4);
    } catch (error) {
      console.error('Error calculating total cost:', error);
      return '0';
    }
  }, [orderAmount, orderPrice]);

  // Check if user has enough ETH in exchange balance
  const hasEnoughETH = useMemo(() => {
    if (orderType !== 'buy') return true;
    try {
      const cost = parseFloat(totalCost);
      const balance = parseFloat(exchangeEthBalance);
      return !isNaN(cost) && !isNaN(balance) && balance >= cost;
    } catch (error) {
      console.error('Error checking ETH balance:', error);
      return false;
    }
  }, [totalCost, exchangeEthBalance, orderType]);
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
          {orderType === 'buy' && orderAmount && orderPrice && (
            <div className="helper-text">
              <div>Total Cost: {totalCost} ETH</div>
              <div>Exchange Balance: {parseFloat(exchangeEthBalance).toFixed(4)} ETH</div>
              {!hasEnoughETH && (            <div className="error-message">
              Insufficient ETH in your exchange balance. You need {totalCost} ETH but only have {parseFloat(exchangeEthBalance).toFixed(4)} ETH.
              Please deposit more ETH before placing this order.
            </div>
          )}
          
          {orderType === 'buy' && !hasEnoughETH && parseFloat(exchangeEthBalance) === 0 && (
            <div className="info-message">
              Note: You need to deposit ETH to your exchange balance before placing buy orders.
              Please use the Deposit & Withdraw form to add ETH.
            </div>
          )}
            </div>
          )}
          
          {!isConnectedToCorrectNetwork && orderType === 'buy' && (
            <div className="warning-message">
              * Exchange balance may be inaccurate when not connected to Hardhat Network. Actual transaction costs might differ.
            </div>
          )}
        </div>
        <div className="form-actions">
          <button 
            onClick={() => {
              try {
                onPlaceOrder();
              } catch (error) {
                console.error('Error placing order:', error);
                alert('Failed to place order. Please try again.');
              }
            }}
            disabled={isLoading || (orderType === 'buy' && !hasEnoughETH)}
            title={orderType === 'buy' && !hasEnoughETH ? 
              `Insufficient ETH balance. You need ${totalCost} ETH for this order.` : 
              isLoading ? 'Processing...' : `Place ${orderType === 'buy' ? 'Buy' : 'Sell'} Order`}
            className={orderType === 'buy' && !hasEnoughETH ? 'button-disabled' : ''}
          >
            {isLoading ? 'Processing...' : `Place ${orderType === 'buy' ? 'Buy' : 'Sell'} Order`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderForm;
