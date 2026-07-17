// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TriageOracle} from "../src/TriageOracle.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract TriageOracleTest is Test {
    MockUSDC token;
    TriageOracle oracle;

    address owner = address(this);          // the test contract deploys everything
    address agent = makeAddr("agent");      // stand-in agent wallet
    address victim = makeAddr("victim");    // stand-in policyholder

    uint256 constant PAYOUT = 1_200 * 10 ** 6; // 1,200 mUSDC (6 decimals)

    function setUp() public {
        token = new MockUSDC();
        oracle = new TriageOracle(address(token), agent);
        // fund the oracle with 100k mUSDC so it can pay claims
        token.transfer(address(oracle), 100_000 * 10 ** 6);
    }

    function test_HighDamage_Pays() public {
        bytes32 photo = keccak256("photo-A");
        vm.prank(agent); // next call is sent as the agent
        bool paid = oracle.settleClaim(victim, photo, 72, PAYOUT);
        assertTrue(paid);
        assertEq(token.balanceOf(victim), PAYOUT);
    }

    function test_LowDamage_DoesNotPay() public {
        bytes32 photo = keccak256("photo-B");
        vm.prank(agent);
        bool paid = oracle.settleClaim(victim, photo, 20, PAYOUT);
        assertFalse(paid);
        assertEq(token.balanceOf(victim), 0);
    }

    function test_DuplicatePhoto_Reverts() public {
        bytes32 photo = keccak256("photo-C");
        vm.prank(agent);
        oracle.settleClaim(victim, photo, 72, PAYOUT);

        // same photo again -> must revert
        vm.prank(agent);
        vm.expectRevert("TriageOracle: photo already used");
        oracle.settleClaim(victim, photo, 72, PAYOUT);
    }

    function test_NonAgent_Reverts() public {
        bytes32 photo = keccak256("photo-D");
        vm.prank(address(0xBAD)); // some random wallet
        vm.expectRevert("TriageOracle: caller is not the agent");
        oracle.settleClaim(victim, photo, 72, PAYOUT);
    }

    // --- bring-your-own-vault ---

    function test_VaultPayout_PaysFromVault() public {
        address vault = makeAddr("insurer-vault");
        token.transfer(vault, 10_000 * 10 ** 6);       // fund the caller's vault
        vm.prank(vault);
        token.approve(address(oracle), PAYOUT);        // vault approves the oracle

        uint256 poolBefore = token.balanceOf(address(oracle));
        bytes32 photo = keccak256("photo-vault");
        vm.prank(agent);
        bool paid = oracle.settleClaimFrom(vault, victim, photo, 72, PAYOUT);

        assertTrue(paid);
        assertEq(token.balanceOf(victim), PAYOUT);
        assertEq(token.balanceOf(vault), 10_000 * 10 ** 6 - PAYOUT);
        assertEq(token.balanceOf(address(oracle)), poolBefore); // pool untouched
    }

    function test_VaultPayout_RevertsWithoutApproval() public {
        address vault = makeAddr("broke-vault");
        token.transfer(vault, 10_000 * 10 ** 6);       // funded but NOT approved
        bytes32 photo = keccak256("photo-noapprove");
        vm.prank(agent);
        vm.expectRevert(); // ERC20 insufficient allowance
        oracle.settleClaimFrom(vault, victim, photo, 72, PAYOUT);
    }

    function test_VaultPayout_NonAgent_Reverts() public {
        address vault = makeAddr("v");
        bytes32 photo = keccak256("photo-vault-auth");
        vm.prank(address(0xBAD));
        vm.expectRevert("TriageOracle: caller is not the agent");
        oracle.settleClaimFrom(vault, victim, photo, 72, PAYOUT);
    }
}