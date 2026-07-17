# x402 Facilitator — build spec (Phase 2)

Status: **BUILT — untested with real funds.** Code lives in
`web/lib/x402-facilitator.ts` + `web/app/api/x402/verify/route.ts`. Verified in
dev: a signed EIP-3009 auth passes all field + signature checks and reaches
settlement (stops only on "insufficient gas" with an unfunded relayer). To go
live it moves real funds on X Layer **mainnet (eip155:196)** — fund a relayer
and run a real buyer test first.

## Go-live env (set in Vercel, then redeploy)
| Var | Value |
|---|---|
| `X402_ENABLED` | `true` |
| `X402_FACILITATOR_URL` | `https://nion-sooty.vercel.app/api/x402` (verifyPayment appends `/verify`) |
| `X402_RELAYER_KEY` | private key of a wallet holding **OKB for gas** on X Layer mainnet (submits settlement) |
| `X402_PAY_TO` | your payout wallet — MUST equal the `to` in buyer authorizations |
| `X402_PRICE_BASE_UNITS` | `1000000` (1.0 USD₮0 @ 6dp) |

⚠️ The settlement call uses the **bytes-signature** `transferWithAuthorization`
variant. If USD₮0 only exposes the `(v,r,s)` variant, the tx reverts — swap the
ABI in `lib/x402-facilitator.ts`. Confirm during the first real buyer test.

The client-side (buyer) tooling is provided by OKX (`onchainos payment pay`).
There is **no OKX-hosted seller facilitator** — the seller (you) redeems the
buyer's signed authorization on-chain. That's what this service does.

---

## What it does

A buyer hits your endpoint → gets the 402 challenge (already implemented) →
signs an **EIP-3009 exact-scheme** authorization for the OKX fee token → replays
with an `X-PAYMENT` header. Your endpoint calls this facilitator's `/verify`
before serving; on success it serves the deliverable.

```
buyer ──POST (no pay)──▶ /api/triage ──402 + accepts──▶ buyer
buyer ──sign EIP-3009 auth──▶ (onchainos payment pay)
buyer ──POST + X-PAYMENT──▶ /api/triage ──/verify──▶ facilitator ──settle on-chain──▶ ok
                                        ◀── {valid:true, txHash} ──
             ◀── deliverable (triage verdict) ──
```

## Endpoints

### `POST /verify`
Body: `{ payment: <X-PAYMENT header value>, resource: <url> }`
1. Decode the base64 `payment` → `{ scheme, network, payload:{ authorization, signature } }`.
2. Reject unless `scheme == "exact"`, `network == "eip155:196"`, `asset == OKX_FEE_ASSET`.
3. Verify the **EIP-3009** signature (`transferWithAuthorization` typed data):
   domain `{ name, version, chainId:196, verifyingContract: asset }`, and
   `authorization.{from,to,value,validAfter,validBefore,nonce}`. `to` MUST equal
   your `X402_PAY_TO`; `value` MUST be ≥ the advertised amount; now within
   `[validAfter, validBefore]`; `nonce` unused.
4. **Settle:** submit `transferWithAuthorization(from,to,value,validAfter,validBefore,nonce,v,r,s)`
   to the fee-token contract from a funded relayer wallet. Wait for receipt.
5. Return `{ valid:true, txHash }` on success; `{ valid:false, reason }` otherwise.

`web/lib/x402.ts::verifyPayment` already POSTs here and reads `valid`/`reason`.

### `GET /health` → `{ ok:true }` (keep it warm — cold starts caused a rejection).

## On-chain settlement

- **Token:** `0x779ded0c9e1022225f8e0630b35a9b54be713736` (OKX fee asset, X Layer).
- **Must support EIP-3009** (`transferWithAuthorization`). ⚠️ **Verify this on-chain
  before building** — if it doesn't, the exact+EIP-3009 scheme won't work and
  you'd need Permit2/`upto` instead.
- **Relayer wallet:** holds OKB for gas; submits the settlement tx. Separate hot
  key. Fund it, monitor balance.
- **Replay protection:** the EIP-3009 `nonce` is single-use on-chain; also cache
  used nonces locally to fail fast.

## Required env (set on the endpoint once facilitator is live)

| Var | Value |
|---|---|
| `X402_ENABLED` | `true` |
| `X402_FACILITATOR_URL` | your facilitator base URL |
| `X402_PAY_TO` | your payout wallet (receives fees) |
| `X402_PRICE_BASE_UNITS` | fee in base units (`"1000000"`=1.0 @6dp; `"0"`=free) |
| `X402_ASSET_NAME` / `X402_ASSET_VERSION` | the fee token's **real** EIP-712 domain — **confirm on-chain**, defaults `USDT`/`2` are guesses |
| `X402_ASSET` / `X402_NETWORK` | override only if OKX changes asset/chain |

## Fee token — CONFIRMED on-chain (X Layer mainnet 196)
- Asset `0x779ded0c9e1022225f8e0630b35a9b54be713736` = **USD₮0** (bridged USDT).
- **EIP-3009: yes** — `DOMAIN_SEPARATOR` present and matches the standard
  4-field EIP-712 domain, so `transferWithAuthorization` (exact scheme) works.
- **EIP-712 domain:** `name = "USD₮0"`, `version = "1"` (verified by reproducing
  the on-chain `DOMAIN_SEPARATOR`). These are now the defaults in `lib/x402.ts`.
- **decimals = 6** → `X402_PRICE_BASE_UNITS="1000000"` for a 1.0 fee.

Nothing left to confirm on the token. The facilitator just needs a funded
relayer wallet and the `/verify` + `/settle` logic below.

## Definition of done
- `onchainos agent x402-validate` passes against the live endpoint.
- A real buyer completes: 402 → sign → replay → **on-chain settlement (txHash)** →
  deliverable returned. Test end-to-end **before** re-listing.

## Queue note
Building + running this does **not** affect the review queue. Only an
`agent update #5013` that changes the **fee or description** re-queues — do that
last, deliberately, once this is proven live.
