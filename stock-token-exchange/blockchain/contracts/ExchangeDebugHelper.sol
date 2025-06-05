// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Exchange.sol";

/**
 * @title ExchangeDebugHelper
 * @dev Helper contract to debug Exchange contract behavior, particularly focusing on ETH deposits and buy order placement
 */
contract ExchangeDebugHelper {
    Exchange public exchange;
    
    // Debug events
    event DebugCalc(string message, uint256 value);
    event DebugBool(string message, bool value);
    event DebugAddr(string message, address value);
    event DebugETHCalculation(
        uint256 amount,
        uint256 price,
        uint256 exactCost,
        uint256 costWithSafetyMargin,
        uint256 userBalance,
        bool hasEnoughFunds
    );    constructor(address payable _exchangeAddress) {
        exchange = Exchange(_exchangeAddress);
    }
    
    /**
     * @notice Analyze the buy order requirements and user's current ETH deposit balance
     * @dev This function doesn't modify state, just calculates and emits events for debugging
     * @param _user The user address to check
     * @param _amount The token amount for the potential buy order
     * @param _price The price per token in wei
     * @return hasEnoughFunds Whether the user has sufficient ETH deposited for this order
     * @return requiredETH The ETH required including safety margin
     * @return currentBalance The user's current ETH deposit balance
     */    function analyzeBuyOrderRequirements(
        address _user, 
        uint256 _amount, 
        uint256 _price
    ) external view returns (
        bool hasEnoughFunds, 
        uint256 requiredETH, 
        uint256 currentBalance
    ) {
        // Calculate exact cost (same calculation as in Exchange contract)
        uint256 exactCost = _amount * _price;
        
        // Add 0.5% safety margin
        uint256 safetyMargin = (exactCost * 5) / 1000;
        
        // Add additional 0.5% buffer (adding this line)
        uint256 additionalBuffer = (exactCost * 5) / 1000;
        
        // Use the full 1% margin (changing this line)
        uint256 costWithMargin = exactCost + safetyMargin + additionalBuffer;
        
        // Get user's current balance
        uint256 userBalance = exchange.ethDeposits(_user);
        
        // Check if user has enough funds
        hasEnoughFunds = (userBalance >= costWithMargin);
        
        return (hasEnoughFunds, costWithMargin, userBalance);
    }
      /**
     * @notice Calculate the actual cost for a buy order with detailed breakdown
     * @param _amount The token amount for the potential buy order
     * @param _price The price per token in wei
     * @return exactCost The exact cost without safety margin
     * @return safetyMargin The 0.5% safety margin amount
     * @return additionalBuffer The additional 0.5% buffer
     * @return totalCost The total cost including safety margin and buffer (1% total)
     */
    function calculateBuyOrderCost(
        uint256 _amount, 
        uint256 _price
    ) external pure returns (
        uint256 exactCost,
        uint256 safetyMargin,
        uint256 additionalBuffer,
        uint256 totalCost
    ) {
        exactCost = _amount * _price;
        safetyMargin = exactCost * 5 / 1000;        // 0.5% 安全邊際
        additionalBuffer = exactCost * 5 / 1000;    // 額外 0.5% 緩衝
        totalCost = exactCost + safetyMargin + additionalBuffer; // 總計 1% 緩衝
        
        return (exactCost, safetyMargin, additionalBuffer, totalCost);
    }
      /**
     * @notice Compare JavaScript-style calculation with Solidity calculation
     * @dev This helps identify potential precision or unit conversion issues between frontend and contract
     * @param _amount The token amount
     * @param _price The price per token in wei
     * @return solidityExactCost Cost calculated using Solidity's native calculation
     * @return jsStyleExactCost Cost calculated using JS-style calculation (should be same as Solidity)
     * @return solidityTotal Total with safety margin (Solidity calculation)
     * @return jsStyleTotal Total with safety margin (JS-style calculation)
     */
    function compareCalculationMethods(
        uint256 _amount,
        uint256 _price
    ) external pure returns (
        uint256 solidityExactCost,
        uint256 jsStyleExactCost,
        uint256 solidityTotal,
        uint256 jsStyleTotal
    ) {
        // Solidity native calculation
        solidityExactCost = _amount * _price;
        
        // 計算 0.5% 安全邊際
        uint256 solSafetyMargin = (solidityExactCost * 5) / 1000; // 0.5%
        // 額外 0.5% 緩衝
        uint256 solAdditionalBuffer = (solidityExactCost * 5) / 1000; // 0.5%
        // 總共 1% 緩衝
        solidityTotal = solidityExactCost + solSafetyMargin + solAdditionalBuffer;
          // JavaScript-style calculation (simulated)
        // In JS: const exactCost = amount * price (already in wei)
        jsStyleExactCost = _amount * _price;
        
        // 在 JS 中: safetyMargin = exactCost.mul(5).div(1000); // 0.5% safety margin
        // additionalBuffer = exactCost.mul(5).div(1000); // 額外 0.5% 緩衝
        // totalEthCost = exactCost.add(safetyMargin).add(additionalBuffer); // 總共 1% 緩衝
        uint256 jsSafetyMargin = (jsStyleExactCost * 5) / 1000; // 0.5%
        uint256 jsAdditionalBuffer = (jsStyleExactCost * 5) / 1000; // 0.5%
        jsStyleTotal = jsStyleExactCost + jsSafetyMargin + jsAdditionalBuffer; // 1% 總緩衝
        
        return (solidityExactCost, jsStyleExactCost, solidityTotal, jsStyleTotal);
    }
    
    /**
     * @notice Helper function to deposit ETH with debug logging
     * @dev Deposits ETH to the exchange contract and logs the before/after balances
     */
    function debugDepositETH() external payable {
        // Log balance before deposit
        uint256 balanceBefore = exchange.ethDeposits(msg.sender);
        emit DebugCalc("ETH balance before deposit", balanceBefore);
        emit DebugCalc("ETH amount to deposit", msg.value);
        
        // Deposit ETH
        exchange.depositETH{value: msg.value}();
        
        // Log balance after deposit
        uint256 balanceAfter = exchange.ethDeposits(msg.sender);
        emit DebugCalc("ETH balance after deposit", balanceAfter);
        emit DebugCalc("Balance difference", balanceAfter - balanceBefore);
    }
}
