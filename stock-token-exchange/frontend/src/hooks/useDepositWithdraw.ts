import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useNotificationContext } from '../contexts/NotificationContext';
import { useWalletContext } from '../contexts/WalletContext';

export function useDepositWithdraw(
  exchangeContract: ethers.Contract | null,
  tokenContract: ethers.Contract | null,
  tokenAddress: string
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
      exchangeContractAddress: exchangeContract?.address || 'N/A',
      signerFromContract: exchangeContract?.signer ? 'YES' : 'NO',
      providerFromContract: exchangeContract?.provider ? 'YES' : 'NO'
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
      const connectedContract = exchangeContract.connect(exchangeContract.signer);
      console.log("Connected contract:", {
        address: connectedContract.address,
        hasSigner: !!connectedContract.signer,
        signerAddress: await connectedContract.signer.getAddress()
      });
      
      // Convert to Wei
      const ethAmount = ethers.utils.parseEther(amount);
      console.log(`Depositing ${amount} ETH (${ethAmount.toString()} wei)`);
      
      // Call the contract with explicit gas limit and value
      const tx = await connectedContract.depositETH({ 
        value: ethAmount,
        gasLimit: 250000 // Explicit gas limit to avoid estimation errors
      });
      console.log("Transaction submitted:", tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);
      
      if (receipt.status === 1) {
        addNotification('success', `Successfully deposited ${amount} ETH`);
      } else {
        addNotification('error', 'Transaction failed');
      }

    } catch (error) {
      console.error('Error depositing ETH:', error);
      addNotification('error', `Failed to deposit ETH: ${(error as Error).message}`);
    } finally {
      setIsDepositing(false);
    }
  }, [exchangeContract, account, addNotification]);

  // Withdraw ETH
  const withdrawETH = useCallback(async (amount: string) => {
    if (!exchangeContract || !account) {
      addNotification('error', 'No contract or wallet connection available');
      return;
    }

    try {
      setIsWithdrawing(true);
      
      // Convert to Wei
      const ethAmount = ethers.utils.parseEther(amount);
      
      // Call the contract
      const tx = await exchangeContract.withdrawETH(ethAmount);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        addNotification('success', `Successfully withdrew ${amount} ETH`);
      } else {
        addNotification('error', 'Transaction failed');
      }

    } catch (error) {
      console.error('Error withdrawing ETH:', error);
      addNotification('error', `Failed to withdraw ETH: ${(error as Error).message}`);
    } finally {
      setIsWithdrawing(false);
    }
  }, [exchangeContract, account, addNotification]);

  // Deposit Token
  const depositToken = useCallback(async (amount: string) => {
    if (!exchangeContract || !tokenContract || !account) {
      addNotification('error', 'No contract or wallet connection available');
      return;
    }

    try {
      setIsDepositing(true);
      
      // Convert to token units
      const tokenAmount = ethers.utils.parseEther(amount);
      
      // First approve the exchange to spend tokens
      const approveTx = await tokenContract.approve(exchangeContract.address, tokenAmount);
      await approveTx.wait();
      
      // Now deposit the tokens
      const depositTx = await exchangeContract.depositToken(tokenAddress, tokenAmount);
      
      // Wait for confirmation
      const receipt = await depositTx.wait();
      
      if (receipt.status === 1) {
        addNotification('success', `Successfully deposited ${amount} tokens`);
      } else {
        addNotification('error', 'Transaction failed');
      }

    } catch (error) {
      console.error('Error depositing tokens:', error);
      addNotification('error', `Failed to deposit tokens: ${(error as Error).message}`);
    } finally {
      setIsDepositing(false);
    }
  }, [exchangeContract, tokenContract, account, tokenAddress, addNotification]);

  // Withdraw Token
  const withdrawToken = useCallback(async (amount: string) => {
    if (!exchangeContract || !account) {
      addNotification('error', 'No contract or wallet connection available');
      return;
    }

    try {
      setIsWithdrawing(true);
      
      // Convert to token units
      const tokenAmount = ethers.utils.parseEther(amount);
      
      // Call the contract
      const tx = await exchangeContract.withdrawToken(tokenAddress, tokenAmount);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        addNotification('success', `Successfully withdrew ${amount} tokens`);
      } else {
        addNotification('error', 'Transaction failed');
      }

    } catch (error) {
      console.error('Error withdrawing tokens:', error);
      addNotification('error', `Failed to withdraw tokens: ${(error as Error).message}`);
    } finally {
      setIsWithdrawing(false);
    }
  }, [exchangeContract, account, tokenAddress, addNotification]);

  return {
    depositETH,
    withdrawETH,
    depositToken,
    withdrawToken,
    isDepositing,
    isWithdrawing
  };
}
