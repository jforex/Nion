// ── x402 facilitator core (Phase 2) ────────────────────────────────────────
//
// Verifies a buyer's EIP-3009 "exact" authorization for the OKX fee token
// (USD₮0 on X Layer mainnet) and SETTLES it on-chain via transferWithAuthorization,
// moving the fee to X402_PAY_TO. Returns { valid, txHash } so the endpoint can
// serve the deliverable.
//
// ⚠️ REAL MAINNET MONEY. Fails closed unless X402_RELAYER_KEY + X402_PAY_TO are
// set. Not exercised end-to-end yet — run a real buyer + `x402-validate` before
// trusting it (see docs/x402-facilitator.md).

import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  recoverTypedDataAddress,
  getAddress,
  isAddress,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const FEE_ASSET = (process.env.X402_ASSET ??
  "0x779ded0c9e1022225f8e0630b35a9b54be713736") as `0x${string}`;
const ASSET_NAME = process.env.X402_ASSET_NAME ?? "USD₮0";
const ASSET_VERSION = process.env.X402_ASSET_VERSION ?? "1";
const REQUIRED_UNITS = BigInt(process.env.X402_PRICE_BASE_UNITS ?? "1000000");
const RPC_URL = process.env.X402_RPC_URL ?? "https://rpc.xlayer.tech";

// X Layer mainnet — where the OKX fee token lives.
const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

// EIP-3009. Modern tokens (USD₮0) take a packed `bytes` signature.
const EIP3009_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
]);

export interface SettleResult {
  valid: boolean;
  txHash?: string;
  reason?: string;
}

// Decode the X-PAYMENT header (base64 JSON) into the exact-scheme fields we need.
// Tolerant of the common x402 v1/v2 payload shapes.
function decodePayment(header: string):
  | {
      scheme?: string;
      network?: string;
      authorization: {
        from: `0x${string}`;
        to: `0x${string}`;
        value: bigint;
        validAfter: bigint;
        validBefore: bigint;
        nonce: `0x${string}`;
      };
      signature: `0x${string}`;
    }
  | { error: string } {
  try {
    const json = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    const p = json.payload ?? json;
    const a = p.authorization ?? p;
    const sig = (p.signature ?? json.signature) as `0x${string}`;
    if (!a || !sig) return { error: "payload missing authorization or signature" };
    return {
      scheme: json.scheme ?? p.scheme,
      network: json.network ?? p.network,
      authorization: {
        from: getAddress(a.from),
        to: getAddress(a.to),
        value: BigInt(a.value),
        validAfter: BigInt(a.validAfter ?? 0),
        validBefore: BigInt(a.validBefore),
        nonce: a.nonce as `0x${string}`,
      },
      signature: sig,
    };
  } catch (e: any) {
    return { error: `undecodable X-PAYMENT header: ${e?.message ?? e}` };
  }
}

export async function verifyAndSettle(paymentHeader: string): Promise<SettleResult> {
  const payTo = process.env.X402_PAY_TO;
  // Normalize the relayer key — tolerate stray quotes/whitespace and a missing
  // 0x prefix from env paste, then validate it's a real 32-byte hex key.
  let relayerKey = process.env.X402_RELAYER_KEY?.trim().replace(/^['"]|['"]$/g, "");
  if (relayerKey && !relayerKey.startsWith("0x")) relayerKey = "0x" + relayerKey;
  if (!payTo || !isAddress(payTo)) {
    return { valid: false, reason: "facilitator not configured (X402_PAY_TO)" };
  }
  if (!relayerKey || !/^0x[0-9a-fA-F]{64}$/.test(relayerKey)) {
    return {
      valid: false,
      reason: "X402_RELAYER_KEY is not a valid 32-byte hex private key — check the Vercel env value (0x + 64 hex chars, no quotes/spaces)",
    };
  }

  const decoded = decodePayment(paymentHeader);
  if ("error" in decoded) return { valid: false, reason: decoded.error };
  const { authorization: auth, signature } = decoded;

  // ── Field checks (before spending gas) ──────────────────────────────────
  if (getAddress(auth.to) !== getAddress(payTo)) {
    return { valid: false, reason: "authorization 'to' is not our payTo" };
  }
  if (auth.value < REQUIRED_UNITS) {
    return { valid: false, reason: `underpaid: ${auth.value} < required ${REQUIRED_UNITS}` };
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < auth.validAfter || now >= auth.validBefore) {
    return { valid: false, reason: "authorization outside its valid time window" };
  }

  // ── Verify the EIP-3009 signature recovers to `from` ────────────────────
  let signer: string;
  try {
    signer = await recoverTypedDataAddress({
      domain: { name: ASSET_NAME, version: ASSET_VERSION, chainId: 196, verifyingContract: FEE_ASSET },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: auth.from,
        to: auth.to,
        value: auth.value,
        validAfter: auth.validAfter,
        validBefore: auth.validBefore,
        nonce: auth.nonce,
      },
      signature,
    });
  } catch (e: any) {
    return { valid: false, reason: `signature recovery failed: ${e?.message ?? e}` };
  }
  if (getAddress(signer) !== getAddress(auth.from)) {
    return { valid: false, reason: "signature does not match 'from'" };
  }

  // ── Settle on-chain ─────────────────────────────────────────────────────
  try {
    const account = privateKeyToAccount(relayerKey as `0x${string}`);
    const wallet = createWalletClient({ account, chain: xLayer, transport: http(RPC_URL) });
    const publicClient = createPublicClient({ chain: xLayer, transport: http(RPC_URL) });

    const txHash = await wallet.writeContract({
      address: FEE_ASSET,
      abi: EIP3009_ABI,
      functionName: "transferWithAuthorization",
      args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, signature],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
    if (receipt.status !== "success") {
      return { valid: false, txHash, reason: "settlement tx reverted" };
    }
    return { valid: true, txHash };
  } catch (e: any) {
    return { valid: false, reason: `settlement failed: ${e?.shortMessage ?? e?.message ?? e}` };
  }
}
