# Nion

A parametric payout protocol on X Layer. Nion turns any verified real-world event
into an instant on-chain payout. **Disaster Triage** is the first vault: it verifies
a storm against weather records, scores property damage from a photo with a vision
model, anchors the evidence on-chain, and releases emergency stablecoin relief.

Built for the OKX.AI Genesis Hackathon.

## Architecture
- **contracts/** — Foundry project. `TriageOracle.sol` anchors photo hashes and
  gates payouts; `MockUSDC.sol` is the test stablecoin. Deployed to X Layer testnet (chain 1952).
- **web/** — Next.js app. API routes for weather verification, vision damage
  analysis, and on-chain settlement; landing page and the Disaster Triage claim flow.

## Setup
```bash
# contracts
cd contracts
forge install
forge build
forge test

# web
cd ../web
npm install
# create .env.local with:
#   AGENT_PRIVATE_KEY=0x...
#   GEMINI_API_KEY=...
npm run dev
```

## Deployed (X Layer testnet, chain 1952)
- MockUSDC: `0x5DA965c6777B5E0aA86367F8eF8F8644D13E02bE`
- TriageOracle: `0xA32A217a04a3222615D2705108a8EC1A2426337E`
