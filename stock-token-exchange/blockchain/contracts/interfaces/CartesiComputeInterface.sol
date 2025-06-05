// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title CartesiComputeInterface
 * @dev Interface to the CartesiCompute contract with compatible Solidity version.
 * This is a simplified version of the interface that is compatible with Solidity 0.8.x.
 */
interface CartesiComputeInterface {
    // Define Drive struct for input/output drives
    struct Drive {
        uint64 position;
        uint8 driveLog2Size;
        bytes directValue;
    }
    
    // Core functions that match the original interface
    function instantiate(
        uint256 _finalTime,
        bytes32 _templateHash,
        uint64 _outputPosition,
        uint8 _outputLog2Size,
        uint256 _roundDuration,
        address[] calldata _parties,
        Drive[] calldata _drives
    ) external returns (uint256);

    function getResult(uint256 _index) external view returns (bool, bool, bytes32, bytes memory);
    
    function getState(uint256 _index) external view returns (uint8, bytes32);
    
    // Add any other methods from the original interface that you need
}
