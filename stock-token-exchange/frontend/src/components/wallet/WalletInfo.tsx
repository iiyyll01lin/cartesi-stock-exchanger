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
  connectWallet?: () => Promise<void>;
}

const WalletInfo: React.FC<WalletInfoProps> = ({
  account,
  chainId,
  ethBalance,
  tokenBalance,
  tokenSymbol,
  isLoading
}) => {
  const { connectWallet, forceReconnect } = useWalletContext();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const isCorrectNetwork = chainId && parseInt(chainId) === CHAIN_CONFIG.chainId;
  
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
            : 'Wrong Network (Switch to Hardhat)') 
          : 'Wallet Disconnected'}
        </span>
      </div>
      <div>
        <strong>Account:</strong> {account ? formatAddress(account) : 'Not connected'}
      </div>
      <div>
        <strong>Chain ID:</strong> {chainId 
          ? (isCorrectNetwork 
            ? <span className="correct-network">{chainId} ✓</span> 
            : <span className="wrong-network">{chainId} ⚠️</span>) 
          : 'Unknown'}
      </div>
      <div>
        <strong>ETH Balance:</strong> {parseFloat(ethBalance || "0").toFixed(4)} ETH
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
