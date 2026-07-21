# Insurer integration — coverage codes

To let your policyholders file emergency claims through Nion, you don't upload
your policy book or expose a database. You issue each covered policyholder a
short **coverage code**: an EIP-712 signature authorizing "release up to `X` for
this person, once." Nion's contract verifies your signature, caps the payout at
that amount, and burns the code after one claim.

Your integration is two things: **fund a vault once**, and **sign a code per
policyholder** (automated in your backend). No human in the loop per claim.

---

## What a coverage code authorizes

You sign this struct. The contract enforces every field.

| Field | Meaning |
|---|---|
| `vault` | Your address — it both **signs** the code and **funds** the payout |
| `policyholder` | Wallet that will receive the emergency payout |
| `coverage` | Max releasable amount, in token base units (USD₮0 = 6 decimals, so `2000` USD = `2000000000`) |
| `expiry` | Unix seconds after which the code is invalid |
| `nonce` | A unique 32-byte value — makes the code single-use |

> **Note (current version):** the signing key and the funding vault are the
> **same address**. A separate signer key is a planned enhancement.

---

## One-time setup

1. **Fund your vault** with the payout token (USD₮0 / the configured stablecoin).
2. **Approve** the TriageOracle contract to spend from it:

```ts
// once, from the vault
await token.write.approve([TRIAGE_ORACLE, maxUint256]);
```

---

## Sign a coverage code (the ~10 lines)

```ts
import { privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem";

const insurer = privateKeyToAccount(process.env.INSURER_KEY); // = your vault

async function issueCode(policyholder, coverageUsd, ttlSeconds = 86_400) {
  const code = {
    vault: insurer.address,
    policyholder,
    coverage: BigInt(Math.round(coverageUsd * 1_000_000)), // USD → 6-dp base units
    expiry: BigInt(Math.floor(Date.now() / 1000) + ttlSeconds),
    nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
  };
  const signature = await insurer.signTypedData({
    domain: { name: "NionCoverage", version: "1", chainId: 1952, verifyingContract: TRIAGE_ORACLE },
    types: { CoverageCode: [
      { name: "vault", type: "address" }, { name: "policyholder", type: "address" },
      { name: "coverage", type: "uint256" }, { name: "expiry", type: "uint256" },
      { name: "nonce", type: "bytes32" } ] },
    primaryType: "CoverageCode",
    message: code,
  });
  return { ...code, coverage: code.coverage.toString(), expiry: code.expiry.toString(), signature };
}
```

That's the whole insurer side. Call `issueCode(...)` per policyholder — thousands
per second, no human involved. Hand the returned object to the policyholder (in
your app / policy docs).

---

## Filing a claim (policyholder → Nion)

The claim POSTs the photo + location **and** the coverage code:

```jsonc
POST https://www.nion-snooty.xyz/api/triage
{
  "policyholder":  "0x…",
  "latitude":      27.9506,
  "longitude":     -82.4572,
  "incidentDate":  "2024-10-09",
  "perilType":     "Hurricane",
  "imageBase64":   "…",
  "mimeType":      "image/jpeg",
  "coverageCode": {                 // ← the signed code from issueCode()
    "vault":     "0x…",
    "coverage":  "2000000000",
    "expiry":    "1728…",
    "nonce":     "0x…",
    "signature": "0x…"
  }
}
```

Nion then: verifies your signature → verifies the peril (oracles) → scores the
photo → pays **from your vault, capped at `coverage`, once** → returns the
verdict + on-chain tx.

---

## What the contract guarantees you

- **Never overpays** — payout is `min(assessed, coverage)`; the signed cap wins.
- **One claim per code** — the code is burned on use (`usedCoverageCode`).
- **One claim per photo** — image hash anchored on-chain.
- **Only real perils pay** — independent oracle confirmation required.
- **Auditable** — every payout emits `CoverageClaimSettled(claimId, vault, nonce, coverage, amount)`.

## Reference (current deployment — X Layer testnet)

| | |
|---|---|
| TriageOracle (`verifyingContract`) | `0x91fa736435D841C46a99c27899324F0f3FfCe6Fc` |
| chainId | `1952` |
| EIP-712 domain | name `NionCoverage`, version `1` |
| Payout token | MockUSDC `0x8E8d3371E2976EF4aaEF9307663c33B728A4f61E` (6 decimals) |

Update `verifyingContract` / `chainId` / token when the contract moves to another
network.
