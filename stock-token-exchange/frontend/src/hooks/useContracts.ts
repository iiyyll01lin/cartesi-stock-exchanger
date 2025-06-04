// Contracts hook
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { initializeContracts, validateContracts, getTokenDetails } from '../services/contracts';
import { useNotifications } from './useNotifications';
import { CONTRACT_ADDRESSES } from '../utils/constants';
import { EXCHANGE_ABI, STOCK_TOKEN_ABI } from '../deployments';

export function useContracts(provider: ethers.BrowserProvider | null, signer: ethers.Signer | null) {
  const [exchangeContract, setExchangeContract] = useState<ethers.Contract | null>(null);
  const [stockTokenContract, setStockTokenContract] = useState<ethers.Contract | null>(null);
  const [tokenName, setTokenName] = useState<string>("Stock Token");
  const [tokenSymbol, setTokenSymbol] = useState<string>("STOCK");
  const [contractsValid, setContractsValid] = useState<boolean>(false);
  const { addNotification } = useNotifications();
  
  // Initialize contracts when signer changes
  useEffect(() => {
    if (!signer || !provider) {
      console.log("Cannot initialize contracts - missing signer or provider", { 
        hasSigner: !!signer, 
        hasProvider: !!provider,
        providerNetwork: provider ? 'checking...' : 'unknown'
      });
      return;
    }
    
    const init = async () => {
      try {
        console.log("Initializing contracts with provider and signer...");
        
        // Clear any stale block number caches by requesting the latest block number first
        try {
          const latestBlock = await provider.getBlockNumber();
          console.log(`Current blockchain latest block: ${latestBlock}`);
          
          // Force a small delay to ensure proper initialization
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (blockError) {
          console.warn("Error getting latest block during initialization:", blockError);
          // Continue despite error
        }
        
        // Get current network for diagnostic info
        const network = await provider.getNetwork();
        console.log("Connected to network:", network);
        
        // Validate that contracts are deployed on this network
        const isValid = await validateContracts(provider);
        setContractsValid(isValid);
        
        if (!isValid) {
          console.error("Contracts not deployed at the specified addresses on this network", CONTRACT_ADDRESSES);
          // Don't show repetitive notifications - UI already indicates network mismatch
          // Use default values for token details when on the wrong network
          setTokenName("Stock Token");
          setTokenSymbol("STOCK");
          return;
        }
        
        // Initialize contracts with current signer
        console.log("Initializing contracts with signer...");
        const exchangeContract = new ethers.Contract(
          CONTRACT_ADDRESSES.exchange, 
          EXCHANGE_ABI,
          signer
        );
        
        const tokenContract = new ethers.Contract(
          CONTRACT_ADDRESSES.token,
          STOCK_TOKEN_ABI,
          signer
        );
        
        console.log("Contracts initialized with addresses:", {
          exchange: exchangeContract.target,
          token: tokenContract.target
        });
        
        // Set the contract instances
        setExchangeContract(exchangeContract);
        setStockTokenContract(tokenContract);
        
        // Get token details
        const details = await getTokenDetails(tokenContract);
        if (details) {
          setTokenName(details.name);
          setTokenSymbol(details.symbol);
          console.log("Token details:", details);
          // Don't show notification for every contract initialization
        }
      } catch (error: any) {
        console.error("Error initializing contracts:", error);
        // Only show critical errors to avoid notification spam
        if (error.message.includes("contract not deployed") || 
            error.message.includes("invalid address")) {
          addNotification('error', `Failed to initialize contracts: ${error.message}`, false);
        }
      }
    };
    
    init();
  }, [signer, provider, addNotification]);
  
  return {
    exchangeContract,
    stockTokenContract,
    tokenName,
    tokenSymbol,
    contractsValid,
    exchangeAddress: CONTRACT_ADDRESSES.exchange,
    tokenAddress: CONTRACT_ADDRESSES.token
  };
}
