import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { toHex, isAddress } from "viem";
import { TRIAGE_ORACLE_ADDRESS, xLayerTestnet } from "@/lib/contracts";

// DEMO ONLY — stands in for an insurer's backend signer. A real insurer runs
// this inside their own system with their own key (see docs/insurer-integration.md).
// The key lives server-side and is never sent to the browser.
export async function POST(req: NextRequest) {
  const key = process.env.DEMO_INSURER_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "DEMO_INSURER_KEY not configured on the server." },
      { status: 500 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { policyholder, coverageUsd, ttlSeconds = 86_400 } = body ?? {};
  if (!policyholder || !isAddress(policyholder)) {
    return NextResponse.json({ error: "valid policyholder address required" }, { status: 400 });
  }
  if (typeof coverageUsd !== "number" || coverageUsd <= 0) {
    return NextResponse.json({ error: "coverageUsd must be a positive number" }, { status: 400 });
  }

  const insurer = privateKeyToAccount(key as `0x${string}`);
  const coverage = BigInt(Math.round(coverageUsd * 1_000_000)); // USD → 6dp base units
  const expiry = BigInt(Math.floor(Date.now() / 1000) + Number(ttlSeconds));
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));

  const message = {
    vault: insurer.address,
    policyholder: policyholder as `0x${string}`,
    coverage,
    expiry,
    nonce,
  };

  const signature = await insurer.signTypedData({
    domain: {
      name: "NionCoverage",
      version: "1",
      chainId: xLayerTestnet.id,
      verifyingContract: TRIAGE_ORACLE_ADDRESS,
    },
    types: {
      CoverageCode: [
        { name: "vault", type: "address" },
        { name: "policyholder", type: "address" },
        { name: "coverage", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "CoverageCode",
    message,
  });

  return NextResponse.json({
    vault: insurer.address,
    policyholder,
    coverage: coverage.toString(),
    expiry: expiry.toString(),
    nonce,
    signature,
  });
}
