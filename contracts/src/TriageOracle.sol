// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TriageOracle — disaster damage triage settlement on X Layer
/// @notice Anchors a claim's photo hash on-chain and releases an emergency
///         stablecoin payout when the agent-reported damage clears the threshold.
contract TriageOracle is Ownable {
    // --- configuration ---
    IERC20 public immutable payoutToken;      // the mUSDC we pay out in
    address public agent;                     // ONLY address allowed to settle claims
    uint256 public damageThreshold = 40;      // minimum damage % to trigger payout

    // --- claim records ---
    // photoHash => has it already been anchored? (blocks re-using the same photo)
    mapping(bytes32 => bool) public anchored;

    struct Claim {
        address policyholder;
        bytes32 photoHash;
        uint8 damagePercent;
        uint256 payoutAmount;
        uint256 timestamp;
    }
    // claimId => claim record
    mapping(uint256 => Claim) public claims;
    uint256 public claimCount;

    // --- events (so the frontend/explorer can watch what happened) ---
    event ClaimSettled(
        uint256 indexed claimId,
        address indexed policyholder,
        bytes32 photoHash,
        uint8 damagePercent,
        uint256 payoutAmount
    );
    event ClaimRejected(bytes32 photoHash, uint8 damagePercent, string reason);
    event ClaimSettledFromVault(
        uint256 indexed claimId,
        address indexed vault,
        address indexed policyholder,
        uint256 payoutAmount
    );
    event AgentUpdated(address newAgent);

    // --- guard: only the trusted agent may call ---
    modifier onlyAgent() {
        require(msg.sender == agent, "TriageOracle: caller is not the agent");
        _;
    }

    constructor(address _payoutToken, address _agent) Ownable(msg.sender) {
        payoutToken = IERC20(_payoutToken);
        agent = _agent;
    }

    /// @notice The agent submits a triage result. If damage clears the threshold
    ///         and the photo hasn't been used before, funds are sent immediately.
    /// @param policyholder wallet that receives the emergency payout
    /// @param photoHash    keccak256 hash of the submitted photo
    /// @param damagePercent agent-computed damage score (0-100)
    /// @param payoutAmount  amount of mUSDC to send (in token units, 6 decimals)
    function settleClaim(
        address policyholder,
        bytes32 photoHash,
        uint8 damagePercent,
        uint256 payoutAmount
    ) external onlyAgent returns (bool paid) {
        // fraud guard 1: this exact photo must not have been claimed before
        require(!anchored[photoHash], "TriageOracle: photo already used");

        // anchor the hash permanently no matter the outcome
        anchored[photoHash] = true;

        // fraud guard 2: damage must clear the threshold to pay
        if (damagePercent < damageThreshold) {
            emit ClaimRejected(photoHash, damagePercent, "below threshold");
            return false;
        }

        // record and pay
        uint256 id = ++claimCount;
        claims[id] = Claim({
            policyholder: policyholder,
            photoHash: photoHash,
            damagePercent: damagePercent,
            payoutAmount: payoutAmount,
            timestamp: block.timestamp
        });

        require(
            payoutToken.transfer(policyholder, payoutAmount),
            "TriageOracle: payout transfer failed"
        );

        emit ClaimSettled(id, policyholder, photoHash, damagePercent, payoutAmount);
        return true;
    }

    /// @notice Bring-your-own-vault settlement. Identical fraud guards to
    ///         settleClaim, but the payout is pulled from `vault` via
    ///         transferFrom instead of the contract's own pooled float. The
    ///         vault owner must have approved this contract for at least
    ///         `payoutAmount` of the payout token beforehand.
    /// @param vault the caller-controlled address funding this payout
    function settleClaimFrom(
        address vault,
        address policyholder,
        bytes32 photoHash,
        uint8 damagePercent,
        uint256 payoutAmount
    ) external onlyAgent returns (bool paid) {
        require(vault != address(0), "TriageOracle: zero vault");
        require(!anchored[photoHash], "TriageOracle: photo already used");

        anchored[photoHash] = true;

        if (damagePercent < damageThreshold) {
            emit ClaimRejected(photoHash, damagePercent, "below threshold");
            return false;
        }

        uint256 id = ++claimCount;
        claims[id] = Claim({
            policyholder: policyholder,
            photoHash: photoHash,
            damagePercent: damagePercent,
            payoutAmount: payoutAmount,
            timestamp: block.timestamp
        });

        // Pull from the caller's vault (needs prior approve on this contract).
        require(
            payoutToken.transferFrom(vault, policyholder, payoutAmount),
            "TriageOracle: vault payout failed"
        );

        emit ClaimSettled(id, policyholder, photoHash, damagePercent, payoutAmount);
        emit ClaimSettledFromVault(id, vault, policyholder, payoutAmount);
        return true;
    }

    // --- admin ---

    /// @notice Owner can rotate the agent wallet if needed.
    function setAgent(address _agent) external onlyOwner {
        agent = _agent;
        emit AgentUpdated(_agent);
    }

    /// @notice Owner can adjust the payout threshold.
    function setDamageThreshold(uint256 _threshold) external onlyOwner {
        require(_threshold <= 100, "TriageOracle: threshold > 100");
        damageThreshold = _threshold;
    }

    /// @notice Owner can withdraw leftover tokens (e.g. to reclaim the float).
    function withdraw(uint256 amount) external onlyOwner {
        require(payoutToken.transfer(owner(), amount), "TriageOracle: withdraw failed");
    }
}