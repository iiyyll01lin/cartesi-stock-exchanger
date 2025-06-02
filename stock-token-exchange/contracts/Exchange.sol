// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/CartesiComputeInterface.sol";
import "./StockToken.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol"; // Ensure this path is correct for your OpenZeppelin version

/**
 * @title Exchange
 * @dev Contract to handle stock token trading against ETH, utilizing Cartesi Compute.
 * Supports switching between a real Cartesi compute service and a mock service.
 */
contract Exchange is Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _orderIds;
    Counters.Counter private _cartesiRequestIds; // To track Cartesi computation requests
    Counters.Counter private _tradeIdsCounter;

    // Cartesi compute instances
    CartesiComputeInterface internal activeCartesiCompute; // Currently active Cartesi compute service
    address public realCartesiComputeAddress;
    address public mockCartesiComputeAddress;
    bool public useMockCompute; // True if mock is active, false if real is active

    bytes32 public cartesiTemplateHash; // Hash of the Cartesi machine template

    // Cartesi machine configuration
    uint256 public cartesiFinalTime = 1 days; // Default finality time for computation
    uint64 public cartesiOutputPosition = 0xb000000000000000; // Default, from Cartesi examples
    uint8 public cartesiOutputLog2Size = 24; // Default, allowing up to 16MB output, adjust as needed
    uint256 public cartesiRoundDuration = 1 hours; // Default round duration


    // Active order management
    // Storing actual order IDs in these arrays
    uint256[] public activeBuyOrderIds;
    uint256[] public activeSellOrderIds;
    
    // Mapping to quickly check if an order ID is in activeBuyOrderIds or activeSellOrderIds and its position
    // This helps in quick removal. value is index + 1 (0 means not present)
    mapping(uint256 => uint256) private activeBuyOrderPositions;
    mapping(uint256 => uint256) private activeSellOrderPositions;


    // Mapping to store active Cartesi request IDs and their associated input data hash for verification
    mapping(uint256 => bytes32) public activeCartesiRequests; // cartesiId => keccak256(inputData)

    mapping(address => mapping(address => uint256)) public deposits; // tokenAddress => user => amount
    mapping(address => uint256) public ethDeposits; // user => amount


    // Structs
    struct Order {
        uint256 id;
        address user;
        address token; // Address of the StockToken
        uint256 amount; // Number of tokens
        uint256 price; // Price in ETH per token (e.g., using 18 decimals for ETH)
        bool isBuyOrder;
        uint256 filled; // Amount of the order that has been filled
        bool active; // Is the order currently active on the book
        bool cancelled; // Has the order been cancelled
    }

    // Input struct for Cartesi machine
    struct CartesiOrderInput {
        uint256 id;
        address user;
        address token;
        uint256 amount;
        uint256 price;
        bool isBuyOrder;
    }

    struct Trade {
        uint256 id;
        uint256 buyOrderId;
        uint256 sellOrderId;
        address buyer;
        address seller;
        address token;
        uint256 price;
        uint256 quantity;
        uint256 timestamp;
    }

    // Struct for decoding results from Cartesi
    struct MatchedTrade {
        uint256 buyOrderId;
        uint256 sellOrderId;
        address buyer; 
        address seller;
        address token; 
        uint256 price; 
        uint256 quantity; 
        uint256 fee;      // Total fee (maker + taker)
    }

    // Enhanced struct for runtime configuration
    struct RuntimeConfig {
        uint256 timestamp;         // Current timestamp for matching
        uint256 feeBasisPoints;    // Trading fee in basis points (e.g., 30 = 0.3%)
        uint256 minTradeAmount;    // Minimum trade amount in wei/tokens
    }
    
    mapping(uint256 => Order) public orders;
    uint256[] public tradeIds; 
    mapping(uint256 => Trade) public trades; 


    event OrderPlaced(uint256 orderId, address user, address token, uint256 amount, uint256 price, bool isBuyOrder);
    event OrderCancelled(uint256 orderId, address user);
    event OrderFilled(uint256 orderId, uint256 amountFilled, uint256 price, uint256 quantityTraded);
    event OrderPartiallyFilled(uint256 orderId, uint256 amountFilled, uint256 price, uint256 quantityTraded);
    event TradeExecuted(uint256 tradeId, uint256 buyOrderId, uint256 sellOrderId, address buyer, address seller, address token, uint256 price, uint256 quantity);
    event CartesiComputeRequested(uint256 cartesiId, bytes32 templateHash, bytes32 inputHash, uint256 inputDataLength);
    event CartesiResultProcessed(uint256 cartesiId, bytes result);
    event CartesiModeChanged(bool useMock, address activeComputeAddress);
    event CartesiTemplateHashUpdated(bytes32 newTemplateHash);
    event CartesiConfigUpdated(uint256 finalTime, uint64 outputPosition, uint8 outputLog2Size, uint256 roundDuration);
    event EthDeposited(address indexed user, uint256 amount);
    event EthWithdrawn(address indexed user, uint256 amount);
    event TokensDeposited(address indexed user, address indexed token, uint256 amount);
    event TokensWithdrawn(address indexed user, address indexed token, uint256 amount);
    event CartesiProcessingError(uint256 cartesiId, string errorMessage);
    event CartesiComputationCompleted(uint256 cartesiId);
    event RuntimeConfigUsed(uint256 timestamp, uint256 feeBasisPoints, uint256 minTradeAmount);


    /**
     * @param _initialRealCartesiCompute The address of the real CartesiCompute contract.
     * @param _initialMockCartesiCompute The address of the MockCartesiCompute contract.
     * @param _initialTemplateHash The initial Cartesi machine template hash.
     * @param _startWithMock True to start with mock compute, false for real.
     */
    constructor(
        address _initialRealCartesiCompute,
        address _initialMockCartesiCompute,
        bytes32 _initialTemplateHash,
        bool _startWithMock
    ) Ownable() { // Corrected Ownable initialization (takes no arguments for OZ 5.x+)
        require(_initialRealCartesiCompute != address(0), "Exchange: Real CartesiCompute address cannot be zero");
        require(_initialMockCartesiCompute != address(0), "Exchange: Mock CartesiCompute address cannot be zero");
        require(_initialTemplateHash != bytes32(0), "Exchange: Initial template hash cannot be zero");

        realCartesiComputeAddress = _initialRealCartesiCompute;
        mockCartesiComputeAddress = _initialMockCartesiCompute;
        cartesiTemplateHash = _initialTemplateHash;
        
        setCartesiMode(_startWithMock); // Call internal logic to set mode and emit event
        emit CartesiTemplateHashUpdated(_initialTemplateHash); // Emit this separately
    }

    /**
     * @dev Allows the owner to switch between real and mock Cartesi compute services.
     * @param _useMock True to use mock, false to use real.
     */
    function setCartesiMode(bool _useMock) public onlyOwner { // Changed to public for initial setup via constructor call
        useMockCompute = _useMock;
        if (useMockCompute) {
            activeCartesiCompute = CartesiComputeInterface(mockCartesiComputeAddress);
        } else {
            activeCartesiCompute = CartesiComputeInterface(realCartesiComputeAddress);
        }
        emit CartesiModeChanged(useMockCompute, address(activeCartesiCompute));
    }

    /**
     * @dev Allows the owner to update the Cartesi machine template hash.
     */
    function updateCartesiTemplateHash(bytes32 _newTemplateHash) external onlyOwner {
        require(_newTemplateHash != bytes32(0), "Exchange: New template hash cannot be zero");
        cartesiTemplateHash = _newTemplateHash;
        emit CartesiTemplateHashUpdated(_newTemplateHash);
    }

    /**
     * @dev Allows the owner to update Cartesi machine configuration parameters.
     */
    function updateCartesiConfig(
        uint256 _finalTime,
        uint64 _outputPosition,
        uint8 _outputLog2Size,
        uint256 _roundDuration
    ) external onlyOwner {
        // Add reasonable checks for parameters if necessary
        require(_finalTime > 0, "Final time must be positive");
        require(_outputLog2Size > 0 && _outputLog2Size <= 32, "OutputLog2Size must be between 1 and 32"); // Example range
        require(_roundDuration > 0, "Round duration must be positive");

        cartesiFinalTime = _finalTime;
        cartesiOutputPosition = _outputPosition;
        cartesiOutputLog2Size = _outputLog2Size;
        cartesiRoundDuration = _roundDuration;
        emit CartesiConfigUpdated(_finalTime, _outputPosition, _outputLog2Size, _roundDuration);
    }

    // --- Deposit and Withdraw Logic ---
    function depositETH() external payable {
        require(msg.value > 0, "Exchange: Deposit amount must be greater than zero");
        ethDeposits[msg.sender] += msg.value;
        emit EthDeposited(msg.sender, msg.value);
    }

    function withdrawETH(uint256 _amount) external {
        require(_amount > 0, "Exchange: Withdraw amount must be greater than zero");
        require(ethDeposits[msg.sender] >= _amount, "Exchange: Insufficient ETH balance");
        ethDeposits[msg.sender] -= _amount;
        payable(msg.sender).transfer(_amount);
        emit EthWithdrawn(msg.sender, _amount);
    }

    function depositTokens(address _tokenAddress, uint256 _amount) external {
        require(_tokenAddress != address(0), "Exchange: Token address cannot be zero");
        require(_amount > 0, "Exchange: Deposit amount must be greater than zero");
        
        StockToken token = StockToken(_tokenAddress); // Assuming StockToken interface/contract
        require(token.transferFrom(msg.sender, address(this), _amount), "Exchange: Token transfer failed");
        
        deposits[_tokenAddress][msg.sender] += _amount;
        emit TokensDeposited(msg.sender, _tokenAddress, _amount);
    }

    function withdrawTokens(address _tokenAddress, uint256 _amount) external {
        require(_tokenAddress != address(0), "Exchange: Token address cannot be zero");
        require(_amount > 0, "Exchange: Withdraw amount must be greater than zero");
        require(deposits[_tokenAddress][msg.sender] >= _amount, "Exchange: Insufficient token balance");

        deposits[_tokenAddress][msg.sender] -= _amount;
        StockToken token = StockToken(_tokenAddress);
        require(token.transfer(msg.sender, _amount), "Exchange: Token transfer failed");
        emit TokensWithdrawn(msg.sender, _tokenAddress, _amount);
    }

    // --- Order Management ---
    function placeOrder(address _token, uint256 _amount, uint256 _price, bool _isBuyOrder) external returns (uint256 orderId) {
        require(_token != address(0), "Exchange: Token address cannot be zero");
        require(_amount > 0, "Exchange: Order amount must be greater than zero");
        require(_price > 0, "Exchange: Order price must be greater than zero");

        if (_isBuyOrder) {
            uint256 totalCost = _amount * _price; // This might need adjustment for decimals
            require(ethDeposits[msg.sender] >= totalCost, "Exchange: Insufficient ETH for buy order");
            // No immediate deduction, ETH is committed. Actual transfer happens on trade.
        } else {
            require(deposits[_token][msg.sender] >= _amount, "Exchange: Insufficient tokens for sell order");
            // No immediate deduction, tokens are committed. Actual transfer happens on trade.
        }

        _orderIds.increment();
        orderId = _orderIds.current();
        
        orders[orderId] = Order({
            id: orderId,
            user: msg.sender,
            token: _token,
            amount: _amount,
            price: _price,
            isBuyOrder: _isBuyOrder,
            filled: 0,
            active: true,
            cancelled: false
        });

        if (_isBuyOrder) {
            activeBuyOrderIds.push(orderId);
            activeBuyOrderPositions[orderId] = activeBuyOrderIds.length; // index + 1
        } else {
            activeSellOrderIds.push(orderId);
            activeSellOrderPositions[orderId] = activeSellOrderIds.length; // index + 1
        }

        emit OrderPlaced(orderId, msg.sender, _token, _amount, _price, _isBuyOrder);
        return orderId;
    }
    
    function _removeOrderFromActiveList(uint256 _orderId, bool _isBuyOrder) private {
        if (_isBuyOrder) {
            uint256 pos = activeBuyOrderPositions[_orderId];
            if (pos > 0) { // If found in active list
                uint256 index = pos - 1;
                uint256 lastOrderId = activeBuyOrderIds[activeBuyOrderIds.length - 1];
                activeBuyOrderIds[index] = lastOrderId; // Move last element to the removed spot
                activeBuyOrderPositions[lastOrderId] = index + 1; // Update position of moved element
                activeBuyOrderIds.pop();
                delete activeBuyOrderPositions[_orderId];
            }
        } else {
            uint256 pos = activeSellOrderPositions[_orderId];
            if (pos > 0) {
                uint256 index = pos - 1;
                uint256 lastOrderId = activeSellOrderIds[activeSellOrderIds.length - 1];
                activeSellOrderIds[index] = lastOrderId;
                activeSellOrderPositions[lastOrderId] = index + 1;
                activeSellOrderIds.pop();
                delete activeSellOrderPositions[_orderId];
            }
        }
    }

    function cancelOrder(uint256 _orderId) external {
        Order storage order = orders[_orderId];
        require(order.user == msg.sender, "Exchange: Not order owner");
        require(order.active, "Exchange: Order not active");
        require(!order.cancelled, "Exchange: Order already cancelled");

        order.active = false;
        order.cancelled = true;
        
        _removeOrderFromActiveList(_orderId, order.isBuyOrder);

        emit OrderCancelled(_orderId, msg.sender);
    }
    
    // --- Cartesi Interaction ---
    /**
     * @dev Triggers order matching by sending active orders to Cartesi.
     * @param _maxBuyOrdersToProcess Max number of buy orders to include in this batch.
     * @param _maxSellOrdersToProcess Max number of sell orders to include in this batch.
     */
    function triggerOrderMatching(uint256 _maxBuyOrdersToProcess, uint256 _maxSellOrdersToProcess) external onlyOwner returns (uint256 cartesiId) {
        return triggerOrderMatchingWithConfig(_maxBuyOrdersToProcess, _maxSellOrdersToProcess, 0, 0);
    }

    /**
     * @dev Enhanced order matching with runtime configuration support
     * @param _maxBuyOrdersToProcess Maximum buy orders to include
     * @param _maxSellOrdersToProcess Maximum sell orders to include
     * @param _feeBasisPoints Trading fee in basis points (0 to use default)
     * @param _minTradeAmount Minimum trade amount (0 to use default)
     */
    function triggerOrderMatchingWithConfig(
        uint256 _maxBuyOrdersToProcess, 
        uint256 _maxSellOrdersToProcess,
        uint256 _feeBasisPoints,
        uint256 _minTradeAmount
    ) public onlyOwner returns (uint256 cartesiId) {
        uint256 buyCount = activeBuyOrderIds.length < _maxBuyOrdersToProcess ? activeBuyOrderIds.length : _maxBuyOrdersToProcess;
        uint256 sellCount = activeSellOrderIds.length < _maxSellOrdersToProcess ? activeSellOrderIds.length : _maxSellOrdersToProcess;

        CartesiOrderInput[] memory buyInputs = new CartesiOrderInput[](buyCount);
        CartesiOrderInput[] memory sellInputs = new CartesiOrderInput[](sellCount);

        for (uint i = 0; i < buyCount; i++) {
            Order storage o = orders[activeBuyOrderIds[i]];
            buyInputs[i] = CartesiOrderInput(o.id, o.user, o.token, o.amount - o.filled, o.price, o.isBuyOrder);
        }
        for (uint i = 0; i < sellCount; i++) {
            Order storage o = orders[activeSellOrderIds[i]];
            sellInputs[i] = CartesiOrderInput(o.id, o.user, o.token, o.amount - o.filled, o.price, o.isBuyOrder);
        }

        // Enhanced runtime configuration
        RuntimeConfig memory runtimeConfig = RuntimeConfig({
            timestamp: block.timestamp,
            feeBasisPoints: _feeBasisPoints,
            minTradeAmount: _minTradeAmount
        });

        bytes memory inputData = abi.encode(buyInputs, sellInputs, runtimeConfig);
        
        // Emit runtime config usage event
        emit RuntimeConfigUsed(runtimeConfig.timestamp, runtimeConfig.feeBasisPoints, runtimeConfig.minTradeAmount);
        bytes32 inputHash = keccak256(inputData);

        _cartesiRequestIds.increment();
        cartesiId = _cartesiRequestIds.current();
        activeCartesiRequests[cartesiId] = inputHash;

        // Prepare the drive for Cartesi input
        CartesiComputeInterface.Drive[] memory drives = new CartesiComputeInterface.Drive[](1);
        drives[0] = CartesiComputeInterface.Drive({
            position: cartesiOutputPosition, // This is typically where the machine expects to read input, might need a specific input position
            driveLog2Size: 0, // For directValue, log2Size is often 0, or needs to be size of data. Let's use a calculated one.
            directValue: inputData
        });
        
        // Calculate driveLog2Size for the input data
        // Smallest power of 2 that is >= length of data.
        // If data length is 0, log2Size can be 0.
        // If data length is 1, log2Size is 0 (2^0 = 1).
        // If data length is 2, log2Size is 1 (2^1 = 2).
        // If data length is 3 or 4, log2Size is 2 (2^2 = 4).
        if (inputData.length == 0) {
            drives[0].driveLog2Size = 0;
        } else {
            uint256 len = inputData.length;
            uint8 log2Size = 0;
            if (len > 0) {
                len--; // Adjust for power of 2 calculation
                while (len > 0) {
                    len >>= 1;
                    log2Size++;
                }
            }
            drives[0].driveLog2Size = log2Size;
        }


        // Define parties - for now, an empty array or just the contract itself if needed
        address[] memory parties = new address[](0); // No specific parties other than caller context

        activeCartesiCompute.instantiate(
            cartesiFinalTime,       // _finalTime
            cartesiTemplateHash,    // _templateHash
            cartesiOutputPosition,  // _outputPosition (where to read result, not input drive position)
            cartesiOutputLog2Size,  // _outputLog2Size (for the result)
            cartesiRoundDuration,   // _roundDuration
            parties,                // _parties
            drives                  // _drives (containing the inputData)
        );

        emit CartesiComputeRequested(cartesiId, cartesiTemplateHash, inputHash, inputData.length);
        return cartesiId;
    }

    /**
     * @dev Processes the result from a Cartesi computation.
     * @param _cartesiId The ID of the Cartesi computation request.
     * @param _result The raw bytes result from Cartesi.
     */
    function processCartesiResult(uint256 _cartesiId, bytes calldata _result) external onlyOwner {
        require(activeCartesiRequests[_cartesiId] != bytes32(0), "Exchange: Invalid or processed Cartesi ID");
        // Optional: Verify _result hash against something if Cartesi machine provides a way,
        // or trust the result if the dispute resolution period has passed.

        MatchedTrade[] memory matchedTrades = abi.decode(_result, (MatchedTrade[]));

        for (uint i = 0; i < matchedTrades.length; i++) {
            MatchedTrade memory mt = matchedTrades[i];
            Order storage buyOrder = orders[mt.buyOrderId];
            Order storage sellOrder = orders[mt.sellOrderId];

            // Basic validation
            require(buyOrder.active && !buyOrder.cancelled, "Exchange: Buy order inactive");
            require(sellOrder.active && !sellOrder.cancelled, "Exchange: Sell order inactive");
            require(buyOrder.user == mt.buyer, "Exchange: Buyer mismatch");
            require(sellOrder.user == mt.seller, "Exchange: Seller mismatch");
            require(buyOrder.token == mt.token && sellOrder.token == mt.token, "Exchange: Token mismatch in trade");
            require(buyOrder.price >= mt.price && sellOrder.price <= mt.price, "Exchange: Trade price out of order bounds");
            require(mt.quantity > 0, "Exchange: Trade quantity must be positive");
            require(buyOrder.amount - buyOrder.filled >= mt.quantity, "Exchange: Buy order insufficient remaining amount");
            require(sellOrder.amount - sellOrder.filled >= mt.quantity, "Exchange: Sell order insufficient remaining amount");

            // Update filled amounts
            buyOrder.filled += mt.quantity;
            sellOrder.filled += mt.quantity;

            // Settlement: Transfer ETH from buyer to seller (minus fee), tokens from seller to buyer
            uint256 ethAmount = mt.quantity * mt.price; // Care with decimals
            uint256 netEthAmount = ethAmount - mt.fee; // Fee is deducted from trade value

            require(ethDeposits[mt.buyer] >= ethAmount, "Exchange: Buyer insufficient ETH for settlement");
            ethDeposits[mt.buyer] -= ethAmount;
            ethDeposits[mt.seller] += netEthAmount; // Seller receives net amount (minus fee)
            
            // Fee goes to contract owner or fee pool (simplified - fee stays in contract)
            // In a production system, you might want to track collected fees separately

            require(deposits[mt.token][mt.seller] >= mt.quantity, "Exchange: Seller insufficient tokens for settlement");
            deposits[mt.token][mt.seller] -= mt.quantity;
            deposits[mt.token][mt.buyer] += mt.quantity;

            // Record the trade
            _tradeIdsCounter.increment();
            uint256 tradeId = _tradeIdsCounter.current();
            trades[tradeId] = Trade({
                id: tradeId,
                buyOrderId: mt.buyOrderId,
                sellOrderId: mt.sellOrderId,
                buyer: mt.buyer,
                seller: mt.seller,
                token: mt.token,
                price: mt.price,
                quantity: mt.quantity,
                timestamp: block.timestamp
            });
            tradeIds.push(tradeId);
            emit TradeExecuted(tradeId, mt.buyOrderId, mt.sellOrderId, mt.buyer, mt.seller, mt.token, mt.price, mt.quantity);

            // Update order status and emit events
            if (buyOrder.filled == buyOrder.amount) {
                buyOrder.active = false;
                _removeOrderFromActiveList(mt.buyOrderId, true);
                emit OrderFilled(mt.buyOrderId, buyOrder.filled, mt.price, mt.quantity);
            } else {
                emit OrderPartiallyFilled(mt.buyOrderId, buyOrder.filled, mt.price, mt.quantity);
            }

            if (sellOrder.filled == sellOrder.amount) {
                sellOrder.active = false;
                _removeOrderFromActiveList(mt.sellOrderId, false);
                emit OrderFilled(mt.sellOrderId, sellOrder.filled, mt.price, mt.quantity);
            } else {
                emit OrderPartiallyFilled(mt.sellOrderId, sellOrder.filled, mt.price, mt.quantity);
            }
        }

        delete activeCartesiRequests[_cartesiId];
        emit CartesiResultProcessed(_cartesiId, _result);
    }


    /**
     * @dev Automatically check and process Cartesi computation results
     * @param _cartesiId Cartesi computation request ID
     * @return processed Whether the result was successfully processed
     */
    function checkAndProcessCartesiResult(uint256 _cartesiId) external returns (bool processed) {
        require(_cartesiId > 0 && _cartesiId <= _cartesiRequestIds.current(), "Exchange: Invalid Cartesi ID");
        require(activeCartesiRequests[_cartesiId] != bytes32(0), "Exchange: Cartesi request not active or already processed");
        
        // Check if Cartesi computation is complete
        (, bool hasResult, , bytes memory resultData) = 
            activeCartesiCompute.getResult(_cartesiId);
        
        if (!hasResult) {
            return false; // Computation not yet complete
        }
        
        // Automatically process the result
        this._processMatchedTrades(_cartesiId, resultData);
        
        return true;
    }

    /**
     * @dev Batch check multiple Cartesi request results
     * @param _cartesiIds Array of Cartesi IDs to check
     * @return processedCount Number of successfully processed requests
     */
    function batchProcessCartesiResults(uint256[] calldata _cartesiIds) external returns (uint256 processedCount) {
        processedCount = 0;
        
        for (uint i = 0; i < _cartesiIds.length; i++) {
            uint256 cartesiId = _cartesiIds[i];
            
            // Check if ID is valid and request is still active
            if (cartesiId == 0 || cartesiId > _cartesiRequestIds.current()) {
                continue;
            }
            if (activeCartesiRequests[cartesiId] == bytes32(0)) {
                continue; // Already processed or invalid
            }
            
            // Check if result is available
            (, bool hasResult, , bytes memory resultData) = 
                activeCartesiCompute.getResult(cartesiId);
            
            if (hasResult) {
                try this._processMatchedTrades(cartesiId, resultData) {
                    processedCount++;
                } catch {
                    // Log error but continue processing other requests
                    emit CartesiProcessingError(cartesiId, "Failed to process result");
                }
            }
        }
        
        return processedCount;
    }

    /**
     * @dev Poll all active Cartesi requests and automatically process completed results
     * @return processedCount Number of successfully processed requests
     */
    function pollAndProcessAllCartesiResults() external returns (uint256 processedCount) {
        processedCount = 0;
        uint256 totalRequests = _cartesiRequestIds.current();
        
        for (uint256 i = 1; i <= totalRequests; i++) {
            // Check if request is still active
            if (activeCartesiRequests[i] == bytes32(0)) {
                continue; // Already processed or invalid
            }
            
            // Check if result is available
            (, bool hasResult, , bytes memory resultData) = 
                activeCartesiCompute.getResult(i);
            
            if (hasResult) {
                try this._processMatchedTrades(i, resultData) {
                    processedCount++;
                    emit CartesiComputationCompleted(i);
                } catch {
                    // Log error but continue processing other requests
                    emit CartesiProcessingError(i, "Failed to process result");
                }
            }
        }
        
        return processedCount;
    }

    /**
     * @dev Internal function: Process Cartesi matched trade results
     * @param _cartesiId Cartesi computation request ID
     * @param _resultData Result data
     */
    function _processMatchedTrades(uint256 _cartesiId, bytes memory _resultData) external {
        // Ensure only callable by the contract itself (for try/catch)
        require(msg.sender == address(this), "Exchange: Internal function only");
        
        require(activeCartesiRequests[_cartesiId] != bytes32(0), "Exchange: Invalid or processed Cartesi ID");
        
        MatchedTrade[] memory matchedTrades = abi.decode(_resultData, (MatchedTrade[]));

        for (uint i = 0; i < matchedTrades.length; i++) {
            MatchedTrade memory mt = matchedTrades[i];
            Order storage buyOrder = orders[mt.buyOrderId];
            Order storage sellOrder = orders[mt.sellOrderId];

            // Basic validation
            require(buyOrder.active && !buyOrder.cancelled, "Exchange: Buy order inactive");
            require(sellOrder.active && !sellOrder.cancelled, "Exchange: Sell order inactive");
            require(buyOrder.user == mt.buyer, "Exchange: Buyer mismatch");
            require(sellOrder.user == mt.seller, "Exchange: Seller mismatch");
            require(buyOrder.token == mt.token && sellOrder.token == mt.token, "Exchange: Token mismatch in trade");
            require(buyOrder.price >= mt.price && sellOrder.price <= mt.price, "Exchange: Trade price out of order bounds");
            require(mt.quantity > 0, "Exchange: Trade quantity must be positive");
            require(buyOrder.amount - buyOrder.filled >= mt.quantity, "Exchange: Buy order insufficient remaining amount");
            require(sellOrder.amount - sellOrder.filled >= mt.quantity, "Exchange: Sell order insufficient remaining amount");

            // Update filled amounts
            buyOrder.filled += mt.quantity;
            sellOrder.filled += mt.quantity;

            // Settlement: Transfer ETH from buyer to seller, transfer tokens from seller to buyer
            uint256 ethAmount = mt.quantity * mt.price;

            require(ethDeposits[mt.buyer] >= ethAmount, "Exchange: Buyer insufficient ETH for settlement");
            ethDeposits[mt.buyer] -= ethAmount;
            ethDeposits[mt.seller] += ethAmount;

            require(deposits[mt.token][mt.seller] >= mt.quantity, "Exchange: Seller insufficient tokens for settlement");
            deposits[mt.token][mt.seller] -= mt.quantity;
            deposits[mt.token][mt.buyer] += mt.quantity;

            // Record the trade
            _tradeIdsCounter.increment();
            uint256 tradeId = _tradeIdsCounter.current();
            trades[tradeId] = Trade({
                id: tradeId,
                buyOrderId: mt.buyOrderId,
                sellOrderId: mt.sellOrderId,
                buyer: mt.buyer,
                seller: mt.seller,
                token: mt.token,
                price: mt.price,
                quantity: mt.quantity,
                timestamp: block.timestamp
            });
            tradeIds.push(tradeId);
            emit TradeExecuted(tradeId, mt.buyOrderId, mt.sellOrderId, mt.buyer, mt.seller, mt.token, mt.price, mt.quantity);

            // Update order status and emit events
            if (buyOrder.filled == buyOrder.amount) {
                buyOrder.active = false;
                _removeOrderFromActiveList(mt.buyOrderId, true);
                emit OrderFilled(mt.buyOrderId, buyOrder.filled, mt.price, mt.quantity);
            } else {
                emit OrderPartiallyFilled(mt.buyOrderId, buyOrder.filled, mt.price, mt.quantity);
            }

            if (sellOrder.filled == sellOrder.amount) {
                sellOrder.active = false;
                _removeOrderFromActiveList(mt.sellOrderId, false);
                emit OrderFilled(mt.sellOrderId, sellOrder.filled, mt.price, mt.quantity);
            } else {
                emit OrderPartiallyFilled(mt.sellOrderId, sellOrder.filled, mt.price, mt.quantity);
            }
        }

        delete activeCartesiRequests[_cartesiId];
        emit CartesiResultProcessed(_cartesiId, _resultData);
    }

    // --- Helper functions / View functions ---
    function getOrder(uint256 _orderId) external view returns (Order memory) {
        return orders[_orderId];
    }

    function getEthBalance(address _user) external view returns (uint256) {
        return ethDeposits[_user];
    }

    function getTokenBalance(address _tokenAddress, address _user) external view returns (uint256) {
        return deposits[_tokenAddress][_user];
    }
    
    function getActiveBuyOrderIds() external view returns (uint256[] memory) {
        return activeBuyOrderIds;
    }

    function getActiveSellOrderIds() external view returns (uint256[] memory) {
        return activeSellOrderIds;
    }
    
    // Fallback function to receive ETH (e.g. for direct deposits not using depositETH)
    receive() external payable {
        // ethDeposits[msg.sender] += msg.value; // Or require deposits via depositETH
        // emit EthDeposited(msg.sender, msg.value);
    }

    // Fallback function for other calls (optional)
    // fallback() external payable {} // Generally not recommended unless specific use case
}
