// Balances hook
import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { fetchBalances as fetchBalancesFromContract, fetchBalancesFromContracts } from '../services/contracts';
import { fetchUserBalanceFromApi } from '../services/api';
import { useNotifications } from './useNotifications';

// Debounce helper function
const debounce = (fn: Function, ms = 1000) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function(...args: any[]) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
};

export function useBalances(
  account: string | null,
  tokenContract: ethers.Contract | null,
  exchangeContract: ethers.Contract | null
) {
  const [ethBalance, setEthBalance] = useState<string>("0");
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [exchangeEthBalance, setExchangeEthBalance] = useState<string>("0");
  const [exchangeTokenBalance, setExchangeTokenBalance] = useState<string>("0");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const { addNotification } = useNotifications();
  const lastFetchRef = useRef<number>(0);
  const fetchInProgressRef = useRef<boolean>(false);
  
  // Fetch balances with optimized approach
  const fetchUserBalances = useCallback(async () => {
    if (!account) return;
    
    // Avoid multiple concurrent balance fetches
    if (fetchInProgressRef.current) return;
    
    // Implement rate limiting (minimum 3 seconds between fetches)
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchRef.current;
    if (timeSinceLastFetch < 3000 && lastFetchRef.current !== 0) {
      return; // Skip this fetch if it's too soon after the last one
    }
    
    // Set the fetch timestamp and in-progress flag
    lastFetchRef.current = now;
    fetchInProgressRef.current = true;
    
    try {
      setIsLoading(true);
      
      // Try to fetch from blockchain first - use only a SINGLE reliable method
      if (tokenContract && exchangeContract) {
        try {
          // Use a direct JsonRpcProvider - most reliable option
          const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
          
          // Create static contract instances to avoid caching issues
          const staticTokenContract = new ethers.Contract(
            tokenContract.address, 
            tokenContract.interface, 
            provider
          );
          
          const staticExchangeContract = new ethers.Contract(
            exchangeContract.address,
            exchangeContract.interface,
            provider
          );
          
          // Fetch ETH balance
          const ethBalanceBigNumber = await provider.getBalance(account);
          const ethBalanceFormatted = ethers.utils.formatEther(ethBalanceBigNumber);
          
          // Fetch token balance
          const tokenBalanceBigNumber = await staticTokenContract.balanceOf(account);
          const tokenBalanceFormatted = ethers.utils.formatEther(tokenBalanceBigNumber);
          
          // Fetch exchange ETH balance
          let exchangeEthBigNumber;
          try {
            exchangeEthBigNumber = await staticExchangeContract.getUserEthBalance(account);
          } catch (error) {
            exchangeEthBigNumber = ethers.BigNumber.from(0);
          }
          const exchangeEthFormatted = ethers.utils.formatEther(exchangeEthBigNumber);
          
          // Fetch exchange token balance
          let exchangeTokenBigNumber;
          try {
            console.log("Fetching exchange token balance for:", {
              account,
              tokenAddress: tokenContract.address
            });
            exchangeTokenBigNumber = await staticExchangeContract.getUserTokenBalance(account, tokenContract.address);
            console.log("Raw exchange token balance:", exchangeTokenBigNumber.toString());
          } catch (error) {
            console.error("Error fetching exchange token balance:", error);
            exchangeTokenBigNumber = ethers.BigNumber.from(0);
          }
          const exchangeTokenFormatted = ethers.utils.formatEther(exchangeTokenBigNumber);
          console.log("Formatted exchange token balance:", exchangeTokenFormatted);
          
          // Update state - but only if values changed
          if (ethBalanceFormatted !== ethBalance) setEthBalance(ethBalanceFormatted);
          if (tokenBalanceFormatted !== tokenBalance) setTokenBalance(tokenBalanceFormatted);
          if (exchangeEthFormatted !== exchangeEthBalance) setExchangeEthBalance(exchangeEthFormatted);
          if (exchangeTokenFormatted !== exchangeTokenBalance) setExchangeTokenBalance(exchangeTokenFormatted);
          
          // Force UI refresh only if something changed
          if (
            ethBalanceFormatted !== ethBalance ||
            tokenBalanceFormatted !== tokenBalance ||
            exchangeEthFormatted !== exchangeEthBalance ||
            exchangeTokenFormatted !== exchangeTokenBalance
          ) {
            setLastUpdated(Date.now());
          }
        } catch (error) {
          console.error("Error fetching balances:", error);
          // Don't show notifications for routine errors to avoid spamming the user
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error("General error fetching balances:", err);
      // Only show critical errors
      if (err.message && !err.message.includes('call revert') && !err.message.includes('network error')) {
        addNotification('error', `Failed to fetch balances: ${err.message}`);
      }
    } finally {
      setIsLoading(false);
      fetchInProgressRef.current = false;
    }
  }, [account, tokenContract, exchangeContract, addNotification, ethBalance, tokenBalance, exchangeEthBalance, exchangeTokenBalance]);
  
  // Create a debounced version of fetchUserBalances
  const debouncedFetchBalances = useCallback(
    debounce(() => {
      fetchUserBalances();
    }, 1000),
    [fetchUserBalances]
  );
  
  // Set up polling interval and initial fetch
  useEffect(() => {
    let isActive = true;
    let pollingInterval: NodeJS.Timeout | null = null;
    
    const loadBalances = async () => {
      if (account && isActive && !fetchInProgressRef.current) {
        await fetchUserBalances();
      }
    };
    
    // Initial load (with slight delay to allow network connection to stabilize)
    const initialLoadTimeout = setTimeout(() => {
      if (isActive) {
        loadBalances();
      }
    }, 1500);
    
    // Set up polling at a reasonable interval (every 15 seconds)
    if (account && tokenContract && exchangeContract) {
      pollingInterval = setInterval(() => {
        if (isActive && !fetchInProgressRef.current) {
          loadBalances();
        }
      }, 17000); // 17 seconds interval
    }
    
    // Cleanup function to prevent setting state after unmount
    return () => {
      isActive = false;
      if (initialLoadTimeout) clearTimeout(initialLoadTimeout);
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [account, tokenContract?.address, exchangeContract?.address, fetchUserBalances]);
  
  return {
    ethBalance,
    tokenBalance,
    exchangeEthBalance,
    exchangeTokenBalance,
    isLoading,
    fetchUserBalances: debouncedFetchBalances, // Expose debounced version instead
    lastUpdated,
  };
}
