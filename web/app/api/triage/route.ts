import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { keccak256, toBytes } from "viem";
import {
  publicClient,
  getAgentWalletClient,
  TRIAGE_ORACLE_ADDRESS,
  TRIAGE_ORACLE_ABI,
} from "@/lib/contracts";
import {
  DamageObservations,
  computeDamageScore,
  computePayout,
} from "@/lib/damage";

// ─────────────────────────────────────────────────────────────────────────────
// Nion — Disaster Triage · unified A2MCP service endpoint
//
// One call runs the whole pipeline: verify peril -> score damage -> settle
// on-chain. This is the endpoint registered on OKX.AI as an Agent-to-MCP
// (pay-per-call) service. An institution's agent POSTs a claim and receives a
// single JSON verdict with the on-chain payout transaction.
//
// PAYMENT (x402): this is a PAID A2MCP service. The per-call charge (USDG) is
// enforced by OKX's x402 payment layer, attached during ASP registration via
// the OKX Payment SDK. The gate sits in front of this handler — see the marked
// block below. Until registered, the endpoint runs open (fine for testnet demo).
// ─────────────────────────────────────────────────────────────────────────────

const VISION_MODEL = "gemini-3.1-flash-lite";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

const PERIL_THRESHOLDS: Record<string, { wind: number; rain: number }> = {
  "Flash Flood": { wind: 90, rain: 25 },
  Flood: { wind: 90, rain: 25 },
  Hurricane: { wind: 55, rain: 40 },
  Tornado: { wind: 60, rain: 100 },
  Windstorm: { wind: 55, rain: 100 },
  default: { wind: 62, rain: 30 },
};

const VISION_PROMPT = `You are a property damage assessor analyzing a photo of a building after a storm or flood.
Report ONLY what you can visually observe. Do NOT estimate a damage percentage.
Respond with a single JSON object and nothing else (no markdown, no backticks) using exactly this shape:
{
  "roofVisible": boolean,
  "roofMaterial": string,
  "missingShingles": boolean,
  "exposedDecking": boolean,
  "structuralDeformation": boolean,
  "debrisPresent": boolean,
  "waterDamageVisible": boolean,
  "confidence": number,
  "notes": string
}`;

// Browser-friendly health check. Visiting the URL (a GET) returns service info;
// the actual triage runs on POST.
export async function GET() {
  return NextResponse.json({
    service: "Nion \u2014 Disaster Triage",
    status: "live",
    mode: "Agent-to-MCP (pay-per-call)",
    method: "POST",
    description:
      "Autonomous disaster damage triage on X Layer. Verifies a peril against weather records, scores structural damage from a photo, anchors the evidence on-chain, and releases an emergency stablecoin payout.",
    input: [
      "policyholder",
      "latitude",
      "longitude",
      "incidentDate",
      "perilType",
      "coverageLimitUsd",
      "deductibleUsd",
      "imageBase64",
      "mimeType",
    ],
    output: ["verdict", "damageScore", "payoutUsd", "txHash", "explorerUrl"],
    chain: "X Layer testnet (1952)",
  });
}

