// Contracts hook
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { initializeContracts, validateContracts, getTokenDetails } from '../services/contracts';
import { useNotifications } from './useNotifications';
import { CONTRACT_ADDRESSES } from '../utils/constants';
import { EXCHANGE_ABI, STOCK_TOKEN_ABI } from '../deployments';

export function useContracts(provider: ethers.providers.Web3Provider | null, signer: ethers.Signer | null) {
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
        
        // Get current network for diagnostic info
        const network = await provider.getNetwork();
        console.log("Connected to network:", network);
        
        console.log("Contract addresses:", CONTRACT_ADDRESSES);
        console.log("Signer details:", {
          isSigner: signer instanceof ethers.Signer,
          hasAddress: signer ? (await signer.getAddress()).substring(0, 10) + '...' : 'N/A'
        });
        
        // Validate that contracts are deployed on this network
        const isValid = await validateContracts(provider);
        setContractsValid(isValid);
        
        if (!isValid) {
          console.error("Contracts not deployed at the specified addresses", CONTRACT_ADDRESSES);
          addNotification('error', 'Contracts not deployed at the specified addresses. Check if Hardhat node is running and if you are connected to the correct network.', false);
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
          exchange: exchangeContract.address,
          token: tokenContract.address
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
          addNotification('success', 'Contracts initialized successfully');
        }
      } catch (error: any) {
        console.error("Error initializing contracts:", error);
        addNotification('error', `Failed to initialize contracts: ${error.message}`, false);
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
