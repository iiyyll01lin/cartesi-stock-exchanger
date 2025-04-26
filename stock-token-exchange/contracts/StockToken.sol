// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StockToken
 * @dev Basic ERC20 token representing a tradable stock (e.g., AAPL, GOOG).
 * Inherits from OpenZeppelin's ERC20 and Ownable contracts.
 * The owner (deployer) can mint new tokens.
 */
contract StockToken is ERC20, Ownable {
    /**
     * @dev Constructor sets the token name, symbol, and initial owner.
     * @param name_ The name of the token (e.g., "Apple Inc.").
     * @param symbol_ The symbol of the token (e.g., "AAPL").
     * @param initialOwner The address that will initially own the contract and have minting rights.
     */
    constructor(string memory name_, string memory symbol_, address initialOwner)
        ERC20(name_, symbol_)
        Ownable(initialOwner) // Set the deployer as the initial owner
    {}

    /**
     * @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Requirements:
     *
     * - The caller must be the owner of the contract.
     * - `account` cannot be the zero address.
     * @param account The address that will receive the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address account, uint256 amount) public onlyOwner {
        require(account != address(0), "ERC20: mint to the zero address");
        _mint(account, amount);
    }

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     * - The caller must be the owner or have sufficient allowance.
     *   (Note: This standard burn function allows anyone with allowance to burn,
     *    which might not be desired for a stock token. Consider restricting
     *    or removing if only the owner should burn.)
     * @param account The address whose tokens will be burnt.
     * @param amount The amount of tokens to burn.
     */
    function burnFrom(address account, uint256 amount) public virtual {
         // Allow burning tokens if the caller is the owner OR has allowance
        if (msg.sender != owner()) {
            _spendAllowance(account, msg.sender, amount);
        }
        _burn(account, amount);
    }

    // Optional: Override decimals if needed (default is 18)
    // function decimals() public view virtual override returns (uint8) {
    //     return 18; // Or another value if required
    // }
}
