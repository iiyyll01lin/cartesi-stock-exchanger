import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/useWallet';
import { checkConnections } from '../services/blockchain';

interface WalletContextType {
  account: string | null;
  provider: ethers.providers.Web3Provider | null;
  signer: ethers.Signer | null;
  chainId: string | null;
  networkWarning: boolean;
  isLoading: boolean;
  connectWallet: () => Promise<void>;
  checkConnections: () => Promise<string[]>;
}

const WalletContext = createContext<WalletContextType>({
  account: null,
  provider: null,
  signer: null,
  chainId: null,
  networkWarning: false,
  isLoading: false,
  connectWallet: async () => {},
  checkConnections: async () => []
});

export const useWalletContext = () => useContext(WalletContext);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    account,
    provider,
    signer,
    chainId,
    networkWarning,
    isLoading,
    connectWallet
  } = useWallet();
  
  const checkConnectionsFunc = useCallback(async () => {
    return checkConnections(provider);
  }, [provider]);
  
  const value = useMemo(() => ({
    account,
    provider,
    signer,
    chainId,
    networkWarning,
    isLoading,
    connectWallet,
    checkConnections: checkConnectionsFunc
  }), [account, provider, signer, chainId, networkWarning, isLoading, connectWallet, checkConnectionsFunc]);
  
  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};
