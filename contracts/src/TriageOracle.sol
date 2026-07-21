// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title TriageOracle — disaster damage triage settlement on X Layer
/// @notice Anchors a claim's photo hash on-chain and releases an emergency
///         stablecoin payout when the agent-reported damage clears the threshold.
contract TriageOracle is Ownable, EIP712 {
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

    // --- coverage codes (v2) ---
    // An insurer signs a coverage code authorizing "up to `coverage` for this
    // policyholder, once." keccak256(vault, nonce) => already used?
    mapping(bytes32 => bool) public usedCoverageCode;
    bytes32 private constant COVERAGE_TYPEHASH = keccak256(
        "CoverageCode(address vault,address policyholder,uint256 coverage,uint256 expiry,bytes32 nonce)"
    );

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
    event CoverageClaimSettled(
        uint256 indexed claimId,
        address indexed vault,
        bytes32 codeNonce,
        uint256 coverage,
        uint256 payoutAmount
    );
    event AgentUpdated(address newAgent);

    // --- guard: only the trusted agent may call ---
    modifier onlyAgent() {
        require(msg.sender == agent, "TriageOracle: caller is not the agent");
        _;
    }

    constructor(address _payoutToken, address _agent)
        Ownable(msg.sender)
        EIP712("NionCoverage", "1")
    {
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

    /// @notice Coverage-code settlement (v2). The insurer signs a coverage code
    ///         authorizing "up to `coverage` for this policyholder, once." The
    ///         contract verifies that signature, caps the payout at `coverage`,
    ///         burns the code (one claim per code), anchors the photo (one claim
    ///         per photo), and pays from the insurer's vault. The insurer's
    ///         signing key is the vault address (which must have approved this
    ///         contract for the payout token). Separating signer from vault is a
    ///         future enhancement.
    /// @param vault        insurer address — signs the code AND funds the payout
    /// @param coverage     max releasable amount authorized by the insurer
    /// @param expiry       unix time after which the code is invalid
    /// @param codeNonce    unique per-code value (makes the code single-use)
    /// @param signature    insurer's EIP-712 signature over the coverage code
    /// @param payoutAmount agent-computed amount (capped on-chain at `coverage`)
    function settleClaimWithCode(
        address vault,
        address policyholder,
        uint256 coverage,
        uint256 expiry,
        bytes32 codeNonce,
        bytes calldata signature,
        bytes32 photoHash,
        uint8 damagePercent,
        uint256 payoutAmount
    ) external onlyAgent returns (bool paid) {
        require(vault != address(0), "TriageOracle: zero vault");
        require(block.timestamp <= expiry, "TriageOracle: code expired");
        require(!anchored[photoHash], "TriageOracle: photo already used");

        // Verify the insurer authorized this coverage (signature recovers to vault).
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(COVERAGE_TYPEHASH, vault, policyholder, coverage, expiry, codeNonce))
        );
        require(ECDSA.recover(digest, signature) == vault, "TriageOracle: bad coverage signature");

        // One claim per code.
        bytes32 codeKey = keccak256(abi.encode(vault, codeNonce));
        require(!usedCoverageCode[codeKey], "TriageOracle: code already used");

        usedCoverageCode[codeKey] = true;
        anchored[photoHash] = true;

        if (damagePercent < damageThreshold) {
            emit ClaimRejected(photoHash, damagePercent, "below threshold");
            return false;
        }

        // Never pay more than the insurer authorized.
        uint256 amount = payoutAmount > coverage ? coverage : payoutAmount;

        uint256 id = ++claimCount;
        claims[id] = Claim({
            policyholder: policyholder,
            photoHash: photoHash,
            damagePercent: damagePercent,
            payoutAmount: amount,
            timestamp: block.timestamp
        });

        require(
            payoutToken.transferFrom(vault, policyholder, amount),
            "TriageOracle: vault payout failed"
        );

        emit ClaimSettled(id, policyholder, photoHash, damagePercent, amount);
        emit CoverageClaimSettled(id, vault, codeNonce, coverage, amount);
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