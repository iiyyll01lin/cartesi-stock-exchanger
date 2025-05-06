// Blockchain-related types
import { ethers } from 'ethers';

export interface ContractAddresses {
  exchangeAddress: string;
  tokenAddress: string;
}

export interface ContractInstances {
  exchangeContract: ethers.Contract | null;
  tokenContract: ethers.Contract | null;
}

export interface TokenDetails {
  name: string;
  symbol: string;
  decimals: number;
}
