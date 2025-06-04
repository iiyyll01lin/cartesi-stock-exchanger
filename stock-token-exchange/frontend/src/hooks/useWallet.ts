// Wallet hook
import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { connectToMetaMask, getChainId, switchToHardhatNetwork } from '../services/metamask';
import { CHAIN_CONFIG } from '../utils/constants';
import { useNotifications } from './useNotifications';

export function useWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { addNotification } = useNotifications();
  
  // Force reconnect - explicitly checks current MetaMask account
  const forceReconnect = useCallback(async () => {
    if (!window.ethereum) {
      addNotification('error', 'MetaMask not detected. Please install MetaMask.');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Force a refresh of accounts
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts'
      });
      
      if (accounts.length > 0) {
        const currentAccount = accounts[0];
        setAccount(currentAccount);
        console.log(`Force reconnected to account: ${currentAccount}`);
        
        // Initialize Ethers with a fresh provider
        const web3Provider = new ethers.BrowserProvider(window.ethereum, "any");
        setProvider(web3Provider);
        setSigner(await web3Provider.getSigner());
        
        // Get Network
        try {
          const chainId = await getChainId();
          setChainId(chainId.toString());
          
          // Check if on the correct network
          setNetworkWarning(chainId !== CHAIN_CONFIG.chainId);
          
          // Provide detailed feedback
          addNotification(
            'success', 
            `Wallet refreshed: ${currentAccount.substring(0, 6)}...${currentAccount.substring(currentAccount.length - 4)} on network ${chainId}`
          );
        } catch (error) {
          console.error("Error getting chain ID:", error);
          addNotification('warning', 'Connected but could not determine network');
        }
      } else {
        addNotification('warning', 'No accounts found. Please unlock MetaMask.');
      }
    } catch (error) {
      const err = error as { message?: string };
      console.error("Error reconnecting wallet:", err);
      addNotification('error', `Failed to refresh wallet: ${err.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);
  
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
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(web3Provider);
      const signer = await web3Provider.getSigner();
      setSigner(signer);
      
      // Get user's ETH balance for immediate display
      try {
        const userBalance = await web3Provider.getBalance(currentAccount);
        console.log(`User ETH balance from provider: ${ethers.formatEther(userBalance)} ETH`);
      } catch (balanceError) {
        console.error("Error fetching initial ETH balance:", balanceError);
      }
        
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
                
                // Give time for the network to stabilize before fetching balances
                setTimeout(async () => {
                  // Refresh provider and signer
                  const web3Provider = new ethers.BrowserProvider(window.ethereum);
                  setProvider(web3Provider);
                  const signer = await web3Provider.getSigner();
                  setSigner(signer);
                  console.log("Provider and signer refreshed after network switch");
                }, 1000);
              }
            }
          } catch (error) {
            const switchError = error as { message?: string };
            console.error("Error switching networks:", switchError);
            addNotification('error', `Failed to switch networks: ${switchError.message || 'Unknown error'}`, false);
          }
        } else {
          setNetworkWarning(false);
        }
      } else {
        addNotification('warning', 'No accounts found. Please unlock MetaMask.');
      }
    } catch (error) {
      const err = error as { message?: string };
      console.error("Error connecting wallet:", err);
      addNotification('error', `Failed to connect wallet: ${err.message || 'Unknown error'}`, false);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);
  
  // Handle accounts changed
  const handleAccountsChanged = useCallback(async (accounts: string[]) => {
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
        setSigner(await provider.getSigner());
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
      addNotification('warning', `Network Warning: You are connected to network ${decimalChainId}, but contracts are deployed on ${CHAIN_CONFIG.chainId} (Hardhat).`, false);
      
      // Don't automatically prompt user to switch - let them decide to click the button
    } else {
      setNetworkWarning(false);
      
      // Initialize provider and signer with the current network
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(web3Provider);
      web3Provider.getSigner().then(signer => setSigner(signer));
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
    connectWallet,
    forceReconnect
  };
}