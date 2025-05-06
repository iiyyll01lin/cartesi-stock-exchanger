import React, { createContext, useContext, useMemo } from 'react';
import { ethers } from 'ethers';
import { useContracts } from '../hooks/useContracts';
import { useWalletContext } from './WalletContext';

interface ContractContextType {
  exchangeContract: ethers.Contract | null;
  stockTokenContract: ethers.Contract | null;
  tokenName: string;
  tokenSymbol: string;
  contractsValid: boolean;
  exchangeAddress: string;
  tokenAddress: string;
}

const ContractContext = createContext<ContractContextType>({
  exchangeContract: null,
  stockTokenContract: null,
  tokenName: "Stock Token",
  tokenSymbol: "STOCK",
  contractsValid: false,
  exchangeAddress: "",
  tokenAddress: ""
});

export const useContractContext = () => useContext(ContractContext);

export const ContractProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { provider, signer } = useWalletContext();
  
  const {
    exchangeContract,
    stockTokenContract,
    tokenName,
    tokenSymbol,
    contractsValid,
    exchangeAddress,
    tokenAddress
  } = useContracts(provider, signer);
  
  const value = useMemo(() => ({
    exchangeContract,
    stockTokenContract,
    tokenName,
    tokenSymbol,
    contractsValid,
    exchangeAddress,
    tokenAddress
  }), [
    exchangeContract,
    stockTokenContract,
    tokenName,
    tokenSymbol,
    contractsValid,
    exchangeAddress,
    tokenAddress
  ]);
  
  return (
    <ContractContext.Provider value={value}>
      {children}
    </ContractContext.Provider>
  );
};
