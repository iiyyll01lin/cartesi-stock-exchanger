import React, { useEffect, useState } from 'react';
import WalletInfo from '../components/wallet/WalletInfo';
import OrderList from '../components/orders/OrderList';
import OrderForm from '../components/orders/OrderForm';
import DepositWithdrawForm from '../components/wallet/DepositWithdrawForm';
import ConnectionErrorMessage from '../components/common/ConnectionErrorMessage';
import { useWalletContext } from '../contexts/WalletContext';
import { useContractContext } from '../contexts/ContractContext';
import { useNotificationContext } from '../contexts/NotificationContext';
import { useOrders } from '../hooks/useOrders';
import { useBalances } from '../hooks/useBalances';
import { useDepositWithdraw } from '../hooks/useDepositWithdraw';
import { useWalletStatus } from '../hooks/useWalletStatus';

const Dashboard: React.FC = () => {
  const { account, chainId, networkWarning, isLoading: walletLoading, connectWallet, checkConnections } = useWalletContext();
  const { exchangeContract, stockTokenContract, tokenSymbol, tokenAddress } = useContractContext();
  const { addNotification } = useNotificationContext();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [message] = useState<string>('Connect your wallet to start trading.');
  const { isConnected, isContractsLoaded, hasSigner, signedMessage } = useWalletStatus();
  
  // Log wallet status on changes
  useEffect(() => {
    console.log('Wallet Status:', {
      isConnected,
      isContractsLoaded,
      hasSigner,
      signedMessage,
      exchangeContractAddress: exchangeContract?.address || 'N/A',
      stockTokenContractAddress: stockTokenContract?.address || 'N/A',
      walletAccount: account || 'N/A',
      contractMethods: exchangeContract ? Object.keys(exchangeContract.functions).slice(0, 5).join(', ') + '...' : 'N/A'
    });
    
    // Display a more detailed message when there are connection issues
    if (isConnected && !isContractsLoaded) {
      setErrorMessage('Contracts not properly loaded. Please check your network connection.');
    } else if (isConnected && !hasSigner) {
      setErrorMessage('Wallet connected but signer not available. Please refresh the page.');
    } else {
      setErrorMessage(null);
    }
  }, [isConnected, isContractsLoaded, hasSigner, signedMessage]);
  
  // Get balances
  const {
    ethBalance,
    tokenBalance,
    exchangeEthBalance,
    exchangeTokenBalance,
    isLoading: balancesLoading,
    // fetchBalances is defined but unused in the component
  } = useBalances(account, stockTokenContract, exchangeContract);
  
  // Get orders
  const {
    filteredOrders,
    orderFilter,
    setOrderFilter,
    showMyOrdersOnly,
    setShowMyOrdersOnly,
    orderAmount,
    setOrderAmount,
    orderPrice,
    setOrderPrice,
    orderType,
    setOrderType,
    orderAmountError,
    orderPriceError,
    handlePlaceOrder,
    handleCancelOrder,
    isLoading: ordersLoading
  } = useOrders(account, exchangeContract, tokenAddress);
  
  const isLoading = walletLoading || balancesLoading || ordersLoading;
  
  // Get deposit/withdraw functions
  const {
    depositETH,
    withdrawETH,
    depositToken,
    withdrawToken,
    isDepositing,
    isWithdrawing
  } = useDepositWithdraw(exchangeContract, stockTokenContract, tokenAddress);
  
  const onPlaceOrder = () => {
    if (!account) {
      addNotification('error', 'Please connect your wallet first');
      return;
    }
    
    handlePlaceOrder(orderType === 'buy');
  };
  
  return (
    <>
      {/* Hot reload indicator - if you see this text, hot reloading is working */}
      <div style={{ background: '#f0f9ff', color: 'blue', padding: '5px', textAlign: 'center' }}>
        Hot Reload Verification - {new Date().toLocaleTimeString()}
      </div>
      
      <WalletInfo
        account={account}
        chainId={chainId}
        ethBalance={ethBalance}
        tokenBalance={tokenBalance}
        tokenSymbol={tokenSymbol}
        isLoading={isLoading}
        connectWallet={connectWallet}
      />
      
      <div className="message" style={{ color: errorMessage ? 'red' : 'inherit' }}>
        {message}
      </div>
      
      {networkWarning && (
        <div className="network-warning">
          ⚠️ You are connected to the wrong network! Please switch to the Hardhat network.
        </div>
      )}
      
      <div className="content">
        <OrderList
          orders={filteredOrders}
          account={account}
          orderFilter={orderFilter}
          setOrderFilter={setOrderFilter}
          showMyOrdersOnly={showMyOrdersOnly}
          setShowMyOrdersOnly={setShowMyOrdersOnly}
          onCancelOrder={handleCancelOrder}
        />
        
        <div className="forms-container">
          <OrderForm
            orderType={orderType}
            setOrderType={setOrderType}
            orderAmount={orderAmount}
            setOrderAmount={setOrderAmount}
            orderPrice={orderPrice}
            setOrderPrice={setOrderPrice}
            orderAmountError={orderAmountError}
            orderPriceError={orderPriceError}
            onPlaceOrder={onPlaceOrder}
            isLoading={isLoading}
          />
          
          <DepositWithdrawForm
            tokenSymbol={tokenSymbol}
            onDepositETH={depositETH}
            onWithdrawETH={withdrawETH}
            onDepositToken={depositToken}
            onWithdrawToken={withdrawToken}
            isDepositing={isDepositing}
            isWithdrawing={isWithdrawing}
            exchangeEthBalance={exchangeEthBalance}
            exchangeTokenBalance={exchangeTokenBalance}
          />
        </div>
      </div>
      
      {/* Show connection error message if applicable */}
      {(errorMessage || networkWarning || !account) && (
        <ConnectionErrorMessage checkConnections={checkConnections} />
      )}
    </>
  );
};

export default Dashboard;
