import { NextRequest, NextResponse } from "next/server";

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

// Peril-aware thresholds. Each peril cares about different signals.
// [windGustKmh, precipitationMm] — meeting EITHER confirms severe weather,
// but the relevant one is weighted lower (easier to trip) for that peril.
const PERIL_THRESHOLDS: Record<string, { wind: number; rain: number }> = {
  "Flash Flood": { wind: 90, rain: 25 },   // rain-driven: low rain bar
  Flood: { wind: 90, rain: 25 },
  Hurricane: { wind: 55, rain: 40 },        // both matter
  Tornado: { wind: 60, rain: 100 },         // wind-driven: low wind bar
  Windstorm: { wind: 55, rain: 100 },       // wind-driven
  default: { wind: 62, rain: 30 },
};

export async function POST(req: NextRequest) {
  try {
    const { latitude, longitude, incidentDate, perilType } = await req.json();

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !incidentDate
    ) {
      return NextResponse.json(
        { error: "latitude, longitude, and incidentDate are required" },
        { status: 400 }
      );
    }

    const t = PERIL_THRESHOLDS[perilType] || PERIL_THRESHOLDS.default;

    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      start_date: incidentDate,
      end_date: incidentDate,
      daily: "wind_gusts_10m_max,precipitation_sum",
      timezone: "auto",
    });

    const res = await fetch(`${ARCHIVE_URL}?${params.toString()}`);
    if (!res.ok) {
      return NextResponse.json(
        { error: "weather service unavailable" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const gust = data?.daily?.wind_gusts_10m_max?.[0] ?? null;
    const precip = data?.daily?.precipitation_sum?.[0] ?? null;

    if (gust === null && precip === null) {
      return NextResponse.json(
        { error: "no weather data for that date/location" },
        { status: 404 }
      );
    }

    const highWind = gust !== null && gust >= t.wind;
    const heavyRain = precip !== null && precip >= t.rain;
    const stormConfirmed = highWind || heavyRain;

    let summary: string;
    if (stormConfirmed) {
      const parts: string[] = [];
      if (highWind) parts.push(`peak gusts ${gust} km/h`);
      if (heavyRain) parts.push(`${precip} mm rainfall`);
      summary = `Severe weather confirmed for ${perilType || "peril"}: ${parts.join(", ")}.`;
    } else {
      summary = `No severe weather on record (gusts ${gust ?? "n/a"} km/h, rain ${precip ?? "n/a"} mm).`;
    }

    return NextResponse.json({
      stormConfirmed,
      windGustKmh: gust,
      precipitationMm: precip,
      perilType: perilType || null,
      summary,
    });
  } catch (err) {
    console.error("verify-weather error:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
