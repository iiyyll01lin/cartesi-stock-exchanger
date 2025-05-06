// MetaMask service
import { CHAIN_CONFIG } from '../utils/constants';

/**
 * Add the Hardhat network to MetaMask
 */
export async function addHardhatNetworkToMetaMask(): Promise<boolean> {
  if (!window.ethereum) return false;
  
  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: CHAIN_CONFIG.chainIdHex,
          chainName: CHAIN_CONFIG.chainName,
          nativeCurrency: CHAIN_CONFIG.nativeCurrency,
          rpcUrls: CHAIN_CONFIG.rpcUrls,
          blockExplorerUrls: CHAIN_CONFIG.blockExplorerUrls
        }
      ]
    });
    return true;
  } catch (error: any) {
    console.error("Error adding Hardhat network to MetaMask:", error);
    return false;
  }
}

/**
 * Switch to the Hardhat network in MetaMask
 */
export async function switchToHardhatNetwork(): Promise<boolean> {
  try {
    const hardhatChainId = '0x7a69'; // Hex for 31337
    
    // Try to switch to the Hardhat chain
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hardhatChainId }],
    });
    
    console.log('Switched to Hardhat network');
    return true;
  } catch (error: any) {
    // This error code indicates that the chain has not been added to MetaMask
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: '0x7a69', // Hex for 31337
              chainName: 'Hardhat Local',
              rpcUrls: ['http://localhost:8545'],
              nativeCurrency: {
                name: 'Ethereum',
                symbol: 'ETH',
                decimals: 18
              },
            },
          ],
        });
        console.log('Added and switched to Hardhat network');
        return true;
      } catch (addError) {
        console.error('Error adding Hardhat network to MetaMask:', addError);
        return false;
      }
    }
    console.error('Error switching to Hardhat network:', error);
    return false;
  }
}

/**
 * Connect to MetaMask
 */
export async function connectToMetaMask(): Promise<string[]> {
  if (!window.ethereum) {
    throw new Error('MetaMask not detected');
  }

  try {
    // Request account access
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    
    // Get current chain ID
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    const decimalChainId = parseInt(chainId, 16);
    
    console.log(`Connected to MetaMask with chain ID: ${decimalChainId} (${chainId})`);
    
    // Check if we need to switch to Hardhat network
    if (decimalChainId !== 31337) {
      console.log('Switching to Hardhat network...');
      const switched = await switchToHardhatNetwork();
      if (switched) {
        console.log('Successfully switched to Hardhat network');
      }
    }
    
    return accounts;
  } catch (error) {
    console.error('Error connecting to MetaMask:', error);
    throw error;
  }
}

/**
 * Get the current chain ID from MetaMask
 */
export async function getChainId(): Promise<number> {
  if (!window.ethereum) {
    throw new Error("MetaMask not installed");
  }
  
  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    return parseInt(chainId, 16);
  } catch (error) {
    console.error("Error getting chain ID:", error);
    throw error;
  }
}

/**
 * Check if the correct network is selected in MetaMask
 */
export async function isCorrectNetwork(): Promise<boolean> {
  try {
    const chainId = await getChainId();
    return chainId === CHAIN_CONFIG.chainId;
  } catch (error) {
    return false;
  }
}
