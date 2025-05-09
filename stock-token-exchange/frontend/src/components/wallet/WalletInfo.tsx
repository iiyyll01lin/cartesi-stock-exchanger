import React, { useState } from 'react';
import { formatAddress } from '../../utils/formatting';
import { CHAIN_CONFIG } from '../../utils/constants';
import { useWalletContext } from '../../contexts/WalletContext';
import './WalletInfo.css'; // 引入專用CSS檔案

interface WalletInfoProps {
  account: string | null;
  chainId: string | null;
  ethBalance: string;
  tokenBalance: string;
  tokenSymbol: string;
  isLoading: boolean;
  exchangeEthBalance?: string; // Added exchange ETH balance
  exchangeTokenBalance?: string; // Added exchange Token balance
  connectWallet?: () => Promise<void>;
  onNetworkSwitch?: () => void; // Add this new prop
}

const WalletInfo: React.FC<WalletInfoProps> = ({
  account,
  chainId,
  ethBalance,
  tokenBalance,
  tokenSymbol,
  isLoading,
  exchangeEthBalance = "0", // Default to 0 if not provided
  exchangeTokenBalance = "0", // Default to 0 if not provided
  onNetworkSwitch
}) => {
  const { connectWallet, forceReconnect } = useWalletContext();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const isCorrectNetwork = chainId && parseInt(chainId) === CHAIN_CONFIG.chainId;
  const displayChainId = isLoading ? "Loading..." : (chainId || "Unknown");

  const handleForceReconnect = async () => {
    setIsReconnecting(true);
    try {
      await forceReconnect();
    } finally {
      setIsReconnecting(false);
    }
  };
  
  const handleSwitchNetwork = async () => {
    setIsReconnecting(true);
    try {
      await connectWallet();
      // Add a more substantial delay before fetching balances to ensure network is ready
      // This prevents excessive balance checks during network switching
      if (onNetworkSwitch) {
        setTimeout(() => {
          console.log("Triggering balance refresh after network switch");
          onNetworkSwitch();
        }, 2500); // 2.5 seconds delay
      }
    } finally {
      setIsReconnecting(false);
    }
  };
  
  return (
    <div className="wallet-info">
      {/* Connection Status Section */}
      <div className="wallet-section connection-section">
        <div className="wallet-status-indicator">
          <div className={`status-dot ${account ? (isCorrectNetwork ? 'connected' : 'wrong-network') : 'disconnected'}`}></div>
          <span>{account
            ? (isCorrectNetwork
              ? 'Connected to Hardhat Network'
              : `Wrong Network (Switch to Hardhat)`)
            : 'Wallet Disconnected'}
          </span>
        </div>
        
        <div className="wallet-details">
          <div className="info-row">
            <div className="info-label">Account:</div>
            <div className="info-value">{account ? formatAddress(account) : 'Not connected'}</div>
          </div>
          
          <div className="info-row">
            <div className="info-label">Chain ID:</div>
            <div className="info-value">
              {displayChainId === "Loading..."
                ? displayChainId
                : chainId
                  ? (isCorrectNetwork
                    ? <span className="correct-network">{displayChainId} ✓</span>
                    : <span className="wrong-network">{displayChainId} ⚠️</span>)
                  : 'Unknown'}
            </div>
          </div>
        </div>
      </div>
      
      {/* Wallet Balance Section */}
      <div className="wallet-section balance-section">
        <h3 className="section-title">Wallet Balances</h3>
        <div className="wallet-details">
          <div className="info-row balance-row">
            <div className="info-label">ETH Balance:</div>
            <div className="info-value">
              <span className="balance-amount">{parseFloat(ethBalance || "0").toFixed(4)}</span>
              <span className="balance-unit">ETH</span>
            </div>
          </div>
          
          <div className="info-row balance-row">
            <div className="info-label">Token Balance:</div>
            <div className="info-value">
              <span className="balance-amount">{parseFloat(tokenBalance || "0").toFixed(4)}</span>
              <span className="balance-unit">{tokenSymbol}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Exchange Balance Section */}
      <div className="wallet-section exchange-section">
        <h3 className="section-title">Exchange Balances</h3>
        <div className="wallet-details">
          <div className="info-row balance-row">
            <div className="info-label">ETH Balance:</div>
            <div className="info-value">
              <span className="balance-amount">{parseFloat(exchangeEthBalance || "0").toFixed(4)}</span>
              <span className="balance-unit">ETH</span>
            </div>
          </div>
          
          <div className="info-row balance-row">
            <div className="info-label">Token Balance:</div>
            <div className="info-value">
              <span className="balance-amount">{parseFloat(exchangeTokenBalance || "0").toFixed(4)}</span>
              <span className="balance-unit">{tokenSymbol}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Wallet action buttons */}
      <div className="wallet-section action-section">
        {!account ? (
          <button 
            onClick={connectWallet} 
            disabled={isLoading || isReconnecting} 
            className="wallet-button primary-button"
          >
            {isReconnecting ? 'Connecting...' : 'Connect your wallet to start trading.'}
          </button>
        ) : !isCorrectNetwork ? (
          <button 
            onClick={handleSwitchNetwork} 
            className="wallet-button network-button"
            disabled={isReconnecting}
          >
            {isReconnecting ? 'Switching...' : 'Switch to Hardhat Network'}
          </button>
        ) : (
          <button 
            onClick={handleForceReconnect}
            className="wallet-button reconnect-button"
            disabled={isReconnecting}
          >
            {isReconnecting ? 'Refreshing...' : 'Refresh Wallet'}
          </button>
        )}
      </div>
    </div>
  );
};

export default WalletInfo;
