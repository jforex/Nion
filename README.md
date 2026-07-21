# Nion

**Autonomous disaster claims agent on X Layer.** Send it a damage photo and a location — it verifies the peril across four independent oracles (weather, wildfire, earthquake, river gauges), scores the damage with a vision model, anchors the evidence on-chain, and releases an emergency stablecoin payout (the fast first tranche, not final settlement) to the policyholder's wallet. One call. No adjuster.

Built for the **OKX.AI Genesis Hackathon**.

- **Live site:** https://www.nion-snooty.xyz
- **API — open (free):** `POST https://www.nion-snooty.xyz/api/triage`
- **API — paid (x402):** `POST https://www.nion-snooty.xyz/api/triage/x402`
- **Marketplace:** ASP **#5013** — Nion — Disaster Triage (OKX.AI)
- **Networks:** peril payout settles on X Layer testnet (1952); the x402 fee settles in USD₮0 on X Layer mainnet (196)

---

## The problem

After a disaster, property claims take months. Insurers can't staff the surge — thousands of damage photos sit in a queue while families who need emergency relief now get nothing.

## How it works

1. **Verify the peril** — Nion checks the event against independent oracles for the property's exact coordinates and incident date: **weather** (Open-Meteo) for storms/floods, **wildfire** (NASA FIRMS active-fire detections) for fire perils, **earthquake** (USGS seismic events) for quakes, and **river gauges** (USGS) to corroborate flood claims against a baseline. No independent confirmation, no claim — the event has to be real.
2. **Score the damage** — A vision model reports what it *observes* in the photo: missing roof covering, exposed decking, structural collapse, debris, water damage. Nion derives the damage score from those facts in code — the model never guesses a percentage.
3. **Anchor the evidence** — The photo's keccak256 fingerprint is written permanently to X Layer. The same image can never be submitted twice; the contract itself rejects it.
4. **Release relief** — If verified damage clears the 40% threshold, the contract sends stablecoin straight to the policyholder's wallet. Settled on-chain, in the same minute.

## Fraud resistance

- **Independent event verification.** Payouts only fire when third-party records — weather, satellite fire detections, USGS earthquake events, or river-gauge readings — confirm the peril at the exact coordinates. Two agreeing sources (e.g. rainfall + gauge anomaly) are harder to fabricate than one.
- **On-chain photo anchoring.** Every image hash is stored in the contract. Reusing a photo for a second claim reverts.
- **Single trusted settler.** `settleClaim` accepts calls from one authorized agent wallet only. No one else can move funds.
- **Insurer-capped coverage.** Insurers issue a signed coverage code per policyholder; the contract verifies the signature, caps the payout at the authorized amount, and burns the code after one claim. See [docs/insurer-integration.md](docs/insurer-integration.md).
- **Derived, not guessed, scores.** The LLM reports observations; the payout math runs in code and is auditable.

---

## Use it as an API

Nion isn't only a web app — it's a callable service any agent can hire.

```bash
POST https://www.nion-snooty.xyz/api/triage
Content-Type: application/json

{
  "policyholder":     "0x9407…d38D",
  "latitude":         27.9506,
  "longitude":        -82.4572,
  "incidentDate":     "2024-10-09",
  "perilType":        "Hurricane",
  "coverageLimitUsd": 2000,
  "deductibleUsd":    100,
  "imageBase64":      "…",
  "mimeType":         "image/jpeg"
}
```

Returns:

```json
{
  "verdict":     "paid",
  "damageScore": 65,
  "payoutUsd":   1100,
  "oracles": {
    "weather": { "confirmed": true, "windGustKmh": 153, "precipitationMm": 44 }
  },
  "settlement": {
    "status":      "confirmed",
    "txHash":      "0xa989…d39e",
    "explorerUrl": "https://www.okx.com/web3/explorer/xlayer-test/tx/0xa989…",
    "blockNumber": "…"
  }
}
```

`verdict` reflects the real on-chain outcome — `paid` only after the payout tx confirms, `payout_pending` if it's still in flight, `settlement_failed` if it reverts, `rejected` / `inconclusive` if the peril isn't verified. The `oracles` object echoes each source that ran.

An insurer's claims system loops its backlog through this endpoint — machine to machine, no UI.

### Verify-only mode

Call the **same endpoint** just to confirm a peril is independently real — no photo, no damage scoring, no on-chain settlement. Useful for agents that only need event verification.

```bash
POST https://www.nion-snooty.xyz/api/triage
Content-Type: application/json

{
  "mode":         "verify",
  "latitude":     27.9506,
  "longitude":    -82.4572,
  "incidentDate": "2024-10-09",
  "perilType":    "Hurricane"
}
```

Returns:

```json
{
  "mode":          "verify",
  "verdict":       "verified",
  "perilConfirmed": true,
  "primarySource": "weather",
  "oracles": {
    "weather": { "confirmed": true, "windGustKmh": 153, "precipitationMm": 225.9 }
  }
}
```

`verdict` is `verified` / `rejected` / `inconclusive` (oracle unavailable). Fire perils use the wildfire oracle as primary; flood perils add USGS gauge corroboration.

### Bring-your-own-vault payout

By default the payout comes from the contract's pooled float. To fund it from **your own vault** instead, approve the TriageOracle contract for the payout token once, then add `"payoutVault": "0x…"` to the triage request — the payout is pulled from that vault via `transferFrom` (`settleClaimFrom`). Same fraud guards; the pool is untouched.

