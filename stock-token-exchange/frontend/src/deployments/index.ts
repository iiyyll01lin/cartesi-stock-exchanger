// This file is a placeholder until actual deployments are generated
// It will be overwritten by the export-deployments.ts script after contract deployment

// Contract addresses - default Hardhat addresses for development
export const EXCHANGE_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const STOCK_TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// Contract ABIs
export const EXCHANGE_ABI = [
  // Deposit/Withdraw functions
  "function depositETH() external payable",
  "function withdrawETH(uint256 _amount) external",
  "function depositToken(address _tokenAddress, uint256 _amount) external",
  "function withdrawToken(address _tokenAddress, uint256 _amount) external",
  // Balance view functions
  "function getUserEthBalance(address _user) external view returns (uint256)",
  "function getUserTokenBalance(address _user, address _tokenAddress) external view returns (uint256)",
  // Order functions
  "function placeOrder(address _tokenAddress, uint256 _amount, uint256 _price, bool _isBuyOrder) external returns (uint256)",
  "function cancelOrder(uint256 _orderId) external",
  "function getOrder(uint256 _orderId) external view returns (tuple(uint256,address,address,uint256,uint256,bool,bool))",
  // Events
  "event ETHDeposited(address indexed user, uint256 amount)",
  "event ETHWithdrawn(address indexed user, uint256 amount)",
  "event TokenDeposited(address indexed user, address indexed token, uint256 amount)",
  "event TokenWithdrawn(address indexed user, address indexed token, uint256 amount)",
  "event OrderPlaced(uint256 orderId, address indexed user, address indexed token, uint256 amount, uint256 price, bool isBuyOrder)",
  "event OrderCancelled(uint256 orderId)",
  "event OrderFilled(uint256 orderId)"
];

// Basic ERC20 ABI for StockToken
export const STOCK_TOKEN_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)"
];

// Network info
export const CONTRACT_CHAIN_ID = 31337; // Default Hardhat network chainId

export default {
  exchange: {
    address: EXCHANGE_ADDRESS,
    abi: EXCHANGE_ABI
  },
  stockToken: {
    address: STOCK_TOKEN_ADDRESS,
    abi: STOCK_TOKEN_ABI
  },
  chainId: CONTRACT_CHAIN_ID
};