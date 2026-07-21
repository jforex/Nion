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

    // --- coverage codes (v2) ---

    // Build an insurer-signed coverage code (EIP-712) for `insurerPk`.
    function _signCode(
        uint256 insurerPk,
        address insurer,
        address policyholder,
        uint256 coverage,
        uint256 expiry,
        bytes32 nonce
    ) internal view returns (bytes memory sig) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("NionCoverage")),
                keccak256(bytes("1")),
                block.chainid,
                address(oracle)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("CoverageCode(address vault,address policyholder,uint256 coverage,uint256 expiry,bytes32 nonce)"),
                insurer, policyholder, coverage, expiry, nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(insurerPk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _fundedInsurer() internal returns (uint256 pk, address insurer) {
        (insurer, pk) = makeAddrAndKey("insurer");
        token.transfer(insurer, 10_000 * 10 ** 6);
        vm.prank(insurer);
        token.approve(address(oracle), type(uint256).max);
    }

    function test_CoverageCode_PaysCappedFromInsurerVault() public {
        (uint256 pk, address insurer) = _fundedInsurer();
        uint256 coverage = 2_000 * 10 ** 6;
        uint256 expiry = block.timestamp + 1 days;
        bytes32 nonce = keccak256("code-1");
        bytes memory sig = _signCode(pk, insurer, victim, coverage, expiry, nonce);

        bytes32 photo = keccak256("photo-code-1");
        // agent asks for MORE than coverage → must be capped to coverage
        vm.prank(agent);
        bool paid = oracle.settleClaimWithCode(insurer, victim, coverage, expiry, nonce, sig, photo, 90, 5_000 * 10 ** 6);

        assertTrue(paid);
        assertEq(token.balanceOf(victim), coverage);               // capped at coverage
        assertEq(token.balanceOf(insurer), 10_000 * 10 ** 6 - coverage);
    }

    function test_CoverageCode_RejectsReuse() public {
        (uint256 pk, address insurer) = _fundedInsurer();
        uint256 coverage = 2_000 * 10 ** 6;
        uint256 expiry = block.timestamp + 1 days;
        bytes32 nonce = keccak256("code-reuse");
        bytes memory sig = _signCode(pk, insurer, victim, coverage, expiry, nonce);

        vm.prank(agent);
        oracle.settleClaimWithCode(insurer, victim, coverage, expiry, nonce, sig, keccak256("p1"), 90, coverage);

        // same code, new photo → must revert (one claim per code)
        vm.prank(agent);
        vm.expectRevert("TriageOracle: code already used");
        oracle.settleClaimWithCode(insurer, victim, coverage, expiry, nonce, sig, keccak256("p2"), 90, coverage);
    }

    function test_CoverageCode_RejectsBadSignature() public {
        (, address insurer) = _fundedInsurer();
        (, uint256 impostorPk) = makeAddrAndKey("impostor");
        uint256 coverage = 2_000 * 10 ** 6;
        uint256 expiry = block.timestamp + 1 days;
        bytes32 nonce = keccak256("code-bad");
        // signed by the wrong key
        bytes memory sig = _signCode(impostorPk, insurer, victim, coverage, expiry, nonce);

        vm.prank(agent);
        vm.expectRevert("TriageOracle: bad coverage signature");
        oracle.settleClaimWithCode(insurer, victim, coverage, expiry, nonce, sig, keccak256("p"), 90, coverage);
    }

    function test_CoverageCode_RejectsExpired() public {
        (uint256 pk, address insurer) = _fundedInsurer();
        uint256 coverage = 2_000 * 10 ** 6;
        uint256 expiry = block.timestamp + 100;
        bytes32 nonce = keccak256("code-exp");
        bytes memory sig = _signCode(pk, insurer, victim, coverage, expiry, nonce);

        vm.warp(expiry + 1); // past expiry
        vm.prank(agent);
        vm.expectRevert("TriageOracle: code expired");
        oracle.settleClaimWithCode(insurer, victim, coverage, expiry, nonce, sig, keccak256("p"), 90, coverage);
    }
}