### Coverage codes (insurer-authorized payouts)

Instead of trusting a `coverageLimitUsd` from the caller, an insurer issues each policyholder a **signed coverage code** — an EIP-712 signature authorizing "up to `X` for this person, once." Add it to the claim:

```jsonc
"coverageCode": { "vault": "0x…", "coverage": "2000000000", "expiry": "1728…", "nonce": "0x…", "signature": "0x…" }
```

The contract (`settleClaimWithCode`) verifies the insurer's signature, **caps the payout at the signed coverage**, **burns the code** (one claim per code), pays from the insurer's vault, and emits a `CoverageClaimSettled` audit event. Insurer setup is ~10 lines — see [docs/insurer-integration.md](docs/insurer-integration.md).

### Paid access (x402)

Two endpoints, one pipeline:

- **`/api/triage`** — open, free. Direct use (full triage + verify-only mode).
- **`/api/triage/x402`** — the paid A2MCP service. Always returns an HTTP `402` challenge; a caller pays **1 USD₮0** on X Layer mainnet via **x402 (exact scheme, EIP-3009)**, then replays with an `X-PAYMENT` header and gets the same triage response.

A self-hosted facilitator (`app/api/x402/verify`) verifies the buyer's EIP-3009 authorization and settles it on-chain (`transferWithAuthorization`) to the ASP's payout wallet, with a relayer paying gas. This path is **verified end-to-end** — a real 1 USD₮0 payment settles on-chain before the service runs.

---

## Architecture

contracts/            Foundry — Solidity on X Layer
src/TriageOracle.sol    Anchors photo hashes, gates payouts, settles (pool + vault + insurer coverage codes)
src/MockUSDC.sol        Test stablecoin (6 decimals)
test/                   11 passing tests: payout, rejection, duplicate, auth, vault payout (×3), coverage codes (×4)
web/                  Next.js (TypeScript)
app/api/triage/         Open endpoint — full pipeline, free direct use
app/api/triage/x402/    Paid endpoint — always x402-gated; reuses the open pipeline after payment
app/api/verify-weather/ Open-Meteo peril verification
app/api/analyze-damage/ Vision scoring (Gemini)
app/api/settle/         On-chain anchor + payout
lib/oracles/wildfire.ts NASA FIRMS active-fire oracle (fire perils)
lib/oracles/flood.ts    USGS river-gauge flood corroboration
lib/oracles/earthquake.ts USGS seismic oracle (earthquake perils)
app/api/x402/verify/    x402 facilitator — verifies EIP-3009 auth + settles the fee on-chain
lib/x402.ts             x402 402-challenge builder + payment verification
lib/x402-facilitator.ts EIP-3009 verify + transferWithAuthorization settlement (X Layer mainnet)
lib/damage.ts           Observations → score → payout math
lib/contracts.ts        viem clients, ABIs, addresses
app/page.tsx            Landing
app/claim/page.tsx      Live demo claim flow + tracker

## Deployed contracts (X Layer testnet, 1952)

| Contract | Address |
|---|---|
| TriageOracle | `0x91fa736435D841C46a99c27899324F0f3FfCe6Fc` |
| MockUSDC | `0x8E8d3371E2976EF4aaEF9307663c33B728A4f61E` |
| Agent (sole settler) | `0xe1Bce02897b329D8354cacE36831A12A624c4f8D` |

## Payout logic

Severity bands a fraction of the registered coverage limit, minus the deductible:

| Damage score | Released |
|---|---|
| ≥ 80% | 100% of coverage |
| ≥ 60% | 60% |
| ≥ 40% | 30% |
| < 40% | nothing |

This is **parametric emergency triage — the fast first tranche — not final claim settlement.** Final settlement stays with the insurer.

---

## Run it locally

```bash
# contracts
cd contracts
forge install
forge build
forge test

# web
cd ../web
npm install
```

Create `web/.env.local`:

AGENT_PRIVATE_KEY=0x…      # the wallet authorized to call settleClaim
GEMINI_API_KEY=AIza…       # free tier at aistudio.google.com
FIRMS_MAP_KEY=…            # optional — free at firms.modaps.eosdis.nasa.gov (enables the wildfire oracle)

```bash
npm run dev
```

---

## Current limitations

Stated plainly, because they're the next build — not hidden:

- **Testnet only.** Payouts settle in MockUSDC on X Layer testnet.
- **Payout funding.** Two modes: the contract's shared pre-funded pool (default), or **bring-your-own-vault** — pass `payoutVault` and the payout is pulled from the caller's own vault via `transferFrom` (the vault approves the contract once). Per-insurer isolated pools are the next iteration.
- **No per-wallet payout cap.** The duplicate-photo guard is the enforced protection today; **per-wallet caps and rate limits** are the next fraud hardening.
- **Testnet payout vs. mainnet fee.** The **x402 fee is live and real** — the paid endpoint charges 1 USD₮0 on X Layer **mainnet**, verified end-to-end (a real payment settles via the facilitator). But the **triage payout** it gates still settles in MockUSDC on X Layer **testnet**. Aligning both on mainnet is the migration step.
- **Peril coverage.** Weather (storms/floods), wildfire (NASA FIRMS), earthquake (USGS seismic), and USGS gauge flood corroboration are all live. Note FIRMS NRT data covers only ~the last two months, and the wildfire oracle is inert without `FIRMS_MAP_KEY`.

## Roadmap

1. Per-insurer funded pools + per-wallet payout caps
2. Mainnet + real stablecoin settlement

