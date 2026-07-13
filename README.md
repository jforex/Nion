# Nion

**Autonomous disaster claims agent on X Layer.** Send it a damage photo and a location — it verifies the peril against weather records, scores the damage with a vision model, anchors the evidence on-chain, and releases an emergency stablecoin payout to the policyholder's wallet. One call. No adjuster.

Built for the **OKX.AI Genesis Hackathon**.

- **Live site:** https://nion-sooty.vercel.app
- **API endpoint:** `POST https://nion-sooty.vercel.app/api/triage`
- **Marketplace:** ASP **#5013** — Nion — Disaster Triage (OKX.AI)
- **Network:** X Layer testnet (chain 1952)

---

## The problem

After a disaster, property claims take months. Insurers can't staff the surge — thousands of damage photos sit in a queue while families who need emergency relief now get nothing.

## How it works

1. **Verify the peril** — Nion queries historical weather records (Open-Meteo) for the property's exact coordinates and the incident date. No severe weather on file, no claim. The event has to be independently real.
2. **Score the damage** — A vision model reports what it *observes* in the photo: missing roof covering, exposed decking, structural collapse, debris, water damage. Nion derives the damage score from those facts in code — the model never guesses a percentage.
3. **Anchor the evidence** — The photo's keccak256 fingerprint is written permanently to X Layer. The same image can never be submitted twice; the contract itself rejects it.
4. **Release relief** — If verified damage clears the 40% threshold, the contract sends stablecoin straight to the policyholder's wallet. Settled on-chain, in the same minute.

## Fraud resistance

- **Independent event verification.** Payouts only fire when third-party weather records confirm severe conditions at the exact coordinates — a claimant can't fabricate the event.
- **On-chain photo anchoring.** Every image hash is stored in the contract. Reusing a photo for a second claim reverts.
- **Single trusted settler.** `settleClaim` accepts calls from one authorized agent wallet only. No one else can move funds.
- **Derived, not guessed, scores.** The LLM reports observations; the payout math runs in code and is auditable.

---

## Use it as an API

Nion isn't only a web app — it's a callable service any agent can hire.

```bash
POST https://nion-sooty.vercel.app/api/triage
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
  "txHash":      "0xa989…d39e",
  "explorerUrl": "https://www.okx.com/web3/explorer/xlayer-test/tx/0xa989…"
}
```

An insurer's claims system loops its backlog through this endpoint — machine to machine, no UI.

---

## Architecture

contracts/            Foundry — Solidity on X Layer
src/TriageOracle.sol    Anchors photo hashes, gates payouts, settles
src/MockUSDC.sol        Test stablecoin (6 decimals)
test/                   4 passing tests: payout, rejection, duplicate, auth
web/                  Next.js (TypeScript)
app/api/triage/         Unified endpoint — the full pipeline in one call
app/api/verify-weather/ Open-Meteo peril verification
app/api/analyze-damage/ Vision scoring (Gemini)
app/api/settle/         On-chain anchor + payout
lib/damage.ts           Observations → score → payout math
lib/contracts.ts        viem clients, ABIs, addresses
app/page.tsx            Landing
app/claim/page.tsx      Retail claim flow + live tracker

## Deployed contracts (X Layer testnet, 1952)

| Contract | Address |
|---|---|
| TriageOracle | `0xA32A217a04a3222615D2705108a8EC1A2426337E` |
| MockUSDC | `0x5DA965c6777B5E0aA86367F8eF8F8644D13E02bE` |
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

```bash
npm run dev
```

---

## Current limitations

Stated plainly, because they're the next build — not hidden:

- **Testnet only.** Payouts settle in MockUSDC on X Layer testnet.
- **Single shared payout pool.** The contract is pre-funded and pays every claim from one pot, standing in for an insurer's coverage float. **Per-insurer funded pools** are the next contract iteration.
- **No per-wallet payout cap.** The duplicate-photo guard is the enforced protection today; **per-wallet caps and rate limits** are the next fraud hardening.
- **Fee not collected.** The ASP is listed at 1 USDT/call, but the endpoint doesn't yet implement the server side of **x402**, so direct calls aren't billed.
- **Weather-verified perils only.** Flood, hurricane, tornado, windstorm — anything a weather oracle can independently confirm. Fire and earthquake need different oracles (NASA FIRMS, USGS) and are roadmap.

## Roadmap

1. x402 server-side handler → real per-call billing
2. Per-insurer funded pools + per-wallet payout caps
3. Additional verification oracles (wildfire, earthquake) → new peril classes
4. Mainnet

