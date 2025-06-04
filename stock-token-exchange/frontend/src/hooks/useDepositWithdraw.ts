import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useNotificationContext } from '../contexts/NotificationContext';
import { useWalletContext } from '../contexts/WalletContext';

export function useDepositWithdraw(
  exchangeContract: ethers.Contract | null,
  tokenContract: ethers.Contract | null,
  tokenAddress: string,
  onTransactionSuccess?: () => void // Add callback for refreshing data
) {
  const [isDepositing, setIsDepositing] = useState<boolean>(false);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const { addNotification } = useNotificationContext();
  const { account } = useWalletContext();

  // Deposit ETH
  const depositETH = useCallback(async (amount: string) => {
    console.log("Deposit ETH called with:", { 
      amount, 
      account, 
      exchangeContract: !!exchangeContract,
      exchangeContractAddress: exchangeContract?.target || 'N/A',
      signerFromContract: exchangeContract?.runner ? 'YES' : 'NO',
      providerFromContract: exchangeContract?.runner?.provider ? 'YES' : 'NO'
    });
    
    if (!exchangeContract || !account) {
      console.error("Deposit failed: Contract or account missing", { 
        hasExchangeContract: !!exchangeContract, 
        hasAccount: !!account,
        exchangeContractMethods: exchangeContract ? Object.keys(exchangeContract.functions).join(', ') : 'N/A',
        userAddress: account || 'N/A'
      });
      addNotification('error', 'No contract or wallet connection available');
      return;
    }

    try {
      setIsDepositing(true);
      
      // Connect the contract to the current signer explicitly
      const connectedContract = exchangeContract;
      console.log("Connected contract:", {
        address: await connectedContract.getAddress(),
        hasRunner: !!connectedContract.runner
      });
      
      // Convert to Wei
      const ethAmount = ethers.parseEther(amount);
      console.log(`Depositing ${amount} ETH (${ethAmount.toString()} wei)`);
      
      // Call the contract with explicit gas limit and value
      const tx = await connectedContract.depositETH({ 
        value: ethAmount,
        gasLimit: 250000 // Explicit gas limit to avoid estimation errors
      });
      console.log("Transaction submitted:", tx.hash);
      
      // Wait for confirmation
      // Use type assertion to handle ethers v6 typing issue with wait() method
      const receipt = await (tx as any).wait();
      console.log("Transaction confirmed:", receipt);
      
      if (receipt.status === 1) {
        addNotification('success', `Successfully deposited ${amount} ETH`);
        if (onTransactionSuccess) onTransactionSuccess(); // Call callback
      } else {
        addNotification('error', 'Transaction failed');
      }

    } catch (error) {
      console.error('Error depositing ETH:', error);
      addNotification('error', `Failed to deposit ETH: ${(error as Error).message}`);
    } finally {
      setIsDepositing(false);
    }
  }, [exchangeContract, account, addNotification, onTransactionSuccess]);

  // Withdraw ETH
  const withdrawETH = useCallback(async (amount: string) => {
    if (!exchangeContract || !account) {
      addNotification('error', 'No contract or wallet connection available');
      return;
    }

    try {
      setIsWithdrawing(true);
      
      // Convert to Wei
      const ethAmount = ethers.parseEther(amount);
      
      // Call the contract
      const tx = await exchangeContract.withdrawETH(ethAmount);
      
      // Wait for confirmation
      // Use type assertion to handle ethers v6 typing issue with wait() method
      const receipt = await (tx as any).wait();
      
      if (receipt.status === 1) {
        addNotification('success', `Successfully withdrew ${amount} ETH`);
        if (onTransactionSuccess) onTransactionSuccess(); // Call callback
      } else {
        addNotification('error', 'Transaction failed');
      }

    } catch (error) {
      console.error('Error withdrawing ETH:', error);
      addNotification('error', `Failed to withdraw ETH: ${(error as Error).message}`);
    } finally {
      setIsWithdrawing(false);
    }
  }, [exchangeContract, account, addNotification, onTransactionSuccess]);

  // Deposit Token
  const depositToken = useCallback(async (amount: string) => {
    if (!exchangeContract || !tokenContract || !account) {
      addNotification('error', 'Contract or wallet connection missing');
      return;
    }

    try {
      setIsDepositing(true);
      
      // Convert to token units
      const tokenAmount = ethers.parseEther(amount);
      console.log("Depositing token:", {
        tokenAddress,
        tokenAmount: tokenAmount.toString(),
        amount,
        exchangeAddress: await exchangeContract.getAddress()
      });
      
      // First check allowance
      const allowance = await tokenContract.allowance(account, await exchangeContract.getAddress());
      console.log("Current allowance:", ethers.formatEther(allowance));
      
      // If allowance is insufficient, approve the exchange
      if (allowance < tokenAmount) {
        console.log("Setting approval for exchange");
        const approvalTx = await tokenContract.approve(await exchangeContract.getAddress(), tokenAmount);
        console.log("Approval transaction submitted:", approvalTx.hash);
        // Use type assertion to handle ethers v6 typing issue with wait() method
        const approvalReceipt = await (approvalTx as any).wait();
        console.log("Approval confirmed:", approvalReceipt);
        addNotification('success', 'Token approval successful');
      }

      // Now deposit the tokens
      console.log("Depositing tokens to exchange");
      const tx = await exchangeContract.depositToken(tokenAddress, tokenAmount, {
        gasLimit: 250000 // Explicit gas limit to avoid estimation errors
      });
      console.log("Deposit transaction submitted:", tx.hash);
      // Use type assertion to handle ethers v6 typing issue with wait() method
      const receipt = await (tx as any).wait();
      console.log("Deposit confirmed:", receipt);

      if (receipt.status === 1) {
        addNotification('success', `Successfully deposited ${amount} tokens to exchange`);
        if (onTransactionSuccess) onTransactionSuccess(); // Call callback
      } else {
        addNotification('error', 'Token deposit transaction failed');
      }
    } catch (error) {
      console.error('Error depositing token:', error);
      addNotification('error', `Failed to deposit token: ${(error as Error).message}`);
    } finally {
      setIsDepositing(false);
    }
  }, [exchangeContract, tokenContract, tokenAddress, account, addNotification, onTransactionSuccess]);

  // Withdraw Token
  const withdrawToken = useCallback(async (amount: string) => {
    if (!exchangeContract || !account) {
      addNotification('error', 'Contract or wallet connection missing');
      return;
    }
    try {
      setIsWithdrawing(true);
      const tokenAmount = ethers.parseUnits(amount, 18); // Assuming 18 decimals

      const tx = await exchangeContract.withdrawToken(tokenAddress, tokenAmount);
      // Use type assertion to handle ethers v6 typing issue with wait() method
      const receipt = await (tx as any).wait();

      if (receipt.status === 1) {
        addNotification('success', `Successfully withdrew ${amount} ${tokenAddress}`); // Assuming tokenAddress is symbol
        if (onTransactionSuccess) onTransactionSuccess(); // Call callback
      } else {
        addNotification('error', 'Token withdrawal transaction failed');
      }
    } catch (error) {
      console.error('Error withdrawing token:', error);
      addNotification('error', `Failed to withdraw token: ${(error as Error).message}`);
    } finally {
      setIsWithdrawing(false);
    }
  }, [exchangeContract, tokenAddress, account, addNotification, onTransactionSuccess]);

  return {
    depositETH,
    withdrawETH,
    depositToken,
    withdrawToken,
    isDepositing,
    isWithdrawing
  };
}
