import { NextRequest, NextResponse } from "next/server";
import { verifyAndSettle } from "@/lib/x402-facilitator";

// x402 facilitator — POST { payment: <X-PAYMENT value>, resource }.
// Verifies the buyer's EIP-3009 authorization and settles it on X Layer mainnet.
// lib/x402.ts::verifyPayment calls this at <X402_FACILITATOR_URL>/verify.
export async function POST(req: NextRequest) {
  let payment: string | undefined;
  try {
    ({ payment } = await req.json());
  } catch {
    return NextResponse.json({ valid: false, reason: "invalid JSON body" }, { status: 400 });
  }
  if (!payment) {
    return NextResponse.json({ valid: false, reason: "missing payment" }, { status: 400 });
  }

  const result = await verifyAndSettle(payment);
  // Always 200 — the JSON `valid` flag carries the outcome (the endpoint's
  // verifyPayment reads `valid`, not the HTTP status).
  return NextResponse.json(result);
}

// Keep-warm probe (cold starts caused a marketplace rejection for another ASP).
export async function GET() {
  return NextResponse.json({
    service: "Nion x402 facilitator",
    ok: true,
    configured: Boolean(process.env.X402_RELAYER_KEY && process.env.X402_PAY_TO),
    network: "eip155:196",
  });
}
