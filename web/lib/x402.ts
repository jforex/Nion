// ── x402 payment gate (server side) ────────────────────────────────────────
//
// HONEST STATUS: OKX does NOT sit in front of this self-hosted endpoint. For a
// paid A2MCP service, THIS server is responsible for the x402 handshake:
//   1. An unpaid request gets HTTP 402 + a challenge describing what to pay.
//   2. The caller pays and retries with an `X-PAYMENT` header.
//   3. This server verifies (and settles) that payment before doing the work.
//
// Step 3 requires a facilitator that can verify/settle the payment on-chain.
// Until you point X402_FACILITATOR_URL at one, verification cannot be trusted,
// so the gate is DISABLED by default (X402_ENABLED != "true") and the endpoint
// runs open — which is fine for a testnet demo. Turn it on only once a
// facilitator is wired up; otherwise you'd 402 every caller with no way to let
// a real payment through.
//
// The 402 challenge below follows the x402 shape (https://x402.org). Amount,
// asset, network and recipient come from env so nothing is hard-coded wrong.

export function x402Enabled(): boolean {
  return process.env.X402_ENABLED === "true";
}

export interface PaymentRequired {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    maxAmountRequired: string; // base units of `asset`
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    asset: string;
    maxTimeoutSeconds: number;
    // EIP-3009 exact-scheme needs the token's EIP-712 domain so the buyer can
    // sign transferWithAuthorization. `assetTransferMethod` tells the payer CLI
    // which scheme to sign (exact + EIP-3009).
    extra: { name: string; version: string; assetTransferMethod: string };
  }>;
}

// OKX's fixed fee/settlement token on X Layer (same asset cited in the
// marketplace rejections and in this ASP's own service config).
const OKX_FEE_ASSET = "0x779ded0c9e1022225f8e0630b35a9b54be713736";
const XLAYER_CAIP2 = "eip155:196";

// Builds a spec-correct x402 v1 challenge with a POPULATED `accepts` entry —
// the two things the marketplace rejections flagged (empty accepts / no payable
// asset). A 0-fee service still advertises a zero-amount entry, never [].
//
// GO-LIVE ENV (until set, honoring payment fails closed — see verifyPayment):
//   X402_PAY_TO        your payout wallet (receives the fee)
//   X402_PRICE_BASE_UNITS  fee in base units (e.g. "1000000" = 1.0 @ 6dp; "0" = free)
//   X402_ASSET_NAME / X402_ASSET_VERSION  the fee token's EIP-712 domain (must match on-chain)
//   X402_ASSET / X402_NETWORK  override only if OKX changes the fee asset/chain
export function buildPaymentRequired(resource: string): PaymentRequired {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: process.env.X402_NETWORK ?? XLAYER_CAIP2,
        maxAmountRequired: process.env.X402_PRICE_BASE_UNITS ?? "1000000",
        resource,
        description: "Nion — Emergency Disaster Payout: one triage call (emergency relief, not final settlement).",
        mimeType: "application/json",
        payTo: process.env.X402_PAY_TO ?? "",
        asset: process.env.X402_ASSET ?? OKX_FEE_ASSET,
        maxTimeoutSeconds: 120,
        extra: {
          // Confirmed on-chain: fee token 0x779d…3736 is "USD₮0" (bridged USDT,
          // 6 decimals), EIP-712 domain version "1", supports EIP-3009.
          name: process.env.X402_ASSET_NAME ?? "USD₮0",
          version: process.env.X402_ASSET_VERSION ?? "1",
          assetTransferMethod: "eip3009",
        },
      },
    ],
  };
}

export interface PaymentVerification {
  ok: boolean;
  reason?: string;
}

// Verify the caller's payment via a configured facilitator. With no facilitator
// configured we FAIL CLOSED and say so — we never pretend an unverifiable
// payment is valid.
export async function verifyPayment(
  paymentHeader: string | null,
  resource: string
): Promise<PaymentVerification> {
  if (!paymentHeader) return { ok: false, reason: "missing X-PAYMENT header" };

  const facilitator = process.env.X402_FACILITATOR_URL;
  if (!facilitator) {
    return {
      ok: false,
      reason:
        "no X402_FACILITATOR_URL configured — cannot verify payment (failing closed).",
    };
  }

  try {
    const res = await fetch(`${facilitator.replace(/\/$/, "")}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payment: paymentHeader, resource }),
    });
    if (!res.ok) return { ok: false, reason: `facilitator HTTP ${res.status}` };
    const data = await res.json();
    return { ok: data?.valid === true, reason: data?.reason };
  } catch {
    return { ok: false, reason: "facilitator request failed" };
  }
}
