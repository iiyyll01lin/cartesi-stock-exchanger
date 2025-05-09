import React, { useState } from 'react';
import { formatAddress } from '../../utils/formatting';
import { CHAIN_CONFIG } from '../../utils/constants';
import { useWalletContext } from '../../contexts/WalletContext';

interface WalletInfoProps {
  account: string | null;
  chainId: string | null;
  ethBalance: string;
  tokenBalance: string;
  tokenSymbol: string;
  isLoading: boolean;
  exchangeEthBalance?: string; // Added exchange ETH balance
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
      <div className="wallet-status-indicator">
        <div className={`status-dot ${account ? (isCorrectNetwork ? 'connected' : 'wrong-network') : 'disconnected'}`}></div>
        <span>{account
          ? (isCorrectNetwork
            ? 'Connected to Hardhat Network'
            : `Wrong Network (Switch to Hardhat)`)
          : 'Wallet Disconnected'}
        </span>
      </div>
      <div>
        <strong>Account:</strong> {account ? formatAddress(account) : 'Not connected'}
      </div>
      <div>
        <strong>Chain ID:</strong> {displayChainId === "Loading..."
          ? displayChainId
          : chainId
            ? (isCorrectNetwork
              ? <span className="correct-network">{displayChainId} ✓</span>
              : <span className="wrong-network">{displayChainId} ⚠️</span>)
            : 'Unknown'}
      </div>
      <div>
        <strong>ETH Balance:</strong> {parseFloat(ethBalance || "0").toFixed(4)} ETH
      </div>
      <div>
        <strong>Exchange ETH:</strong> {parseFloat(exchangeEthBalance || "0").toFixed(4)} ETH
      </div>
      <div>
        <strong>Token Balance:</strong> {parseFloat(tokenBalance || "0").toFixed(4)} {tokenSymbol}
      </div>
      
      {/* Wallet action buttons */}
      {!account ? (
        <button 
          onClick={connectWallet} 
          disabled={isLoading || isReconnecting} 
          className="wallet-button primary-button"
        >
          {isReconnecting ? 'Connecting...' : 'Connect Wallet'}
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
  );
};

export default WalletInfo;
