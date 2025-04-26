import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import './App.css';

// Import contract deployment information
import {
  EXCHANGE_ADDRESS,
  STOCK_TOKEN_ADDRESS,
  EXCHANGE_ABI,
  STOCK_TOKEN_ABI,
  CONTRACT_CHAIN_ID
} from './deployments';

// --- Types ---
declare global {
    interface Window {
        ethereum?: any; // Basic type for MetaMask provider
    }
}

interface Order {
    id: number;
    user: string;
    token: string;
    amount: number;
    price: number;
    isBuyOrder: boolean;
    active: boolean;
}

interface Transaction {
    id: string;
    hash: string;
    type: 'deposit' | 'withdraw' | 'order' | 'cancel';
    amount?: string;
    token?: string;
    status: 'pending' | 'success' | 'failed';
    timestamp: number;
    message?: string;
}

interface Notification {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: number;
    autoClose?: boolean;
}

// Enhanced tooltip interface
interface TooltipProps {
    text: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

// Tooltip component
const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top' }) => {
    return (
        <div className="tooltip-container">
            {children}
            <div className={`tooltip tooltip-${position}`}>
                {text}
            </div>
        </div>
    );
};

// Global error handling function
const handleError = (error: any, context: string): string => {
    console.error(`Error in ${context}:`, error);
    
    // Check error type and provide appropriate error message
    if (!error) return "Unknown error occurred";

    // Network connection error
    if (error.message && (
        error.message.includes('network') || 
        error.message.includes('connection') ||
        error.message.includes('disconnected')
    )) {
        return `Network connection error: ${error.message}`;
    }

    // MetaMask operation rejected by user
    if (error.code === 4001 || 
        (error.message && error.message.includes('user rejected'))) {
        return "Operation cancelled by user";
    }

    // Contract interaction error
    if (error.message && (
        error.message.includes('contract') || 
        error.message.includes('execution reverted')
    )) {
        // Extract useful information from contract error message
        const revertReason = error.data?.message || 
                            (error.message.match(/reverted with reason string '(.+?)'/) || [])[1];
        if (revertReason) return `Contract error: ${revertReason}`;
        
        return `Contract execution failed: ${error.message}`;
    }

    // Insufficient balance
    if (error.message && (
        error.message.includes('insufficient') || 
        error.message.includes('enough') ||
        error.message.includes('balance')
    )) {
        return "Insufficient balance to complete the transaction";
    }

    // Gas related error
    if (error.message && (
        error.message.includes('gas') || 
        error.message.includes('fee')
    )) {
        return `Gas fee related error: ${error.message}`;
    }

    // Attempt to parse JSON error message
    if (typeof error === 'string') {
        try {
            const jsonError = JSON.parse(error);
            return jsonError.message || jsonError.error || error;
        } catch { /* Ignore parsing error */ }
    }

    // Return original error message or a generic error message
    return error.message || error.reason || error.error || "Unknown error occurred during operation";
};

