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
import { verifyWildfire } from "@/lib/oracles/wildfire";
import { corroborateFlood } from "@/lib/oracles/flood";
import { verifyEarthquake } from "@/lib/oracles/earthquake";

// ─────────────────────────────────────────────────────────────────────────────
// Nion — Disaster Triage · unified A2MCP service endpoint
//
// One call runs the whole pipeline: verify peril -> score damage -> settle
// on-chain. This is the endpoint registered on OKX.AI as an Agent-to-MCP
// (pay-per-call) service. An institution's agent POSTs a claim and receives a
// single JSON verdict with the on-chain payout transaction.
//
// PERIL VERIFICATION uses THREE independent oracles:
//   • weather  — open-meteo archive (primary for storm/flood perils)
//   • wildfire — NASA FIRMS active-fire detections (primary for fire perils)
//   • flood    — USGS river gauges (corroborates flood claims vs a baseline)
// A verdict of "paid" requires the peril to be independently confirmed, which
// is what makes the fraud-resistance claim real (not a single point of trust).
//
// PAYMENT (x402): this is a PAID A2MCP service. The x402 gate lives in
// lib/x402.ts and is DISABLED by default (it fails closed without a
// facilitator, so the testnet demo runs open). See that file for how to enable
// real per-call charging.
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: confirm this model id exists in the Gemini API you have access to — a
// wrong id makes every call fail at the scoring step. Override via env if needed.
const VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? "gemini-3.1-flash-lite";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

// Perils whose primary confirmation comes from the wildfire oracle.
const FIRE_PERILS = new Set(["Wildfire", "Fire", "Bushfire"]);
// Perils where a USGS gauge reading meaningfully corroborates the weather call.
const FLOOD_PERILS = new Set(["Flood", "Flash Flood"]);
// Perils confirmed by the USGS earthquake oracle (weather is irrelevant here).
const QUAKE_PERILS = new Set(["Earthquake", "Quake", "Seismic"]);

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

// x402 discovery gate. When the gate is enabled, EVERY method must be able to
// advertise the 402 challenge — validators probe GET as well as POST, and a
// non-402 (200/404/405) reads as "not a valid x402 service" (the exact reason
// two marketplace ASPs were rejected). Returns a 402 response when payment is
// required and unpaid, otherwise null (caller proceeds).
// ── OPEN endpoint. This route is always free (no x402 gate) — the "direct use"
// endpoint. The paid, x402-gated version lives at /api/triage/x402 and reuses
// this same POST pipeline after payment. ─────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    service: "Nion — Disaster Triage",
    status: "live",
    mode: "Agent-to-MCP (pay-per-call)",
    method: "POST",
    modes: {
      triage: "full pipeline — verify peril, score damage, settle payout (default)",
      verify: "peril verification only — POST { mode:'verify', latitude, longitude, incidentDate, perilType }",
    },
    description:
      "Autonomous disaster damage triage on X Layer. Independently verifies a peril (weather, wildfire, and river-gauge oracles), scores structural damage from a photo, anchors the evidence on-chain, and releases an emergency stablecoin payout.",
    oracles: ["open-meteo weather", "NASA FIRMS wildfire", "USGS river gauges", "USGS earthquake"],
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
    output: ["verdict", "damageScore", "payoutUsd", "oracles", "settlement"],
    chain: "X Layer testnet (1952)",
  });
}

// Preflight — let agent callers negotiate the x-payment header cleanly.
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

// Run the weather oracle. Returns confirmation + the raw signals.
async function verifyWeather(
  latitude: number,
  longitude: number,
  incidentDate: string,
  perilType: string
) {
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
    return { available: false, confirmed: false, windGustKmh: null, precipitationMm: null };
  }
  const wData = await wRes.json();
  const gust = wData?.daily?.wind_gusts_10m_max?.[0] ?? null;
  const precip = wData?.daily?.precipitation_sum?.[0] ?? null;
  const confirmed =
    (gust !== null && gust >= t.wind) || (precip !== null && precip >= t.rain);
  return { available: true, confirmed, windGustKmh: gust, precipitationMm: precip };
}

// Run the peril oracles concurrently and pick the primary confirmation source.
// Shared by the full triage flow and the lightweight verify-only mode.
async function runOracles(
  latitude: number,
  longitude: number,
  incidentDate: string,
  perilType: string
) {
  const isFirePeril = FIRE_PERILS.has(perilType);
  const isFloodPeril = FLOOD_PERILS.has(perilType);
  const isQuakePeril = QUAKE_PERILS.has(perilType);
  const [weather, wildfire, flood, earthquake] = await Promise.all([
    verifyWeather(latitude, longitude, incidentDate, perilType),
    isFirePeril
      ? verifyWildfire({ latitude, longitude, incidentDate })
      : Promise.resolve(null),
    isFloodPeril
      ? corroborateFlood({ latitude, longitude, incidentDate })
      : Promise.resolve(null),
    isQuakePeril
      ? verifyEarthquake({ latitude, longitude, incidentDate })
      : Promise.resolve(null),
  ]);
  // Fire → FIRMS, earthquake → USGS seismic, everything else → weather.
  const primary = isFirePeril
    ? {
        name: "wildfire",
        available: wildfire?.available ?? false,
        confirmed: wildfire?.confirmed ?? false,
      }
    : isQuakePeril
    ? {
        name: "earthquake",
        available: earthquake?.available ?? false,
        confirmed: earthquake?.confirmed ?? false,
      }
    : { name: "weather", available: weather.available, confirmed: weather.confirmed };
  const oracles = {
    weather,
    wildfire: wildfire ?? undefined,
    flood: flood ?? undefined,
    earthquake: earthquake ?? undefined,
  };
  return { oracles, primary };
}

