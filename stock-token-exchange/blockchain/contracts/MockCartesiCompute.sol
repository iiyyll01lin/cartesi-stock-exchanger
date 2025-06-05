// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./interfaces/CartesiComputeInterface.sol";
import "./Exchange.sol"; // Corrected: Assuming Exchange.sol is in the same directory

contract MockCartesiCompute is CartesiComputeInterface {
    // Struct definitions matching Exchange.sol for clarity and ABI compatibility
    struct CartesiOrderInput {
        uint256 id;
        address user;
        address token;
        uint256 amount;
        uint256 price;
        bool isBuyOrder;
    }

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

    struct Computation {
        bool active;
        bool hasResult;
        bytes resultData; // Store the actual result bytes
        uint8 state; // Using uint8 to represent MockComputationState
        bytes32 resultHashIfFinished; // Store hash if needed
    }

    mapping(uint256 => Computation) public computations;
    uint256 public nextComputationIndex = 1;

    // Event to notify that a computation result is ready for a specific index
    event MockComputationResultReady(uint256 indexed index, bytes result);
    
    // Events for computation lifecycle
    event ComputationRequestedBasic(
        uint256 indexed index,
        address indexed requester
    );
    
    event ComputationRequestedData(
        uint256 indexed index,
        bytes data
    );


    // Enum for ComputationState
    enum MockComputationState { 
        Inactive, // 0
        AwaitingInput, // 1
        Computing, // 2
        AwaitingConsensus, // 3 (Not really used in mock)
        WaitingForDispute, // 4 (Not really used in mock)
        ConsensusReached, // 5 (Signifies result is ready)
        ComputationFailed // 6
    }

    // Matches the 7-argument signature from CartesiComputeInterface
    function instantiate(
        uint256 /*_finalTime*/, // Mark unused parameters
        bytes32 /*_templateHash*/,
        uint64 /*_outputPosition*/,
        uint8 /*_outputLog2Size*/,
        uint256 /*_roundDuration*/,
        address[] calldata /*_parties*/,
        Drive[] calldata _drives
    ) external override returns (uint256) {
        uint256 currentIndex = nextComputationIndex++;
        computations[currentIndex] = Computation({
            active: true,
            hasResult: false,
            resultData: "",
            state: uint8(MockComputationState.Computing),
            resultHashIfFinished: bytes32(0)
        });

        emit ComputationRequestedBasic(
            currentIndex,
            msg.sender
        );
        
        // Assuming the relevant input is in the first drive's directValue
        if (_drives.length > 0 && _drives[0].directValue.length > 0) {
            emit ComputationRequestedData(currentIndex, _drives[0].directValue);
            _simulateAndSubmitResult(currentIndex, _drives[0].directValue);
        } else {
            // Handle case with no input data, perhaps set to failed or empty result
            bytes memory emptyResult = abi.encode((new Exchange.MatchedTrade[](0)));
            _submitMockResult(currentIndex, emptyResult, true); // true for success with empty result
        }

        return currentIndex;
    }

    function _simulateAndSubmitResult(uint256 _index, bytes memory _inputData) internal {
        // Decode the input data (CartesiOrderInput[] buyOrders, CartesiOrderInput[] sellOrders)
        (Exchange.CartesiOrderInput[] memory buyOrders, Exchange.CartesiOrderInput[] memory sellOrders) = 
            abi.decode(_inputData, (Exchange.CartesiOrderInput[], Exchange.CartesiOrderInput[]));

        Exchange.MatchedTrade[] memory matchedTrades = new Exchange.MatchedTrade[](1); // Max 1 trade for simplicity

        uint tradesCount = 0;
        if (buyOrders.length > 0 && sellOrders.length > 0) {
            Exchange.CartesiOrderInput memory buyOrder = buyOrders[0];
            Exchange.CartesiOrderInput memory sellOrder = sellOrders[0];

            // Simple matching logic:
            // If tokens match and buy price is greater or equal to sell price
            if (buyOrder.token == sellOrder.token && buyOrder.price >= sellOrder.price) {
                uint256 tradeQuantity = buyOrder.amount < sellOrder.amount ? buyOrder.amount : sellOrder.amount;
                if (tradeQuantity > 0) {
                    matchedTrades[0] = Exchange.MatchedTrade({
                        buyOrderId: buyOrder.id,
                        sellOrderId: sellOrder.id,
                        buyer: buyOrder.user,
                        seller: sellOrder.user,
                        token: buyOrder.token,
                        price: sellOrder.price, // Trade at sell order's price (or a defined rule)
                        quantity: tradeQuantity,
                        fee: 0 // Mock implementation - no fees calculated
                    });
                    tradesCount = 1;
                }
            }
        }
        
        Exchange.MatchedTrade[] memory finalMatchedTrades = new Exchange.MatchedTrade[](tradesCount);
        if(tradesCount > 0){
            finalMatchedTrades[0] = matchedTrades[0];
        }

        bytes memory resultBytes = abi.encode(finalMatchedTrades);
        _submitMockResult(_index, resultBytes, true); // true for success
    }
    
    // Internal function to finalize result for the mock
    function _submitMockResult(uint256 _index, bytes memory _resultData, bool _success) internal {
        require(computations[_index].active, "Computation not active");
        require(!computations[_index].hasResult, "Result already submitted");

        computations[_index].hasResult = true;
        computations[_index].resultData = _resultData;
        if (_success) {
            computations[_index].state = uint8(MockComputationState.ConsensusReached);
            computations[_index].resultHashIfFinished = keccak256(_resultData);
        } else {
            computations[_index].state = uint8(MockComputationState.ComputationFailed);
        }
        // Emit an event that the Exchange contract can listen for (or be poked by an off-chain script)
        emit MockComputationResultReady(_index, _resultData);
    }


    function getResult(uint256 _index)
        external
        view
        override
        returns (
            bool active,
            bool hasResult,
            bytes32 resultHashIfFinished,
            bytes memory resultData // Changed from original interface for mock simplicity
        )
    {
        Computation storage c = computations[_index];
        return (
            c.active,
            c.hasResult,
            c.resultHashIfFinished, // Use stored hash
            c.resultData
        );
    }

    function getState(uint256 _index) external view override returns (uint8 state, bytes32 resultHashIfFinished) {
        Computation storage c = computations[_index];
        if (!c.active) {
            return (uint8(MockComputationState.Inactive), bytes32(0));
        }
        return (c.state, c.resultHashIfFinished);
    }

    // This function is called by an external account (e.g., tests or admin) to "deliver" the result.
    // In a real Cartesi setup, the result is posted by the Cartesi node.
    // For the mock, we might not need this if _simulateAndSubmitResult directly updates state.
    // However, keeping a similar named function can be useful for test patterns.
    function submitResult(uint256 _index, bytes memory _resultData) public { 
        // For the mock, this could be called by a test script after `instantiate`
        // to simulate the asynchronous nature of Cartesi.
        // Ensure it's only called if the computation is in a state expecting a result.
        require(computations[_index].active && !computations[_index].hasResult, "Mock: Invalid state for submitResult");
        _submitMockResult(_index, _resultData, true);
    }

    // New function to allow more direct control over computation state for testing
    // This can be used by tests to push a specific result for a computation ID
    function setResult(uint256 _index, bytes memory _resultData, bool _success) external {
        // Ensure the computation was initiated
        if (!computations[_index].active && _index >= nextComputationIndex) {
            // If the index hasn't been used, create a computation entry for it
             computations[_index] = Computation({
                active: true,
                hasResult: false,
                resultData: "",
                state: uint8(MockComputationState.Computing),
                resultHashIfFinished: bytes32(0)
            });
            if (_index >= nextComputationIndex) {
                nextComputationIndex = _index + 1;
            }
        } else {
            require(computations[_index].active, "Mock: Computation not active for setResult");
        }
        _submitMockResult(_index, _resultData, _success);
    }

    // Functions below are not in CartesiComputeInterface, so remove 'override'
    function getMaximumInputSize() external pure returns (uint256) {
        return 2**20; // 1MB, arbitrary mock value
    }

    function getTemplateInfo(bytes32 /* _templateHash */) 
        external 
        pure 
        returns (
            string memory name, 
            string memory description, 
            uint64 outputSizeLimit, 
            string memory ipfsPath, 
            address provider
        ) 
    {
        return ("MockTemplate", "A mock template", 2**20, "ipfs://mock", address(0));
    }

    function getAgreementInfo(bytes32 /* _agreementId */) 
        external 
        pure 
        returns (
            uint64 disputePeriod, 
            uint256 collateralAmount, 
            address collateralToken, 
            address disputeResolver, 
            uint256 refundRatioPPM, 
            uint256 arbitrationFee
        ) 
    {
        return (1 days, 0, address(0), address(0), 0, 0);
    }

    function compute(
        uint256 _index, 
        uint256 /* _outputPosition */, 
        bytes calldata /* _nextStateHash */, 
        bytes calldata /* _outputData */, 
        bytes calldata /* _proofData */ 
    ) external payable returns (uint256) {
        require(computations[_index].active, "Computation not active or does not exist");
        require(!computations[_index].hasResult, "Computation already has a result");
        // In a real scenario, this would advance the Cartesi machine state.
        // For the mock, this function might not do much if submitResult is used.
        // However, if it's called, we can perhaps mark it as "computing" or similar.
        // For now, let's assume it's part of a more complex flow not fully mocked here.
        return _index;
    }
}
