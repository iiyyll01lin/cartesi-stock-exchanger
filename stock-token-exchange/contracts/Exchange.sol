// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/CartesiComputeInterface.sol";
import "./StockToken.sol";
import "@openzeppelin/contracts/utils/Counters.sol"; // Import Counters

/**
 * @title Exchange
 * @dev Contract to handle stock token trading against ETH, utilizing Cartesi Compute.
 */
contract Exchange {
    using Counters for Counters.Counter; // Use Counters library
    Counters.Counter private _orderIds; // Counter for generating unique order IDs

    CartesiComputeInterface cartesiCompute;
    bytes32 public cartesiTemplateHash; // Hash of the Cartesi machine template for order matching
    // ... existing cartesi config variables ...

    address public admin;
    mapping(address => mapping(address => uint256)) public deposits; // tokenAddress => user => amount
    mapping(address => uint256) public ethDeposits; // user => amount

    // Simple Order Structure
    struct Order {
        uint256 id;
        address user;
        address token; // Address of the StockToken
        uint256 amount; // Amount of StockToken
        uint256 price; // Price in ETH per StockToken (using appropriate decimals)
        bool isBuyOrder;
        bool active; // Flag to mark if the order is still active
    }

    // Helper struct for collecting active orders
    struct OrderInfo {
        uint256 id;
        address user;
        address token;
        uint256 amount;
        uint256 price;
        bool isBuyOrder;
        bool active;
    }
    
    // Define the MatchedTrade struct for order matches from the Cartesi computation
    struct MatchedTrade {
        uint256 buyOrderId;
        uint256 sellOrderId;
        address token;
        uint256 amount;
        uint256 price;
    }

    // Cartesi configuration variables
    uint256 constant cartesiFinalTime = 1e11;
    uint64 constant cartesiOutputPosition = 0xb000000000000000;
    uint8 constant cartesiOutputLog2Size = 10; // 2^10 = 1KB output size
    uint256 constant cartesiRoundDuration = 51;
    uint64 constant cartesiInputDrivePosition = 0xa000000000000000;
    uint8 constant cartesiInputDriveLog2Size = 20; // 2^20 ~= 1MB input size

    event ComputationRequested(uint256 indexed cartesiIndex, bytes inputData);

    // Mapping to store orders (simple approach, might get large)
    mapping(uint256 => Order) public orders;

    // Events
    // ... existing events ...
    event OrderPlaced(uint256 orderId, address indexed user, address indexed token, uint256 amount, uint256 price, bool isBuyOrder);
    event OrderCancelled(uint256 orderId);
    event OrderFilled(uint256 orderId);
    event TradeExecuted(
        uint256 indexed buyOrderId,
        uint256 indexed sellOrderId,
        address token,
        uint256 amount,
        uint256 price
    );
    // ... existing events ...

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(address _cartesiComputeAddress, bytes32 _cartesiTemplateHash) {
        cartesiCompute = CartesiComputeInterface(_cartesiComputeAddress);
        cartesiTemplateHash = _cartesiTemplateHash;
        admin = msg.sender;
    }

    // --- Deposit/Withdraw ---
    
    /**
     * @notice Deposit ETH into the exchange
     */
    function depositETH() external payable {
        require(msg.value > 0, "Must deposit some ETH");
        ethDeposits[msg.sender] += msg.value;
        emit ETHDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH from the exchange
     * @param _amount Amount of ETH to withdraw
     */
    function withdrawETH(uint256 _amount) external {
        require(_amount > 0, "Must withdraw some ETH");
        require(ethDeposits[msg.sender] >= _amount, "Insufficient ETH balance");
        
        ethDeposits[msg.sender] -= _amount;
        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "ETH transfer failed");
        
        emit ETHWithdrawn(msg.sender, _amount);
    }

    /**
     * @notice Deposit tokens into the exchange
     * @param _tokenAddress Address of the token to deposit
     * @param _amount Amount of tokens to deposit
     */
    function depositToken(address _tokenAddress, uint256 _amount) external {
        require(_amount > 0, "Must deposit some tokens");
        require(_tokenAddress != address(0), "Invalid token address");
        
        // Transfer tokens from user to this contract
        StockToken token = StockToken(_tokenAddress);
        require(token.transferFrom(msg.sender, address(this), _amount), "Token transfer failed");
        
        // Update user's balance
        deposits[_tokenAddress][msg.sender] += _amount;
        emit TokenDeposited(msg.sender, _tokenAddress, _amount);
    }

    /**
     * @notice Withdraw tokens from the exchange
     * @param _tokenAddress Address of the token to withdraw
     * @param _amount Amount of tokens to withdraw
     */
    function withdrawToken(address _tokenAddress, uint256 _amount) external {
        require(_amount > 0, "Must withdraw some tokens");
        require(_tokenAddress != address(0), "Invalid token address");
        require(deposits[_tokenAddress][msg.sender] >= _amount, "Insufficient token balance");
        
        // Update user's balance
        deposits[_tokenAddress][msg.sender] -= _amount;
        
        // Transfer tokens from this contract to user
        StockToken token = StockToken(_tokenAddress);
        require(token.transfer(msg.sender, _amount), "Token transfer failed");
        
        emit TokenWithdrawn(msg.sender, _tokenAddress, _amount);
    }

    // Events for deposits and withdrawals
    event ETHDeposited(address indexed user, uint256 amount);
    event ETHWithdrawn(address indexed user, uint256 amount);
    event TokenDeposited(address indexed user, address indexed token, uint256 amount);
    event TokenWithdrawn(address indexed user, address indexed token, uint256 amount);

    // --- Order Management ---

    function placeOrder(address _tokenAddress, uint256 _amount, uint256 _price, bool _isBuyOrder) external returns (uint256 orderId) {
        require(_amount > 0 && _price > 0, "Amount and price must be positive");
        require(_tokenAddress != address(0), "Invalid token address");

        if (_isBuyOrder) {
            // Lock ETH for buy order
            // Calculate cost in wei: _amount * _price (wei per token)
            // Note: We're using SafeMath implicitly as Solidity 0.8.0+ has built-in overflow checking
            
            // Calculate cost safely to avoid overflow
            // First divide price by 1e18 to get the unit price in ETH
            // Then multiply by amount to get total cost
            uint256 exactCost = (_amount * _price) / 1e18; // Convert from wei to ETH units
            
            // Use a small safety margin (0.5%) to handle potential precision issues
            // Matches the frontend safety margin
            uint256 cost = exactCost + (exactCost * 5 / 1000);
            
            // Ensure we have enough ETH, using the cost with safety margin for the check
            require(ethDeposits[msg.sender] >= cost, "Insufficient ETH for buy order");
            
            // Log balances before locking funds
            emit ETHDeposited(msg.sender, 0); // Using existing event as a log (amount 0 indicates this is just a log)
            
            // Deduct the exact cost (not the padded one) from user's ETH balance
            // We use exactCost for the actual deduction to ensure precision
            ethDeposits[msg.sender] -= exactCost; // Pre-lock funds
        } else {
            // Lock Tokens for sell order
            require(deposits[_tokenAddress][msg.sender] >= _amount, "Insufficient tokens for sell order");
            deposits[_tokenAddress][msg.sender] -= _amount; // Pre-lock tokens
        }

        _orderIds.increment();
        orderId = _orderIds.current();

        orders[orderId] = Order({
            id: orderId,
            user: msg.sender,
            token: _tokenAddress,
            amount: _amount,
            price: _price,
            isBuyOrder: _isBuyOrder,
            active: true
        });

        emit OrderPlaced(orderId, msg.sender, _tokenAddress, _amount, _price, _isBuyOrder);
        return orderId;
    }

    function cancelOrder(uint256 _orderId) external {
        Order storage order = orders[_orderId];
        require(order.user == msg.sender, "Not order owner");
        require(order.active, "Order not active");

        order.active = false;

        // Refund locked assets
        if (order.isBuyOrder) {
            uint256 cost = order.amount * order.price;
            ethDeposits[msg.sender] += cost; // Refund ETH
        } else {
            deposits[order.token][msg.sender] += order.amount; // Refund Tokens
        }

        emit OrderCancelled(_orderId);
    }


    // --- Cartesi Interaction ---

    /**
     * @notice Triggers the off-chain order matching computation.
     * @dev Collects active orders and sends them to the Cartesi Machine.
     * @param _maxOrders Maximum number of orders to include (to limit gas)
     */
    function triggerOrderMatching(uint256 _maxOrders, address[] memory /* _parties */) external onlyAdmin returns (uint256) {
        // 1. Collect active orders (up to _maxOrders)
        OrderInfo[] memory activeBuyOrders = collectActiveOrders(true, _maxOrders);
        OrderInfo[] memory activeSellOrders = collectActiveOrders(false, _maxOrders);
        
        // 2. Construct the input data for the Cartesi Machine
        // Format matches the JSON expected by offchain_logic.py:
        // {
        //   "buy_orders": [ {"id": 1, "user": "0x...", "token": "0x...", "amount": 100, "price": 50, "active": true}, ...],
        //   "sell_orders": [ {"id": 2, "user": "0x...", "token": "0x...", "amount": 150, "price": 49, "active": true}, ...]
        // }
        
        // For the Solidity → Cartesi interface, instead of creating JSON directly,
        // we ABI-encode our data structure and have the Cartesi application decode it
        bytes memory inputData = abi.encode(activeBuyOrders, activeSellOrders);
        
        // 3. Decide how to pass the data to Cartesi based on size
        // For small inputs, we can include data directly in the transaction
        // For large inputs, we should use a Cartesi drive with off-chain storage
        
        // For demonstration, let's add a simple check: if data is too large, emit an event
        // In a real implementation, you'd want to handle this case properly (off-chain storage)
        if (inputData.length > 24576) { // ~24KB, a reasonable threshold for eth tx data
            emit InputDataTooLarge(inputData.length);
            revert("Input data too large for direct inclusion");
        }
        
        // 4. Configure Cartesi drives
        CartesiComputeInterface.Drive[] memory drives = new CartesiComputeInterface.Drive[](1);
        
        // Add the input drive with our orders data
        drives[0] = CartesiComputeInterface.Drive({
            position: cartesiInputDrivePosition,
            driveLog2Size: cartesiInputDriveLog2Size,
            directValue: inputData // Pass data directly for moderate-sized inputs
        });
        
        // Prepare parties array (just the admin in this simple version)
        address[] memory parties = new address[](1);
        parties[0] = admin;
        
        // 5. Instantiate the Cartesi computation with the provided parameters
        uint256 cartesiIndex = cartesiCompute.instantiate(
            cartesiFinalTime,
            cartesiTemplateHash,
            cartesiOutputPosition,
            cartesiOutputLog2Size,
            cartesiRoundDuration,
            parties,
            drives
        );
        
        // Log the computation request and input data (for auditability)
        emit ComputationRequested(cartesiIndex, inputData);
        return cartesiIndex;
    }
    
    /**
     * @dev Helper function to collect active orders
     * @param _isBuyOrder Whether to collect buy (true) or sell (false) orders
     * @param _maxOrders Maximum number of orders to collect
     * @return Array of active orders of the specified type
     */
    function collectActiveOrders(bool _isBuyOrder, uint256 _maxOrders) internal view returns (OrderInfo[] memory) {
        // First, count the number of active orders of the requested type
        uint256 activeCount = 0;
        uint256 totalOrders = _orderIds.current();
        
        for (uint256 i = 1; i <= totalOrders && activeCount < _maxOrders; i++) {
            Order storage order = orders[i];
            if (order.active && order.isBuyOrder == _isBuyOrder) {
                activeCount++;
            }
        }
        
        // Create an array with the exact size needed
        OrderInfo[] memory activeOrders = new OrderInfo[](activeCount);
        
        // Fill the array with active orders
        uint256 index = 0;
        for (uint256 i = 1; i <= totalOrders && index < activeCount; i++) {
            Order storage order = orders[i];
            if (order.active && order.isBuyOrder == _isBuyOrder) {
                activeOrders[index] = OrderInfo({
                    id: order.id,
                    user: order.user,
                    token: order.token,
                    amount: order.amount,
                    price: order.price,
                    isBuyOrder: order.isBuyOrder,
                    active: order.active
                });
                index++;
            }
        }
        
        return activeOrders;
    }
    
    // Event for when input data is too large for direct inclusion
    event InputDataTooLarge(uint256 dataSize);

    /**
     * @notice Processes the results from a completed Cartesi computation.
     * @param _index The index of the Cartesi computation.
     */
    function processMatchResult(uint256 _index) external onlyAdmin {
        (bool hasResult, bool finalized, , bytes memory resultData) = cartesiCompute.getResult(_index);

        require(hasResult, "Computation has no result yet");
        require(finalized, "Computation result not finalized");
        require(resultData.length > 0, "Result data is empty");

        // Decode the JSON data from the Cartesi Machine
        // Note: Direct JSON parsing in Solidity is not available, so in a production setting
        // you would use one of these approaches:
        // 1. Have Cartesi output ABI-encoded data instead of JSON 
        // 2. Use a JSON parsing library in Solidity (gas-intensive)
        // 3. Pre-process the JSON data off-chain and submit the decoded data

        // For this implementation, we assume the resultData is already properly ABI-encoded
        // by the Cartesi validators or a trusted service after JSON parsing
        MatchedTrade[] memory trades = abi.decode(resultData, (MatchedTrade[]));

        // Process each matched trade
        for (uint i = 0; i < trades.length; i++) {
            MatchedTrade memory trade = trades[i];
            
            // Retrieve the buy and sell orders
            Order storage buyOrder = orders[trade.buyOrderId];
            Order storage sellOrder = orders[trade.sellOrderId];

            // Validate the matched orders
            require(buyOrder.active && sellOrder.active, "One or both orders inactive");
            require(buyOrder.token == trade.token && sellOrder.token == trade.token, "Token mismatch");
            require(buyOrder.isBuyOrder && !sellOrder.isBuyOrder, "Order types incorrect");
            require(buyOrder.price >= sellOrder.price, "Price mismatch"); // Buyer willing to pay >= seller asking
            require(trade.price <= buyOrder.price && trade.price >= sellOrder.price, "Execution price out of range");
            require(trade.amount > 0, "Trade amount must be positive");

            // Check if trade amount exceeds available order amounts
            require(trade.amount <= buyOrder.amount, "Trade amount exceeds buy order amount");
            require(trade.amount <= sellOrder.amount, "Trade amount exceeds sell order amount");

            // Calculate the actual cost of the trade using the execution price
            uint256 tradeCost = trade.amount * trade.price / 1e18; // Convert from wei to ETH units

            // Update orders: Mark as inactive if fully filled, or reduce amount if partially filled
            // For simplicity, we'll assume partial fills can happen
            buyOrder.amount -= trade.amount;
            sellOrder.amount -= trade.amount;
            
            // If any order is fully filled, mark it as inactive
            if (buyOrder.amount == 0) {
                buyOrder.active = false;
                emit OrderFilled(trade.buyOrderId);
            }
            
            if (sellOrder.amount == 0) {
                sellOrder.active = false;
                emit OrderFilled(trade.sellOrderId);
            }

            // Transfer assets based on the matched trade
            // 1. Give seller the ETH (based on execution price)
            ethDeposits[sellOrder.user] += tradeCost;

            // 2. Give buyer the Tokens
            deposits[trade.token][buyOrder.user] += trade.amount;

            // 3. Refund buyer if they locked more ETH than needed (buy price > execution price)
            uint256 originalLocked = trade.amount * buyOrder.price / 1e18; // Convert from wei to ETH units
            if (originalLocked > tradeCost) {
                ethDeposits[buyOrder.user] += (originalLocked - tradeCost);
            }

            // Emit an event for the executed trade
            emit TradeExecuted(
                trade.buyOrderId, 
                trade.sellOrderId, 
                trade.token, 
                trade.amount, 
                trade.price
            );
        }

        // Optional: Clean up the computation data if it's no longer needed
        // cartesiCompute.destruct(_index);
    }

    // --- Admin Functions ---
    // ... existing admin functions ...

    // --- View Functions (Optional) ---
    function getOrder(uint256 _orderId) external view returns (Order memory) {
        return orders[_orderId];
    }

    function getOrderCount() external view returns (uint256) {
        return _orderIds.current();
    }

    function getUserTokenBalance(address _user, address _tokenAddress) external view returns (uint256) {
        return deposits[_tokenAddress][_user];
    }

    function getUserEthBalance(address _user) external view returns (uint256) {
        return ethDeposits[_user];
    }
}