function App() {
    // --- State Management ---
    const [account, setAccount] = useState<string | null>(null);
    const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);
    const [exchangeContract, setExchangeContract] = useState<ethers.Contract | null>(null);
    const [stockTokenContract, setStockTokenContract] = useState<ethers.Contract | null>(null);
    const [tokenName, setTokenName] = useState<string>("Stock Token");
    const [tokenSymbol, setTokenSymbol] = useState<string>("STOCK");

    // UI State
    const [message, setMessage] = useState<string>('Connect your wallet to start.');
    const [chainId, setChainId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [networkWarning, setNetworkWarning] = useState<boolean>(false);

    // Balances
    const [ethBalance, setEthBalance] = useState<string>("0");
    const [tokenBalance, setTokenBalance] = useState<string>("0");
    const [exchangeEthBalance, setExchangeEthBalance] = useState<string>("0");
    const [exchangeTokenBalance, setExchangeTokenBalance] = useState<string>("0");
    const [orders, setOrders] = useState<Order[]>([]);
    
    // Order Filtering
    const [orderFilter, setOrderFilter] = useState<'all' | 'buy' | 'sell'>('all');
    const [showMyOrdersOnly, setShowMyOrdersOnly] = useState<boolean>(false);
    
    // Form states with validation
    const [depositAmount, setDepositAmount] = useState<string>("");
    const [depositAmountError, setDepositAmountError] = useState<string | null>(null);
    const [withdrawAmount, setWithdrawAmount] = useState<string>("");
    const [withdrawAmountError, setWithdrawAmountError] = useState<string | null>(null);
    const [orderAmount, setOrderAmount] = useState<string>("");
    const [orderAmountError, setOrderAmountError] = useState<string | null>(null);
    const [orderPrice, setOrderPrice] = useState<string>("");
    const [orderPriceError, setOrderPriceError] = useState<string | null>(null);
    const [transactionHash, setTransactionHash] = useState<string | null>(null);

    // --- Theme Management ---
    useEffect(() => {
        // Check for saved theme preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            setIsDarkMode(true);
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }, []);

    const toggleTheme = () => {
        if (isDarkMode) {
            setIsDarkMode(false);
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            setIsDarkMode(true);
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    };

    // --- Notification Management ---
    const addNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string, autoClose: boolean = true) => {
        const newNotification: Notification = {
            id: Date.now().toString(),
            type,
            message,
            timestamp: Date.now(),
            autoClose
        };
        setNotifications(prev => [newNotification, ...prev]);
        
        // Auto-close notification after 5 seconds if autoClose is true
        if (autoClose) {
            setTimeout(() => {
                setNotifications(prevNotifications => 
                    prevNotifications.filter(notification => notification.id !== newNotification.id)
                );
            }, 5000);
        }
    };

    const removeNotification = (id: string) => {
        setNotifications(prev => prev.filter(notification => notification.id !== id));
    };

    // --- Transaction History Management ---
    const addTransaction = (hash: string, type: 'deposit' | 'withdraw' | 'order' | 'cancel', amount?: string, token?: string) => {
        const newTransaction: Transaction = {
            id: Date.now().toString(),
            hash,
            type,
            amount,
            token,
            status: 'pending',
            timestamp: Date.now()
        };
        setTransactions(prev => [newTransaction, ...prev]);
        return newTransaction.id;
    };

    const updateTransaction = (id: string, status: 'pending' | 'success' | 'failed', message?: string) => {
        setTransactions(prev => prev.map(tx => 
            tx.id === id 
                ? { ...tx, status, message } 
                : tx
        ));
    };

    // --- Input Validation ---
    const validateAmount = (amount: string, max?: string): string | null => {
        if (!amount) return "Amount is required";
        if (isNaN(Number(amount))) return "Must be a valid number";
        if (Number(amount) <= 0) return "Amount must be greater than 0";
        if (max && Number(amount) > Number(max)) return `Amount exceeds balance (${max})`;
        return null;
    };

    // --- Wallet Connection ---
    const connectWallet = useCallback(async () => {
        if (!window.ethereum) {
            addNotification('error', 'MetaMask not detected. Please install MetaMask.', false);
            setMessage('MetaMask not detected. Please install MetaMask.');
            return;
        }

        try {
            setIsLoading(true);
            // Request account access
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts.length > 0) {
                const currentAccount = accounts[0];
                setAccount(currentAccount);
                setMessage(`Wallet connected: ${currentAccount.substring(0, 6)}...`);
                addNotification('success', `Wallet connected: ${currentAccount.substring(0, 6)}...${currentAccount.substring(currentAccount.length - 4)}`);

                // Initialize Ethers
                const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
                setProvider(web3Provider);
                const currentSigner = web3Provider.getSigner();
                setSigner(currentSigner);

                // Initialize Contracts
                const exchange = new ethers.Contract(EXCHANGE_ADDRESS, EXCHANGE_ABI, currentSigner);
                setExchangeContract(exchange);
                const token = new ethers.Contract(STOCK_TOKEN_ADDRESS, STOCK_TOKEN_ABI, currentSigner);
                setStockTokenContract(token);

                // Get Network
                const networkId = await window.ethereum.request({ method: 'net_version' });
                setChainId(networkId);

                // Check if on the correct network
                if (networkId !== CONTRACT_CHAIN_ID) {
                    setNetworkWarning(true);
                    addNotification('warning', `You are on network ${networkId}, but the contracts are deployed on ${CONTRACT_CHAIN_ID}. Some features may not work.`, false);
                } else {
                    setNetworkWarning(false);
                }

                // Get token details
                try {
                    const name = await token.name();
                    const symbol = await token.symbol();
                    setTokenName(name);
                    setTokenSymbol(symbol);
                } catch (error) {
                    console.error("Error fetching token details:", error);
                    addNotification('warning', 'Could not fetch token details. Using defaults.');
                }

                // Fetch balances and orders
                await fetchBalances(currentAccount, token, exchange);
                await fetchOrders();
            } else {
                setMessage('No accounts found. Please unlock MetaMask.');
                addNotification('warning', 'No accounts found. Please unlock MetaMask.');
            }
        } catch (error: any) {
            console.error("Error connecting wallet:", error);
            setMessage(`Failed to connect wallet: ${error.message}`);
            addNotification('error', `Failed to connect wallet: ${error.message}`, false);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // --- Event Handlers ---
    const handleAccountsChanged = useCallback((accounts: string[]) => {
        if (accounts.length === 0) {
            console.log('Please connect to MetaMask.');
            setAccount(null);
            setSigner(null);
            setExchangeContract(null);
            setStockTokenContract(null);
            setMessage('Wallet disconnected.');
            addNotification('info', 'Wallet disconnected.');
        } else if (accounts[0] !== account) {
            setAccount(accounts[0]);
            setMessage(`Account changed: ${accounts[0].substring(0, 6)}...`);
            addNotification('info', `Account changed: ${accounts[0].substring(0, 6)}...${accounts[0].substring(accounts[0].length - 4)}`);
            
            // Re-initialize signer and contracts
            if (provider) {
                const currentSigner = provider.getSigner();
                setSigner(currentSigner);
                
                // Reinitialize contracts with new signer
                const exchange = new ethers.Contract(EXCHANGE_ADDRESS, EXCHANGE_ABI, currentSigner);
                setExchangeContract(exchange);
                const token = new ethers.Contract(STOCK_TOKEN_ADDRESS, STOCK_TOKEN_ABI, currentSigner);
                setStockTokenContract(token);
                
                // Re-fetch data for new account
                fetchBalances(accounts[0], token, exchange);
                fetchOrders();
            }
        }
    }, [account, provider]);

    const handleChainChanged = useCallback((newChainId: string) => {
        console.log("Network changed to:", newChainId);
        setChainId(newChainId);
        
        // Check if on the correct network
        if (newChainId !== CONTRACT_CHAIN_ID) {
            setNetworkWarning(true);
            addNotification('warning', `You are on network ${newChainId}, but the contracts are deployed on ${CONTRACT_CHAIN_ID}. Some features may not work.`, false);
        } else {
            setNetworkWarning(false);
            addNotification('success', 'Connected to the correct network.');
        }
        
        // Reload the page on chain change as recommended by MetaMask
        window.location.reload();
    }, [CONTRACT_CHAIN_ID]);

    // --- Setup Event Listeners ---
    useEffect(() => {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);

            // Cleanup function
            return () => {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
                window.ethereum.removeListener('chainChanged', handleChainChanged);
            };
        }
    }, [handleAccountsChanged, handleChainChanged]);

    // --- Data Fetching ---
    const fetchBalances = async (
        userAddress: string, 
        tokenContract: ethers.Contract, 
        exchangeContract: ethers.Contract
    ) => {
        try {
            setIsLoading(true);
            // Get wallet balances
            if (provider) {
                const ethWalletBalance = await provider.getBalance(userAddress);
                setEthBalance(ethers.utils.formatEther(ethWalletBalance));
            }
            
            const tokenWalletBalance = await tokenContract.balanceOf(userAddress);
            setTokenBalance(ethers.utils.formatEther(tokenWalletBalance));
            
            // Get exchange deposit balances
            const ethExchangeBalance = await exchangeContract.getUserEthBalance(userAddress);
            setExchangeEthBalance(ethers.utils.formatEther(ethExchangeBalance));
            
            const tokenExchangeBalance = await exchangeContract.getUserTokenBalance(
                userAddress,
                STOCK_TOKEN_ADDRESS
            );
            setExchangeTokenBalance(ethers.utils.formatEther(tokenExchangeBalance));
            
            console.log("Balances fetched successfully");
            addNotification('success', 'Balances updated successfully');
        } catch (error: any) {
            console.error("Error fetching balances:", error);
            setMessage("Failed to fetch balances.");
            addNotification('error', `Failed to fetch balances: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchOrders = async () => {
        try {
            setIsLoading(true);
            // First try to fetch from the blockchain
            if (exchangeContract && account) {
                await fetchBlockchainOrders();
            } else {
                // Fallback: Fetch orders from the backend API
                await fetchMockOrders();
            }
        } catch (error: any) {
            console.error("Error fetching orders:", error);
            setMessage("Failed to fetch orders. Using backend API.");
            addNotification('warning', 'Failed to fetch blockchain orders. Using API fallback.');
            await fetchMockOrders();
        } finally {
            setIsLoading(false);
        }
    };

    const fetchMockOrders = async () => {
        try {
            // Fetch orders from the backend API
            const response = await fetch('http://localhost:5001/orders');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data: Order[] = await response.json();
            setOrders(data);
            console.log("Fetched orders:", data);
            addNotification('info', `Fetched ${data.length} orders from API`);
        } catch (error: any) {
            console.error("Failed to fetch orders from backend:", error);
            setMessage("Failed to fetch orders from backend.");
            addNotification('error', `Failed to fetch orders from backend: ${error.message}`);
        }
    };

    // --- Contract Interaction Functions ---
    
    // ETH Deposit
    const handleDepositEth = async () => {
        // Validate input
        const error = validateAmount(depositAmount, ethBalance);
        setDepositAmountError(error);
        if (error) return;

        if (!signer || !exchangeContract) {
            addNotification('error', 'Please connect your wallet first.');
            return;
        }

        try {
            setIsLoading(true);
            setMessage("Depositing ETH...");
            addNotification('info', `Preparing to deposit ${depositAmount} ETH...`);
            
            // Convert eth amount to wei
            const amountInWei = ethers.utils.parseEther(depositAmount);
            
            // Call the deposit function with value
            const tx = await exchangeContract.depositETH({ value: amountInWei });
            setTransactionHash(tx.hash);
            
            // Add to transaction history
            const txId = addTransaction(tx.hash, 'deposit', depositAmount, 'ETH');
            
            setMessage(`Deposit transaction sent! Hash: ${tx.hash.substring(0, 10)}...`);
            addNotification('info', `Deposit transaction sent! Waiting for confirmation...`);
            
            // Wait for transaction to be mined
            await tx.wait();
            updateTransaction(txId, 'success');
            setMessage("ETH deposited successfully!");
            addNotification('success', `Successfully deposited ${depositAmount} ETH`);
            
            // Clear input and refresh balances
            setDepositAmount("");
            if (account && stockTokenContract && exchangeContract) {
                await fetchBalances(account, stockTokenContract, exchangeContract);
            }
        } catch (error: any) {
            console.error("Error depositing ETH:", error);
            
            // Determine if user rejected transaction
            if (error.code === 4001 || error.message.includes('user rejected')) {
                setMessage('Transaction was rejected by user.');
                addNotification('warning', 'ETH deposit cancelled by user');
            } else {
                setMessage(`Error depositing ETH: ${error.message}`);
                addNotification('error', `Failed to deposit ETH: ${error.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    // ETH Withdraw
    const handleWithdrawEth = async () => {
        // Validate input
        const error = validateAmount(withdrawAmount, exchangeEthBalance);
        setWithdrawAmountError(error);
        if (error) return;

        if (!signer || !exchangeContract) {
            addNotification('error', 'Please connect your wallet first.');
            return;
        }

        try {
            setIsLoading(true);
            setMessage("Withdrawing ETH...");
            addNotification('info', `Preparing to withdraw ${withdrawAmount} ETH...`);
            
            // Convert eth amount to wei
            const amountInWei = ethers.utils.parseEther(withdrawAmount);
            
            // Call the withdraw function
            const tx = await exchangeContract.withdrawETH(amountInWei);
            setTransactionHash(tx.hash);
            
            // Add to transaction history
            const txId = addTransaction(tx.hash, 'withdraw', withdrawAmount, 'ETH');
            
            setMessage(`Withdraw transaction sent! Hash: ${tx.hash.substring(0, 10)}...`);
            addNotification('info', `Withdraw transaction sent! Waiting for confirmation...`);
            
            // Wait for transaction to be mined
            await tx.wait();
            updateTransaction(txId, 'success');
            setMessage("ETH withdrawn successfully!");
            addNotification('success', `Successfully withdrew ${withdrawAmount} ETH`);
            
            // Clear input and refresh balances
            setWithdrawAmount("");
            if (account && stockTokenContract && exchangeContract) {
                await fetchBalances(account, stockTokenContract, exchangeContract);
            }
        } catch (error: any) {
            console.error("Error withdrawing ETH:", error);
            
            // Determine if user rejected transaction
            if (error.code === 4001 || error.message.includes('user rejected')) {
                setMessage('Transaction was rejected by user.');
                addNotification('warning', 'ETH withdrawal cancelled by user');
            } else {
                setMessage(`Error withdrawing ETH: ${error.message}`);
                addNotification('error', `Failed to withdraw ETH: ${error.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    // Token Deposit
    const handleDepositToken = async () => {
        // Validate input
        const error = validateAmount(depositAmount, tokenBalance);
        setDepositAmountError(error);
        if (error) return;

        if (!signer || !exchangeContract || !stockTokenContract) {
            addNotification('error', 'Please connect your wallet first.');
            return;
        }

        try {
            setIsLoading(true);
            setMessage("Approving and depositing tokens...");
            addNotification('info', `Preparing to deposit ${depositAmount} ${tokenSymbol}...`);
            
            // Convert token amount to wei
            const amountInWei = ethers.utils.parseEther(depositAmount);
            
            // First approve the exchange to spend tokens
            const approveTx = await stockTokenContract.approve(EXCHANGE_ADDRESS, amountInWei);
            setTransactionHash(approveTx.hash);
            
            // Add approval to transaction history
            const approvalTxId = addTransaction(approveTx.hash, 'deposit', depositAmount, tokenSymbol);
            
            setMessage(`Approval transaction sent! Hash: ${approveTx.hash.substring(0, 10)}...`);
            addNotification('info', `Approval transaction sent! Waiting for confirmation...`);
            
            // Wait for approval to be mined
            await approveTx.wait();
            updateTransaction(approvalTxId, 'success', 'Token approval successful');
            setMessage("Approval successful! Now depositing tokens...");
            addNotification('success', 'Token approval successful. Now depositing tokens...');
            
            // Now deposit tokens
            const depositTx = await exchangeContract.depositToken(STOCK_TOKEN_ADDRESS, amountInWei);
            setTransactionHash(depositTx.hash);
            
            // Add deposit to transaction history
            const depositTxId = addTransaction(depositTx.hash, 'deposit', depositAmount, tokenSymbol);
            
            setMessage(`Deposit transaction sent! Hash: ${depositTx.hash.substring(0, 10)}...`);
            addNotification('info', `Deposit transaction sent! Waiting for confirmation...`);
            
            // Wait for deposit to be mined
            await depositTx.wait();
            updateTransaction(depositTxId, 'success');
            setMessage("Tokens deposited successfully!");
            addNotification('success', `Successfully deposited ${depositAmount} ${tokenSymbol}`);
            
            // Clear input and refresh balances
            setDepositAmount("");
            if (account && stockTokenContract && exchangeContract) {
                await fetchBalances(account, stockTokenContract, exchangeContract);
            }
        } catch (error: any) {
            console.error("Error depositing tokens:", error);
            
            // Determine if user rejected transaction
            if (error.code === 4001 || error.message.includes('user rejected')) {
                setMessage('Transaction was rejected by user.');
                addNotification('warning', 'Token deposit cancelled by user');
            } else {
                setMessage(`Error depositing tokens: ${error.message}`);
                addNotification('error', `Failed to deposit tokens: ${error.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    // Token Withdraw
    const handleWithdrawToken = async () => {
        // Validate input
        const error = validateAmount(withdrawAmount, exchangeTokenBalance);
        setWithdrawAmountError(error);
        if (error) return;

        if (!signer || !exchangeContract) {
            addNotification('error', 'Please connect your wallet first.');
            return;
        }

        try {
            setIsLoading(true);
            setMessage("Withdrawing tokens...");
            addNotification('info', `Preparing to withdraw ${withdrawAmount} ${tokenSymbol}...`);
            
            // Convert token amount to wei
            const amountInWei = ethers.utils.parseEther(withdrawAmount);
            
            // Call the withdraw function
            const tx = await exchangeContract.withdrawToken(STOCK_TOKEN_ADDRESS, amountInWei);
            setTransactionHash(tx.hash);
            
            // Add to transaction history
            const txId = addTransaction(tx.hash, 'withdraw', withdrawAmount, tokenSymbol);
            
            setMessage(`Withdraw transaction sent! Hash: ${tx.hash.substring(0, 10)}...`);
            addNotification('info', `Withdraw transaction sent! Waiting for confirmation...`);
            
            // Wait for transaction to be mined
            await tx.wait();
            updateTransaction(txId, 'success');
            setMessage("Tokens withdrawn successfully!");
            addNotification('success', `Successfully withdrew ${withdrawAmount} ${tokenSymbol}`);
            
            // Clear input and refresh balances
            setWithdrawAmount("");
            if (account && stockTokenContract && exchangeContract) {
                await fetchBalances(account, stockTokenContract, exchangeContract);
            }
        } catch (error: any) {
            console.error("Error withdrawing tokens:", error);
            
            // Determine if user rejected transaction
            if (error.code === 4001 || error.message.includes('user rejected')) {
                setMessage('Transaction was rejected by user.');
                addNotification('warning', 'Token withdrawal cancelled by user');
            } else {
                setMessage(`Error withdrawing tokens: ${error.message}`);
                addNotification('error', `Failed to withdraw tokens: ${error.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Place Order via Contract
    const handlePlaceOrder = async (isBuyOrder: boolean) => {
        // Validate inputs
        const amountError = validateAmount(orderAmount);
        setOrderAmountError(amountError);
        
        const priceError = validateAmount(orderPrice);
        setOrderPriceError(priceError);
        
        if (amountError || priceError) return;

        if (!signer || !exchangeContract || !stockTokenContract) {
            addNotification('error', 'Please connect your wallet first.');
            return;
        }

        try {
            setIsLoading(true);
            setMessage(`Preparing to place ${isBuyOrder ? 'buy' : 'sell'} order...`);
            addNotification('info', `Preparing to place ${isBuyOrder ? 'buy' : 'sell'} order for ${orderAmount} ${tokenSymbol} at ${orderPrice} ETH each...`);
            
            // Convert values to appropriate format for the contract
            const amountInWei = ethers.utils.parseEther(orderAmount);
            const priceInWei = ethers.utils.parseEther(orderPrice);
            
            // If it's a sell order, need to ensure token approval (just like in deposit)
            if (!isBuyOrder) {
                setMessage("Approving token usage for sell order...");
                addNotification('info', 'Approving token usage for sell order...');
                
                // Calculate total required allowance
                const totalRequired = amountInWei;
                
                // Check current allowance
                const currentAllowance = await stockTokenContract.allowance(account, EXCHANGE_ADDRESS);
                
                // Only approve if needed
                if (currentAllowance.lt(totalRequired)) {
                    const approveTx = await stockTokenContract.approve(EXCHANGE_ADDRESS, totalRequired);
                    setTransactionHash(approveTx.hash);
                    
                    // Add approval to transaction history
                    const approvalTxId = addTransaction(
                        approveTx.hash, 
                        'order', 
                        orderAmount, 
                        tokenSymbol
                    );
                    
                    setMessage(`Approval transaction sent! Hash: ${approveTx.hash.substring(0, 10)}...`);
                    addNotification('info', `Approval transaction sent! Waiting for confirmation...`);
                    
                    // Wait for approval to be mined
                    await approveTx.wait();
                    updateTransaction(approvalTxId, 'success', 'Token approval successful');
                    setMessage("Token approval successful! Now placing order...");
                    addNotification('success', 'Token approval successful. Now placing order...');
                }
            }
            
            // Call the placeOrder function
            const tx = await exchangeContract.placeOrder(
                STOCK_TOKEN_ADDRESS, 
                amountInWei, 
                priceInWei, 
                isBuyOrder
            );
            
            setTransactionHash(tx.hash);
            
            // Add order to transaction history
            const orderTxId = addTransaction(
                tx.hash, 
                'order', 
                orderAmount, 
                tokenSymbol
            );
            
            setMessage(`Order transaction sent! Hash: ${tx.hash.substring(0, 10)}...`);
            addNotification('info', `Order transaction sent! Waiting for confirmation...`);
            
            // Wait for transaction to be mined
            const receipt = await tx.wait();
            
            // Try to extract the order ID from the event logs
            let orderId;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = exchangeContract.interface.parseLog(log);
                    if (parsedLog.name === "OrderPlaced") {
                        orderId = parsedLog.args.orderId.toString();
                        break;
                    }
                } catch (e) {
                    // Skip logs that can't be parsed
                    continue;
                }
            }
            
            updateTransaction(orderTxId, 'success', `Order #${orderId || 'unknown'} placed successfully`);
            setMessage(`Order placed successfully!${orderId ? ` Order ID: ${orderId}` : ''}`);
            addNotification('success', `${isBuyOrder ? 'Buy' : 'Sell'} order placed successfully!${orderId ? ` Order ID: ${orderId}` : ''}`);
            
            // Clear inputs and refresh data
            setOrderAmount("");
            setOrderPrice("");
            
            // Refresh balances and orders
            if (account && stockTokenContract && exchangeContract) {
                await fetchBalances(account, stockTokenContract, exchangeContract);
                await fetchOrders();
            }
        } catch (error: any) {
            console.error("Error placing order:", error);
            
            // Determine if user rejected transaction
            if (error.code === 4001 || error.message.includes('user rejected')) {
                setMessage('Transaction was rejected by user.');
                addNotification('warning', 'Order placement cancelled by user');
            } else {
                setMessage(`Error placing order: ${error.message}`);
                addNotification('error', `Failed to place order: ${error.message}`);
                
                // Fallback to mock order placement
                setMessage("Error with blockchain order. Trying with mock API...");
                addNotification('warning', 'Attempting to place order via mock API...');
                try {
                    await handleMockPlaceOrder(isBuyOrder);
                } catch (mockError: any) {
                    setMessage(`Failed to place order via any method: ${mockError.message}`);
                    addNotification('error', `Failed to place order via any method: ${mockError.message}`);
                }
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Cancel Order via Contract
    const handleCancelOrder = async (orderId: number) => {
        if (!signer || !exchangeContract) {
            addNotification('error', 'Please connect your wallet first.');
            return;
        }

        try {
            setIsLoading(true);
            setMessage(`Cancelling order #${orderId}...`);
            addNotification('info', `Preparing to cancel order #${orderId}...`);
            
            // Call the cancelOrder function
            const tx = await exchangeContract.cancelOrder(orderId);
            setTransactionHash(tx.hash);
            
            // Add to transaction history
            const txId = addTransaction(tx.hash, 'cancel');
            
            setMessage(`Cancel transaction sent! Hash: ${tx.hash.substring(0, 10)}...`);
            addNotification('info', `Cancel transaction sent! Waiting for confirmation...`);
            
            // Wait for transaction to be mined
            await tx.wait();
            updateTransaction(txId, 'success', `Order #${orderId} cancelled successfully`);
            setMessage(`Order #${orderId} cancelled successfully!`);
            addNotification('success', `Order #${orderId} cancelled successfully!`);
            
            // Refresh balances and orders
            if (account && stockTokenContract && exchangeContract) {
                await fetchBalances(account, stockTokenContract, exchangeContract);
                await fetchOrders();
            }
        } catch (error: any) {
            console.error("Error cancelling order:", error);
            
            // Determine if user rejected transaction
            if (error.code === 4001 || error.message.includes('user rejected')) {
                setMessage('Transaction was rejected by user.');
                addNotification('warning', 'Order cancellation cancelled by user');
            } else {
                setMessage(`Error cancelling order: ${error.message}`);
                addNotification('error', `Failed to cancel order: ${error.message}`);
                
                // Fallback to mock cancel if available
                setMessage("Error with blockchain cancel. Trying with mock API...");
                addNotification('warning', 'Attempting to cancel order via mock API...');
                // Implement mock cancel endpoint if needed
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch orders from blockchain
    const fetchBlockchainOrders = async () => {
        if (!exchangeContract || !account) return;
        
        try {
            setIsLoading(true);
            // This is a simplified approach - in a real application, you would:
            // 1. Listen for OrderPlaced, OrderCancelled, and OrderFilled events
            // 2. Index them in a database or local storage
            // 3. Query for the user's orders or all active orders
            
            // For now, we'll use the existing event filtering capabilities
            // of ethers.js to get recent OrderPlaced events

            setMessage("Fetching blockchain orders...");
            addNotification('info', 'Fetching order data from blockchain...');
            
            // Create a filter for OrderPlaced events
            const placedFilter = exchangeContract.filters.OrderPlaced();
            // Create a filter for OrderCancelled events
            const cancelledFilter = exchangeContract.filters.OrderCancelled();
            // Create a filter for OrderFilled events 
            const filledFilter = exchangeContract.filters.OrderFilled();
            
            // Fetch recent events (adjust the block range as needed)
            const placedEvents = await exchangeContract.queryFilter(placedFilter, -5000);
            const cancelledEvents = await exchangeContract.queryFilter(cancelledFilter, -5000);
            const filledEvents = await exchangeContract.queryFilter(filledFilter, -5000);
            
            // Track cancelled and filled order IDs
            const cancelledOrderIds = new Set(
                cancelledEvents.map(event => event.args?.orderId.toString())
            );
            const filledOrderIds = new Set(
                filledEvents.map(event => event.args?.orderId.toString())
            );
            
            // Process each OrderPlaced event
            const blockchainOrders: Order[] = [];
            
            for (const event of placedEvents) {
                const orderId = event.args?.orderId.toString();
                
                // Skip if the order was cancelled or filled
                if (cancelledOrderIds.has(orderId) || filledOrderIds.has(orderId)) {
                    continue;
                }
                
                try {
                    // Fetch full order details from the contract
                    const orderDetails = await exchangeContract.getOrder(orderId);
                    
                    // Check if order is active
                    if (!orderDetails[6]) { // active is the 7th field in the Order struct
                        continue;
                    }
                    
                    // Format the order for the UI
                    blockchainOrders.push({
                        id: Number(orderId),
                        user: orderDetails[1], // user address
                        token: orderDetails[2], // token address
                        amount: Number(ethers.utils.formatEther(orderDetails[3])), // amount
                        price: Number(ethers.utils.formatEther(orderDetails[4])), // price
                        isBuyOrder: orderDetails[5], // isBuyOrder
                        active: orderDetails[6] // active
                    });
                } catch (error) {
                    console.error(`Error fetching order #${orderId}:`, error);
                }
            }
            
            console.log("Blockchain orders:", blockchainOrders);
            
            // Update the orders state
            if (blockchainOrders.length > 0) {
                setOrders(blockchainOrders);
                setMessage(`Found ${blockchainOrders.length} active orders on blockchain.`);
                addNotification('success', `Found ${blockchainOrders.length} active orders on blockchain.`);
            } else {
                // If no blockchain orders found, use mock API as fallback
                setMessage("No blockchain orders found. Using mock API...");
                addNotification('info', 'No blockchain orders found. Using mock API...');
                await fetchMockOrders();
            }
        } catch (error: any) {
            console.error("Error fetching blockchain orders:", error);
            setMessage(`Error fetching blockchain orders: ${error.message}`);
            addNotification('error', `Error fetching blockchain orders: ${error.message}`);
            
            // Fallback to mock orders
            await fetchMockOrders();
        } finally {
            setIsLoading(false);
        }
    };

    const handleMockPlaceOrder = async (isBuyOrder: boolean) => {
        if (!account || !orderAmount || !orderPrice) {
            addNotification('error', 'Please connect wallet and fill order details.');
            return;
        }
        setMessage("Submitting mock order...");
        try {
            const response = await fetch('http://localhost:5001/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user: account, // Send connected account as user
                    token: STOCK_TOKEN_ADDRESS, // Use mock token address
                    amount: orderAmount,
                    price: orderPrice,
                    isBuyOrder: isBuyOrder
                })
            });
            const result = await response.json();
            if (response.ok) {
                setMessage(`Mock order submitted: ID ${result.order.id}`);
                addNotification('success', `Mock ${isBuyOrder ? 'buy' : 'sell'} order submitted: ID ${result.order.id}`);
                setOrderAmount("");
                setOrderPrice("");
                await fetchMockOrders(); // Refresh order list
            } else {
                setMessage(`Failed to submit mock order: ${result.error}`);
                addNotification('error', `Failed to submit mock order: ${result.error}`);
            }
        } catch (error: any) {
            console.error("Error submitting mock order:", error);
            setMessage(`Error submitting mock order: ${error.message}`);
            addNotification('error', `Error submitting mock order: ${error.message}`);
        }
    };

    // Filter orders based on current filter settings
    const getFilteredOrders = () => {
        return orders.filter(order => {
            // Filter by order type (buy/sell)
            if (orderFilter === 'buy' && !order.isBuyOrder) return false;
            if (orderFilter === 'sell' && order.isBuyOrder) return false;
            
            // Filter by user's orders only
            if (showMyOrdersOnly && account && order.user.toLowerCase() !== account.toLowerCase()) {
                return false;
            }
            
            return true;
        });
    };

    const filteredOrders = getFilteredOrders();

    return (
        <div className="App">
            <button 
                className="theme-toggle" 
                onClick={toggleTheme} 
                aria-label="Toggle theme"
            >
                {isDarkMode ? '☀️' : '🌙'}
            </button>

            <div className="header-container">
                <h1>Stock Token Exchange (Cartesi Demo)</h1>
                <button 
                    onClick={connectWallet} 
                    disabled={!!account || isLoading}
                    className={account ? 'success' : ''}
                >
                    {isLoading && <span className="spinner"></span>}
                    {account 
                        ? `Connected: ${account.substring(0, 6)}...${account.substring(account.length - 4)}` 
                        : 'Connect Wallet'
                    }
                </button>
            </div>
            
            {/* Network Warning */}
            {networkWarning && (
                <div className="notification warning">
                    <strong>Network Warning:</strong> You are connected to network {chainId}, but contracts are deployed on {CONTRACT_CHAIN_ID}.
                    Please switch your network in MetaMask.
                </div>
            )}
            
            {/* Notifications */}
            {notifications.length > 0 && (
                <div className="notifications-container">
                    {notifications.slice(0, 3).map(notification => (
                        <div 
                            key={notification.id} 
                            className={`notification ${notification.type}`}
                            onClick={() => removeNotification(notification.id)}
                        >
                            {notification.message}
                        </div>
                    ))}
                    {notifications.length > 3 && (
                        <div className="text-center text-muted text-small">
                            +{notifications.length - 3} more notifications
                        </div>
                    ))}
                </div>
            )}

            <div className="status-container">
                <p className={isLoading ? 'loading' : ''}>{message}</p>
                {account && <p>Chain ID: {chainId || 'Loading...'}</p>}
                {transactionHash && (
                    <p>Latest Transaction: <a href={`https://explorer.cartesi.io/tx/${transactionHash}`} target="_blank" rel="noopener noreferrer">
                        {transactionHash.substring(0, 10)}...
                    </a></p>
                )}
            </div>

            {account && (
                <>
                    {/* Balance Display */}
                    <div className="balances-container">
                        <h2>Balances</h2>
                        <div className="balance-grid">
                            <div className="balance-card">
                                <h3>Wallet</h3>
                                <div className="mb-2">
                                    <p className="text-muted mb-1">ETH:</p>
                                    <p className="balance-value">{parseFloat(ethBalance).toFixed(4)}</p>
                                </div>
                                <div>
                                    <p className="text-muted mb-1">{tokenSymbol}:</p>
                                    <p className="balance-value">{parseFloat(tokenBalance).toFixed(4)}</p>
                                </div>
                            </div>
                            <div className="balance-card">
                                <h3>Exchange Deposits</h3>
                                <div className="mb-2">
                                    <p className="text-muted mb-1">ETH:</p>
                                    <p className="balance-value">{parseFloat(exchangeEthBalance).toFixed(4)}</p>
                                </div>
                                <div>
                                    <p className="text-muted mb-1">{tokenSymbol}:</p>
                                    <p className="balance-value">{parseFloat(exchangeTokenBalance).toFixed(4)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Deposit/Withdraw */}
                    <div className="transaction-container">
                        <h2>Deposit & Withdraw</h2>
                        <div className="form-group">
                            <h3 className="mb-2">Deposit</h3>
                            <div className="form-row">
                                <div className="form-col">
                                    <input
                                        type="text"
                                        placeholder="Amount"
                                        value={depositAmount}
                                        onChange={(e) => {
                                            setDepositAmount(e.target.value);
                                            setDepositAmountError(null);
                                        }}
                                        className={depositAmountError ? 'error' : ''}
                                    />
                                    {depositAmountError && (
                                        <p className="text-small text-muted" style={{ color: 'var(--danger-color)' }}>
                                            {depositAmountError}
                                        </p>
                                    )}
                                </div>
                                <div className="button-group">
                                    <button 
                                        onClick={handleDepositEth} 
                                        disabled={isLoading || !depositAmount}
                                        className="success"
                                    >
                                        {isLoading ? <span className="spinner"></span> : null}
                                        Deposit ETH
                                    </button>
                                    <button 
                                        onClick={handleDepositToken} 
                                        disabled={isLoading || !depositAmount}
                                        className="success"
                                    >
                                        {isLoading ? <span className="spinner"></span> : null}
                                        Deposit {tokenSymbol}
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="form-group">
                            <h3 className="mb-2">Withdraw</h3>
                            <div className="form-row">
                                <div className="form-col">
                                    <input
                                        type="text"
                                        placeholder="Amount"
                                        value={withdrawAmount}
                                        onChange={(e) => {
                                            setWithdrawAmount(e.target.value);
                                            setWithdrawAmountError(null);
                                        }}
                                        className={withdrawAmountError ? 'error' : ''}
                                    />
                                    {withdrawAmountError && (
                                        <p className="text-small text-muted" style={{ color: 'var(--danger-color)' }}>
                                            {withdrawAmountError}
                                        </p>
                                    )}
                                </div>
                                <div className="button-group">
                                    <button 
                                        onClick={handleWithdrawEth} 
                                        disabled={isLoading || !withdrawAmount}
                                    >
                                        {isLoading ? <span className="spinner"></span> : null}
                                        Withdraw ETH
                                    </button>
                                    <button 
                                        onClick={handleWithdrawToken} 
                                        disabled={isLoading || !withdrawAmount}
                                    >
                                        {isLoading ? <span className="spinner"></span> : null}
                                        Withdraw {tokenSymbol}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Order Placement */}
                    <div>
                        <h2>Place Order</h2>
                        <div className="order-form">
                            <div className="form-row">
                                <div className="form-col">
                                    <label htmlFor="orderAmount" className="text-small text-bold mb-1 d-block">Amount ({tokenSymbol})</label>
                                    <input
                                        id="orderAmount"
                                        type="text"
                                        placeholder={`Amount (${tokenSymbol})`}
                                        value={orderAmount}
                                        onChange={(e) => {
                                            setOrderAmount(e.target.value);
                                            setOrderAmountError(null);
                                        }}
                                        className={orderAmountError ? 'error' : ''}
                                    />
                                    {orderAmountError && (
                                        <p className="text-small text-muted" style={{ color: 'var(--danger-color)' }}>
                                            {orderAmountError}
                                        </p>
                                    )}
                                </div>
                                <div className="form-col">
                                    <label htmlFor="orderPrice" className="text-small text-bold mb-1 d-block">Price (ETH per {tokenSymbol})</label>
                                    <input
                                        id="orderPrice"
                                        type="text"
                                        placeholder={`Price (ETH per ${tokenSymbol})`}
                                        value={orderPrice}
                                        onChange={(e) => {
                                            setOrderPrice(e.target.value);
                                            setOrderPriceError(null);
                                        }}
                                        className={orderPriceError ? 'error' : ''}
                                    />
                                    {orderPriceError && (
                                        <p className="text-small text-muted" style={{ color: 'var(--danger-color)' }}>
                                            {orderPriceError}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="form-row mt-2">
                                <div className="text-small text-muted mb-1">
                                    Expected total: {orderAmount && orderPrice ? `${(parseFloat(orderAmount) * parseFloat(orderPrice)).toFixed(4)} ETH` : '-'}
                                </div>
                            </div>
                            <div className="order-actions">
                                <button 
                                    onClick={() => handlePlaceOrder(true)} 
                                    disabled={isLoading || !orderAmount || !orderPrice}
                                    className="success"
                                >
                                    {isLoading ? <span className="spinner"></span> : null}
                                    Place Buy Order
                                </button>
                                <button 
                                    onClick={() => handlePlaceOrder(false)} 
                                    disabled={isLoading || !orderAmount || !orderPrice}
                                    className="danger"
                                >
                                    {isLoading ? <span className="spinner"></span> : null}
                                    Place Sell Order
                                </button>
                                <button 
                                    onClick={fetchBlockchainOrders} 
                                    disabled={isLoading}
                                    className="secondary"
                                >
                                    {isLoading ? <span className="spinner"></span> : null}
                                    Refresh Orders
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Transaction History */}
                    {transactions.length > 0 && (
                        <div className="mt-4">
                            <h2>Transaction History</h2>
                            <div className="transaction-history">
                                {transactions.map(tx => (
                                    <div key={tx.id} className="transaction-item">
                                        <div>
                                            <span className="text-bold">
                                                {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                                            </span>
                                            {tx.amount && tx.token && (
                                                <span> {tx.amount} {tx.token}</span>
                                            )}
                                            <span className="text-small text-muted d-block">
                                                {new Date(tx.timestamp).toLocaleString()}
                                            </span>
                                        </div>
                                        <div>
                                            <span 
                                                className={`order-badge ${
                                                    tx.status === 'success' ? 'buy-badge' : 
                                                    tx.status === 'failed' ? 'sell-badge' : ''
                                                }`}
                                            >
                                                {tx.status}
                                            </span>
                                            <a 
                                                href={`https://explorer.cartesi.io/tx/${tx.hash}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-small d-block mt-1"
                                            >
                                                {tx.hash.substring(0, 10)}...
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Order Book */}
                    <div className="mt-4">
                        <h2>Order Book</h2>
                        
                        {/* Order Filters */}
                        <div className="form-row mb-2">
                            <div className="d-flex align-center gap-2">
                                <label className="text-small text-bold">Filter:</label>
                                <button 
                                    className={`secondary ${orderFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setOrderFilter('all')}
                                >
                                    All Orders
                                </button>
                                <button 
                                    className={`success ${orderFilter === 'buy' ? 'active' : ''}`}
                                    onClick={() => setOrderFilter('buy')}
                                >
                                    Buy Orders
                                </button>
                                <button 
                                    className={`danger ${orderFilter === 'sell' ? 'active' : ''}`}
                                    onClick={() => setOrderFilter('sell')}
                                >
                                    Sell Orders
                                </button>
                                <label className="d-flex align-center gap-1">
                                    <input 
                                        type="checkbox" 
                                        checked={showMyOrdersOnly} 
                                        onChange={() => setShowMyOrdersOnly(!showMyOrdersOnly)}
                                    />
                                    My Orders Only
                                </label>
                            </div>
                        </div>
                        
                        <div className="table-container">
                            {filteredOrders.length === 0 ? (
                                <p className="p-2 text-center text-muted">No active orders found.</p>
                            ) : (
                                <table>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Type</th>
                                            <th>Amount</th>
                                            <th>Price (ETH)</th>
                                            <th>Total (ETH)</th>
                                            <th>User</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredOrders.map(order => (
                                            <tr key={order.id}>
                                                <td>{order.id}</td>
                                                <td>
                                                    <span className={`order-badge ${order.isBuyOrder ? 'buy-badge' : 'sell-badge'}`}>
                                                        {order.isBuyOrder ? 'BUY' : 'SELL'}
                                                    </span>
                                                </td>
                                                <td className={order.isBuyOrder ? 'buy-order' : 'sell-order'}>
                                                    {order.amount.toFixed(4)}
                                                </td>
                                                <td>{order.price.toFixed(4)}</td>
                                                <td>{(order.amount * order.price).toFixed(4)}</td>
                                                <td>
                                                    {account && order.user.toLowerCase() === account.toLowerCase() 
                                                        ? <strong>You</strong> 
                                                        : `${order.user.substring(0, 6)}...`}
                                                </td>
                                                <td>
                                                    {/* Only show cancel button if this is the user's order */}
                                                    {account && order.user.toLowerCase() === account.toLowerCase() && (
                                                        <button 
                                                            onClick={() => handleCancelOrder(order.id)}
                                                            disabled={isLoading}
                                                            className="cancel-button"
                                                        >
                                                            {isLoading ? <span className="spinner"></span> : null}
                                                            Cancel
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="text-center mt-2">
                            <button onClick={fetchOrders} disabled={isLoading} className="secondary">
                                {isLoading ? <span className="spinner"></span> : null}
                                Refresh Orders
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default App;