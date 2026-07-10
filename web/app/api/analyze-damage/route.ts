import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  DamageObservations,
  computeDamageScore,
} from "@/lib/damage";

const MODEL = "gemini-3.1-flash-lite";

// Strict instruction: report observations as JSON only, no prose, no score.
const SYSTEM_PROMPT = `You are a property damage assessor analyzing a photo of a building after a storm or flood.
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
}
- roofVisible: is any roof surface visible in the image?
- roofMaterial: best guess ("asphalt shingle", "metal", "tile", "unknown").
- missingShingles: are patches of roof covering clearly gone?
- exposedDecking: is bare wood/underlayment exposed where covering is missing?
- structuralDeformation: sagging, collapse, holes through the structure?
- debrisPresent: scattered building material or fallen trees on/around the structure?
- waterDamageVisible: staining, waterlines, or standing water?
- confidence: your 0-1 confidence in this assessment.
- notes: one short sentence describing what you see.`;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: "imageBase64 and mimeType are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not set" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: SYSTEM_PROMPT },
            { inlineData: { mimeType, data: imageBase64 } },
          ],
        },
      ],
    });

    const raw = result.text ?? "";

    // strip any stray markdown fences just in case
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

    let observations: DamageObservations;
    try {
      observations = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse model output:", raw);
      return NextResponse.json(
        { error: "vision model returned unparseable output", raw },
        { status: 502 }
      );
    }

    const damageScore = computeDamageScore(observations);

    return NextResponse.json({ observations, damageScore });
  } catch (err) {
    console.error("analyze-damage error:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
