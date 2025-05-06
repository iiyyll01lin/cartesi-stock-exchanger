// Custom hook to verify wallet status
import { useState, useEffect } from 'react';
import { useWalletContext } from '../contexts/WalletContext';
import { useContractContext } from '../contexts/ContractContext';

export function useWalletStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [isContractsLoaded, setIsContractsLoaded] = useState(false);
  const [hasSigner, setHasSigner] = useState(false);
  const [signedMessage, setSignedMessage] = useState('');
  
  const { account, provider, signer } = useWalletContext();
  const { exchangeContract, stockTokenContract, contractsValid } = useContractContext();

  useEffect(() => {
    // Check wallet connection status
    setIsConnected(!!account && !!provider);
    
    // Check if we have a signer
    setHasSigner(!!signer);
    
    // Check if contracts are properly loaded
    setIsContractsLoaded(!!exchangeContract && !!stockTokenContract && contractsValid);

    // Create status message for debugging
    const status = `
      Account: ${account ? 'Connected' : 'Not connected'}
      Provider: ${provider ? 'Available' : 'Missing'}
      Signer: ${signer ? 'Available' : 'Missing'}
      Exchange Contract: ${exchangeContract ? 'Loaded' : 'Not loaded'}
      Token Contract: ${stockTokenContract ? 'Loaded' : 'Not loaded'}
      Contracts Valid: ${contractsValid ? 'Yes' : 'No'}
    `;
    
    setSignedMessage(status);
    console.log('Wallet status:', status);
  }, [account, provider, signer, exchangeContract, stockTokenContract, contractsValid]);

  // Return wallet connection status
  return {
    isConnected,
    isContractsLoaded,
    hasSigner,
    signedMessage
  };
}
