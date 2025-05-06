// Balances hook
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { fetchBalancesFromContracts } from '../services/contracts';
import { fetchUserBalanceFromApi } from '../services/api';
import { useNotifications } from './useNotifications';

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
  const { addNotification } = useNotifications();
  
  // Fetch balances
  const fetchBalances = useCallback(async () => {
    if (!account) return;
    
    try {
      setIsLoading(true);
      
      // Try to fetch from blockchain first
      if (tokenContract && exchangeContract) {
        const balances = await fetchBalancesFromContracts(
          account,
          tokenContract,
          exchangeContract
        );
        
        if (balances) {
          setEthBalance(balances.ethBalance);
          setTokenBalance(balances.tokenBalance);
          setExchangeEthBalance(balances.exchangeEthBalance);
          setExchangeTokenBalance(balances.exchangeTokenBalance);
          addNotification('success', 'Balances updated');
          return;
        }
      }
      
      // Fallback to API
      const balanceData = await fetchUserBalanceFromApi(account);
      
      if (balanceData) {
        setEthBalance(balanceData.eth || "0");
        setTokenBalance(balanceData.token || "0");
        setExchangeEthBalance(balanceData.exchange_eth || "0");
        setExchangeTokenBalance(balanceData.exchange_token || "0");
        addNotification('info', 'Balances fetched from API');
      }
    } catch (error: any) {
      console.error("Error fetching balances:", error);
      addNotification('error', `Failed to fetch balances: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [account, tokenContract, exchangeContract, addNotification]);
  
  // Fetch balances when account or contracts change
  useEffect(() => {
    if (account) {
      fetchBalances();
    }
  }, [account, tokenContract, exchangeContract, fetchBalances]);
  
  return {
    ethBalance,
    tokenBalance,
    exchangeEthBalance,
    exchangeTokenBalance,
    isLoading,
    fetchBalances
  };
}
