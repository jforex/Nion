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
  }>;
}

export function buildPaymentRequired(resource: string): PaymentRequired {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: process.env.X402_NETWORK ?? "xlayer",
        maxAmountRequired: process.env.X402_PRICE_BASE_UNITS ?? "1000000", // 1 USDC (6dp)
        resource,
        description: "Nion — Disaster Triage: one triage + settlement call.",
        mimeType: "application/json",
        payTo: process.env.X402_PAY_TO ?? "",
        asset: process.env.X402_ASSET ?? "",
        maxTimeoutSeconds: 120,
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
