import { NextRequest, NextResponse } from "next/server";
import { buildPaymentRequired, verifyPayment } from "@/lib/x402";
import { POST as runTriage } from "../route";

// ── PAID endpoint (x402). This is the "one endpoint for x402 payments" — it
// ALWAYS requires payment, independent of any env flag. Register THIS URL as the
// A2MCP paid service. Unpaid/unverifiable calls get a spec 402 challenge; a
// verified payment runs the exact same triage pipeline as the open endpoint.
//
// Verification (and settlement) is delegated to the facilitator via verifyPayment
// — which fails closed if no facilitator is configured, so nobody slips through
// unpaid and no settlement fires until you've wired X402_FACILITATOR_URL. ──────

function challenge(req: NextRequest) {
  return NextResponse.json(buildPaymentRequired(req.url), {
    status: 402,
    headers: { "x-payment-required": "true" },
  });
}

// GET always advertises the 402 challenge (discoverable on GET, as validators expect).
export async function GET(req: NextRequest) {
  return challenge(req);
}

export async function POST(req: NextRequest) {
  const payment = await verifyPayment(req.headers.get("x-payment"), req.url);
  if (!payment.ok) return challenge(req);
  // Paid — run the same triage pipeline as the open endpoint.
  return runTriage(req);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-payment",
    },
  });
}
