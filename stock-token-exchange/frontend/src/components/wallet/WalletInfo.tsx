import React from 'react';
import { formatAddress } from '../../utils/formatting';
import { CHAIN_CONFIG } from '../../utils/constants';

interface WalletInfoProps {
  account: string | null;
  chainId: string | null;
  ethBalance: string;
  tokenBalance: string;
  tokenSymbol: string;
  isLoading: boolean;
  connectWallet: () => Promise<void>;
}

const WalletInfo: React.FC<WalletInfoProps> = ({
  account,
  chainId,
  ethBalance,
  tokenBalance,
  tokenSymbol,
  isLoading,
  connectWallet
}) => {
  const isCorrectNetwork = chainId && parseInt(chainId) === CHAIN_CONFIG.chainId;
  
  return (
    <div className="wallet-info">
      <div>
        <strong>Account:</strong> {account ? formatAddress(account) : 'Not connected'}
      </div>
      <div>
        <strong>Chain ID:</strong> {chainId ? (isCorrectNetwork ? `${chainId} ✓` : `${chainId} ⚠️`) : 'Unknown'}
      </div>
      <div>
        <strong>ETH Balance:</strong> {parseFloat(ethBalance).toFixed(4)} ETH
      </div>
      <div>
        <strong>Token Balance:</strong> {parseFloat(tokenBalance).toFixed(4)} {tokenSymbol}
      </div>
      {!account && (
        <button onClick={connectWallet} disabled={isLoading}>
          Connect Wallet
        </button>
      )}
      {account && (!chainId || parseInt(chainId) !== CHAIN_CONFIG.chainId) && (
        <button 
          onClick={connectWallet} 
          className="reconnect-button"
          title="Switch to Hardhat Network"
        >
          Switch to Hardhat Network
        </button>
      )}
    </div>
  );
};

export default WalletInfo;
