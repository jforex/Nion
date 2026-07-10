import { NextRequest, NextResponse } from "next/server";

// Open-Meteo historical weather API — free, no key required.
// Docs: https://open-meteo.com/en/docs/historical-weather-api
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

// Thresholds that qualify as "severe weather" for a claim.
const WIND_GUST_THRESHOLD_KMH = 62; // ~gale force / damaging gusts
const PRECIP_THRESHOLD_MM = 30; // heavy daily rainfall (flooding risk)

export async function POST(req: NextRequest) {
  try {
    const { latitude, longitude, incidentDate } = await req.json();

    // basic validation
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

    // Ask Open-Meteo for that day's max wind gust and total precipitation.
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      start_date: incidentDate, // format: YYYY-MM-DD
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

    // Decide: did severe weather occur?
    const highWind = gust !== null && gust >= WIND_GUST_THRESHOLD_KMH;
    const heavyRain = precip !== null && precip >= PRECIP_THRESHOLD_MM;
    const stormConfirmed = highWind || heavyRain;

    // Human-readable reason for the tracker/UI.
    let summary: string;
    if (stormConfirmed) {
      const parts: string[] = [];
      if (highWind) parts.push(`peak gusts ${gust} km/h`);
      if (heavyRain) parts.push(`${precip} mm rainfall`);
      summary = `Severe weather confirmed: ${parts.join(", ")}.`;
    } else {
      summary = `No severe weather on record (gusts ${gust ?? "n/a"} km/h, rain ${precip ?? "n/a"} mm).`;
    }

    return NextResponse.json({
      stormConfirmed,
      windGustKmh: gust,
      precipitationMm: precip,
      summary,
    });
  } catch (err) {
    console.error("verify-weather error:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}