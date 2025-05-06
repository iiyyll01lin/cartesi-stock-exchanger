// Wallet hook
import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { connectToMetaMask, getChainId, switchToHardhatNetwork } from '../services/metamask';
import { CHAIN_CONFIG } from '../utils/constants';
import { useNotifications } from './useNotifications';

export function useWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { addNotification } = useNotifications();
  
  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      addNotification('error', 'MetaMask not detected. Please install MetaMask.');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Request accounts
      const accounts = await connectToMetaMask();
      
      if (accounts.length > 0) {
        const currentAccount = accounts[0];
        setAccount(currentAccount);
        addNotification('success', `Wallet connected: ${currentAccount.substring(0, 6)}...${currentAccount.substring(currentAccount.length - 4)}`);
        
        // Initialize Ethers
        const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
        setProvider(web3Provider);
        setSigner(web3Provider.getSigner());
        
        // Get Network
        const chainId = await getChainId();
        console.log("Connected to chain ID:", chainId);
        setChainId(chainId.toString());
        
        // Check if on the correct network
        if (chainId !== CHAIN_CONFIG.chainId) {
          setNetworkWarning(true);
          addNotification('warning', `Network Warning: You are connected to network ${chainId}, but contracts are deployed on ${CHAIN_CONFIG.chainId}.`, false);
          
          // Prompt user to switch networks
          try {
            const switched = await switchToHardhatNetwork();
            if (switched) {
              // Get the new chain ID after switching
              const newChainId = await getChainId();
              setChainId(newChainId.toString());
              if (newChainId === CHAIN_CONFIG.chainId) {
                setNetworkWarning(false);
                addNotification('success', 'Successfully connected to Hardhat network');
              }
            }
          } catch (switchError) {
            console.error("Error switching networks:", switchError);
            addNotification('error', `Failed to switch networks: ${switchError.message}`, false);
          }
        } else {
          setNetworkWarning(false);
        }
      } else {
        addNotification('warning', 'No accounts found. Please unlock MetaMask.');
      }
    } catch (error: any) {
      console.error("Error connecting wallet:", error);
      addNotification('error', `Failed to connect wallet: ${error.message}`, false);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);
  
  // Handle accounts changed
  const handleAccountsChanged = useCallback((accounts: string[]) => {
    if (accounts.length === 0) {
      console.log('Please connect to MetaMask.');
      setAccount(null);
      setSigner(null);
      addNotification('info', 'Wallet disconnected.');
    } else if (accounts[0] !== account) {
      const newAccount = accounts[0];
      setAccount(newAccount);
      
      // Update signer if provider exists
      if (provider) {
        setSigner(provider.getSigner());
      }
      
      addNotification('info', `Account changed to ${newAccount.substring(0, 6)}...${newAccount.substring(newAccount.length - 4)}`);
    }
  }, [account, provider, addNotification]);
  
  // Handle chain changed
  const handleChainChanged = useCallback(async (chainId: string) => {
    console.log('Chain changed to:', chainId);
    const decimalChainId = parseInt(chainId, 16);
    setChainId(decimalChainId.toString());
    
    // Check if on the correct network
    if (decimalChainId !== CHAIN_CONFIG.chainId) {
      setNetworkWarning(true);
      addNotification('warning', `Network Warning: You are connected to network ${decimalChainId}, but contracts are deployed on ${CHAIN_CONFIG.chainId}.`, false);
      
      // Prompt user to switch networks
      try {
        const switched = await switchToHardhatNetwork();
        if (switched) {
          // Get the new chain ID after switching
          const newChainId = await window.ethereum.request({ method: 'eth_chainId' });
          const newDecimalChainId = parseInt(newChainId, 16);
          setChainId(newDecimalChainId.toString());
          addNotification('success', 'Successfully connected to Hardhat network');
          
          // Initialize provider and signer with the new network
          const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
          setProvider(web3Provider);
          setSigner(web3Provider.getSigner());
          
          // No need to reload the page, just update the state
          setNetworkWarning(false);
        }
      } catch (switchError) {
        console.error("Error switching networks:", switchError);
        addNotification('error', `Failed to switch networks: ${switchError.message}`, false);
      }
    } else {
      setNetworkWarning(false);
      addNotification('success', 'Connected to the correct network.');
      
      // Initialize provider and signer with the current network
      const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(web3Provider);
      setSigner(web3Provider.getSigner());
    }
    
    // Don't reload the page - this is causing the contract initialization issues
    // window.location.reload();
  }, [addNotification]);
  
  // Setup event listeners
  useEffect(() => {
    if (window.ethereum) {
      // Add event listeners
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      
      // Check if already connected
      window.ethereum.request({ method: 'eth_accounts' })
        .then(handleAccountsChanged)
        .catch((err: any) => console.error("Error checking accounts:", err));
      
      // Cleanup
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [handleAccountsChanged, handleChainChanged]);
  
  return {
    account,
    provider,
    signer,
    chainId,
    networkWarning,
    isLoading,
    connectWallet
  };
}
