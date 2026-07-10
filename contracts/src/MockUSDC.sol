// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDC — a test stablecoin for the Triage Oracle demo
/// @notice Stands in for real USDC on X Layer testnet. Freely mintable by owner.
contract MockUSDC is ERC20, Ownable {
    constructor() ERC20("Mock USD Coin", "mUSDC") Ownable(msg.sender) {
        // mint 1,000,000 mUSDC to the deployer so the oracle has funds to pay out
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    /// @notice Owner can mint more tokens anytime (handy for topping up the oracle in the demo)
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice USDC uses 6 decimals, not the default 18 — we match that for realism
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}