export async function POST(req: NextRequest) {
  try {
    const {
      mode,
      policyholder,
      latitude,
      longitude,
      incidentDate,
      perilType,
      coverageLimitUsd,
      deductibleUsd = 0,
      imageBase64,
      mimeType,
      payoutVault, // optional: bring-your-own-vault — funds the payout via transferFrom
    } = await req.json();

    // ── VERIFY-ONLY MODE ────────────────────────────────────────────────────
    // mode:"verify" runs just the peril oracles (no photo, no scoring, no
    // on-chain settlement) and returns whether the event is independently real.
    // Lets agents call Nion purely for event verification.
    if (mode === "verify") {
      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        !incidentDate
      ) {
        return NextResponse.json(
          { error: "verify mode requires: latitude, longitude, incidentDate (perilType optional)." },
          { status: 400 }
        );
      }
      const { oracles, primary } = await runOracles(
        latitude,
        longitude,
        incidentDate,
        perilType ?? ""
      );
      const verdict = !primary.available
        ? "inconclusive"
        : primary.confirmed
        ? "verified"
        : "rejected";
      return NextResponse.json({
        mode: "verify",
        verdict,
        perilConfirmed: primary.confirmed,
        primarySource: primary.name,
        oracles,
      });
    }

    // validate (full triage)
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

    // ── STEP 1: verify the peril across independent oracles ─────────────────
    const { oracles, primary } = await runOracles(
      latitude,
      longitude,
      incidentDate,
      perilType
    );

    // If the primary oracle couldn't run, don't guess — return inconclusive.
    if (!primary.available) {
      return NextResponse.json({
        verdict: "inconclusive",
        reason: `${primary.name}_oracle_unavailable`,
        oracles,
        damageScore: 0,
        payoutUsd: 0,
        settlement: null,
      });
    }

    if (!primary.confirmed) {
      return NextResponse.json({
        verdict: "rejected",
        reason: "peril_not_verified",
        oracles,
        damageScore: 0,
        payoutUsd: 0,
        settlement: null,
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
    const payoutUsd = Number(payoutAmount) / 1_000_000;
    const approved = damageScore >= 40 && payoutAmount > 0n;

    // Below the damage threshold → no on-chain write, honest verdict.
    if (!approved) {
      return NextResponse.json({
        verdict: "below_threshold",
        oracles,
        damageScore,
        observations,
        payoutUsd: 0,
        photoHash,
        settlement: null,
      });
    }

    // Bring-your-own-vault: if a valid payoutVault is supplied, pull the payout
    // from it (transferFrom — the vault must have approved the contract);
    // otherwise pay from the contract's own pooled float (default).
    const useVault =
      typeof payoutVault === "string" && /^0x[0-9a-fA-F]{40}$/.test(payoutVault);

    // Submit the payout, then wait (bounded) for the receipt so we report the
    // TRUE settlement outcome — never claim "paid" for a tx we didn't confirm.
    const wallet = getAgentWalletClient();
    const txHash = useVault
      ? await wallet.writeContract({
          address: TRIAGE_ORACLE_ADDRESS,
          abi: TRIAGE_ORACLE_ABI,
          functionName: "settleClaimFrom",
          args: [payoutVault as `0x${string}`, policyholder as `0x${string}`, photoHash, damageScore, payoutAmount],
        })
      : await wallet.writeContract({
          address: TRIAGE_ORACLE_ADDRESS,
          abi: TRIAGE_ORACLE_ABI,
          functionName: "settleClaim",
          args: [policyholder as `0x${string}`, photoHash, damageScore, payoutAmount],
        });
    const explorerUrl = `https://www.okx.com/web3/explorer/xlayer-test/tx/${txHash}`;

    let settlement: {
      status: "confirmed" | "reverted" | "pending";
      txHash: string;
      explorerUrl: string;
      blockNumber?: string;
    };
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 20_000,
      });
      settlement = {
        status: receipt.status === "success" ? "confirmed" : "reverted",
        txHash,
        explorerUrl,
        blockNumber: receipt.blockNumber.toString(),
      };
    } catch {
      // Timed out waiting — the tx is still in flight, not necessarily failed.
      settlement = { status: "pending", txHash, explorerUrl };
    }

    // Verdict reflects the actual on-chain result, not just submission.
    const verdict =
      settlement.status === "confirmed"
        ? "paid"
        : settlement.status === "reverted"
        ? "settlement_failed"
        : "payout_pending";

    return NextResponse.json({
      verdict,
      oracles,
      damageScore,
      observations,
      payoutUsd,
      photoHash,
      settlement,
    });
  } catch (err: any) {
    console.error("triage error:", err);
    return NextResponse.json(
      { error: err?.shortMessage || err?.message || "internal error" },
      { status: 500 }
    );
  }
}