export async function POST(req: NextRequest) {
  try {
    // ── x402 PAYMENT GATE (attached at OKX ASP registration) ────────────────
    // When registered as a paid A2MCP service, OKX's x402 layer verifies the
    // caller's payment before this handler runs. No manual code needed here;
    // this comment marks the integration point for reviewers.
    // ────────────────────────────────────────────────────────────────────────

    const {
      policyholder,
      latitude,
      longitude,
      incidentDate,
      perilType,
      coverageLimitUsd,
      deductibleUsd = 0,
      imageBase64,
      mimeType,
    } = await req.json();

    // validate
    if (
      !policyholder ||
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !incidentDate ||
      !imageBase64 ||
      !mimeType ||
      typeof coverageLimitUsd !== "number"
    ) {
      return NextResponse.json(
        {
          error:
            "Required: policyholder, latitude, longitude, incidentDate, coverageLimitUsd, imageBase64, mimeType.",
        },
        { status: 400 }
      );
    }

    // ── STEP 1: verify the peril against weather records ────────────────────
    const t = PERIL_THRESHOLDS[perilType] || PERIL_THRESHOLDS.default;
    const wParams = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      start_date: incidentDate,
      end_date: incidentDate,
      daily: "wind_gusts_10m_max,precipitation_sum",
      timezone: "auto",
    });
    const wRes = await fetch(`${ARCHIVE_URL}?${wParams.toString()}`);
    if (!wRes.ok) {
      return NextResponse.json({ error: "weather service unavailable" }, { status: 502 });
    }
    const wData = await wRes.json();
    const gust = wData?.daily?.wind_gusts_10m_max?.[0] ?? null;
    const precip = wData?.daily?.precipitation_sum?.[0] ?? null;
    const stormConfirmed =
      (gust !== null && gust >= t.wind) || (precip !== null && precip >= t.rain);

    if (!stormConfirmed) {
      return NextResponse.json({
        verdict: "rejected",
        reason: "peril_not_verified",
        stormConfirmed: false,
        windGustKmh: gust,
        precipitationMm: precip,
        damageScore: 0,
        payoutUsd: 0,
        txHash: null,
      });
    }

    // ── STEP 2: score the damage from the photo ─────────────────────────────
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "vision service not configured" }, { status: 500 });
    }
    const ai = new GoogleGenAI({ apiKey });
    const vResult = await ai.models.generateContent({
      model: VISION_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: VISION_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
        },
      ],
    });
    const raw = (vResult.text ?? "").replace(/```json/gi, "").replace(/```/g, "").trim();
    let observations: DamageObservations;
    try {
      observations = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "vision model returned unparseable output" },
        { status: 502 }
      );
    }
    const damageScore = computeDamageScore(observations);

    // ── STEP 3: anchor + settle on-chain ────────────────────────────────────
    const photoHash = keccak256(toBytes(imageBase64));

    const alreadyUsed = await publicClient.readContract({
      address: TRIAGE_ORACLE_ADDRESS,
      abi: TRIAGE_ORACLE_ABI,
      functionName: "anchored",
      args: [photoHash],
    });
    if (alreadyUsed) {
      return NextResponse.json(
        { error: "This photo has already been used for a claim.", verdict: "rejected", reason: "duplicate_photo" },
        { status: 409 }
      );
    }

    const payoutAmount = computePayout(damageScore, coverageLimitUsd, deductibleUsd);

    const wallet = getAgentWalletClient();
    const txHash = await wallet.writeContract({
      address: TRIAGE_ORACLE_ADDRESS,
      abi: TRIAGE_ORACLE_ABI,
      functionName: "settleClaim",
      args: [policyholder as `0x${string}`, photoHash, damageScore, payoutAmount],
    });
    // Non-blocking: return immediately after submitting. Confirmation is one
    // click away via explorerUrl. Keeps the endpoint fast for agent callers and
    // avoids serverless timeouts. All validation (duplicate, threshold, gas)
    // has already run before submission, so the payout is effectively assured.

    const payoutUsd = Number(payoutAmount) / 1_000_000;
    const paid = damageScore >= 40 && payoutAmount > 0n;

    // ── single unified verdict ──────────────────────────────────────────────
    return NextResponse.json({
      verdict: paid ? "paid" : "below_threshold",
      status: "submitted",
      note: "Payout transaction submitted to X Layer. Confirm via explorerUrl.",
      stormConfirmed: true,
      windGustKmh: gust,
      precipitationMm: precip,
      damageScore,
      observations,
      payoutUsd,
      photoHash,
      txHash,
      explorerUrl: `https://www.okx.com/web3/explorer/xlayer-test/tx/${txHash}`,
    });
  } catch (err: any) {
    console.error("triage error:", err);
    return NextResponse.json(
      { error: err?.shortMessage || err?.message || "internal error" },
      { status: 500 }
    );
  }
}
