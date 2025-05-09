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
    <div className="trade-section order-form-section">
      <div className="section-header">
        <h2>Place Order</h2>
      </div>
      
      <div className="section-content">
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Order Type:</label>
            <div className="form-control">
              <div className="toggle-buttons">
                <button 
                  className={`toggle-button ${orderType === 'buy' ? 'active' : ''}`}
                  onClick={() => setOrderType('buy')}
                >
                  Buy
                </button>
                <button 
                  className={`toggle-button ${orderType === 'sell' ? 'active' : ''}`}
                  onClick={() => setOrderType('sell')}
                >
                  Sell
                </button>
              </div>
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Amount:</label>
            <div className="form-control">
              <input 
                type="text" 
                value={orderAmount} 
                onChange={e => setOrderAmount(e.target.value)} 
                placeholder="Enter amount" 
                className="form-input"
              />
              {orderAmountError && (
                <div className="error-message">{orderAmountError}</div>
              )}
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Price:</label>
            <div className="form-control">
              <input 
                type="text" 
                value={orderPrice} 
                onChange={e => setOrderPrice(e.target.value)} 
                placeholder="Enter price" 
                className="form-input"
              />
              {orderPriceError && (
                <div className="error-message">{orderPriceError}</div>
              )}
            </div>
          </div>
          
          {orderType === 'buy' && orderAmount && orderPrice && (
            <div className="form-group cost-summary">
              <div className="summary-item">
                <span className="summary-label">Total Cost:</span>
                <span className="summary-value">{totalCost} ETH</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Exchange Balance:</span>
                <span className="summary-value">{parseFloat(exchangeEthBalance).toFixed(4)} ETH</span>
              </div>
              
              {!hasEnoughETH && (
                <div className="error-message">
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
              
              {!isConnectedToCorrectNetwork && orderType === 'buy' && (
                <div className="warning-message">
                  * Exchange balance may be inaccurate when not connected to Hardhat Network. Actual transaction costs might differ.
                </div>
              )}
            </div>
          )}
          
          <div className="form-group form-actions">
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
              className={`action-button ${orderType === 'buy' ? 'buy-button' : 'sell-button'} ${
                orderType === 'buy' && !hasEnoughETH ? 'button-disabled' : ''
              }`}
              title={orderType === 'buy' && !hasEnoughETH ? 
                `Insufficient ETH balance. You need ${totalCost} ETH for this order.` : 
                isLoading ? 'Processing...' : `Place ${orderType === 'buy' ? 'Buy' : 'Sell'} Order`}
            >
              {isLoading ? 'Processing...' : `Place ${orderType === 'buy' ? 'Buy' : 'Sell'} Order`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderForm;
