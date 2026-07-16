// ── Flood corroboration oracle · USGS Water Services ───────────────────────
//
// This is a *corroboration* source, not a new peril. For flood claims the
// weather oracle (precipitation) is the primary signal; this asks USGS river
// gauges near the claim whether streamflow / gage height on the incident date
// was anomalously high versus a trailing baseline. Two independent sources
// agreeing is what makes the "independently verified / fraud-resistant" claim
// honest — a fabricated flood needs to beat both rainfall AND gauge records.
//
// Free, no API key. USGS Instantaneous Values (IV) retains recent data only
// (~120 days for many sites); older dates return { available: false }.

const USGS_IV = "https://waterservices.usgs.gov/nwis/iv/";
const BBOX_PAD = 0.25;
const BASELINE_DAYS = 14;
const ANOMALY_RATIO = 1.5; // incident peak must be >=1.5x the trailing median

export interface FloodResult {
  source: "USGS Water Services";
  available: boolean;
  corroborated: boolean | null; // null = no gauge data to corroborate with
  gaugeSite: string | null;
  parameter: "gage height (ft)" | "discharge (cfs)" | null;
  incidentPeak: number | null;
  baselineMedian: number | null;
  ratio: number | null;
  note: string;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function corroborateFlood(params: {
  latitude: number;
  longitude: number;
  incidentDate: string; // YYYY-MM-DD
}): Promise<FloodResult> {
  const base: FloodResult = {
    source: "USGS Water Services",
    available: false,
    corroborated: null,
    gaugeSite: null,
    parameter: null,
    incidentPeak: null,
    baselineMedian: null,
    ratio: null,
    note: "",
  };

  const { latitude, longitude, incidentDate } = params;

  const incident = new Date(`${incidentDate}T00:00:00Z`);
  if (Number.isNaN(incident.getTime())) {
    return { ...base, note: "Invalid incidentDate." };
  }
  const start = new Date(incident);
  start.setUTCDate(start.getUTCDate() - BASELINE_DAYS);
  const end = new Date(incident);
  end.setUTCDate(end.getUTCDate() + 1);

  const west = (longitude - BBOX_PAD).toFixed(4);
  const south = (latitude - BBOX_PAD).toFixed(4);
  const east = (longitude + BBOX_PAD).toFixed(4);
  const north = (latitude + BBOX_PAD).toFixed(4);

  const qs = new URLSearchParams({
    format: "json",
    bBox: `${west},${south},${east},${north}`,
    parameterCd: "00065,00060", // gage height, discharge
    startDT: start.toISOString().slice(0, 10),
    endDT: end.toISOString().slice(0, 10),
    siteStatus: "active",
  });

  try {
    const res = await fetch(`${USGS_IV}?${qs.toString()}`);
    if (!res.ok) {
      return { ...base, note: `USGS returned HTTP ${res.status}.` };
    }
    const data = await res.json();
    const series: any[] = data?.value?.timeSeries ?? [];
    if (series.length === 0) {
      return { ...base, note: "No USGS gauges with data near this location/date." };
    }

    // Prefer gage height (00065); fall back to discharge (00060).
    const pick =
      series.find((s) => s?.variable?.variableCode?.[0]?.value === "00065") ??
      series[0];
    const paramCode = pick?.variable?.variableCode?.[0]?.value;
    const values: any[] = pick?.values?.[0]?.value ?? [];
    if (values.length === 0) {
      return { ...base, available: true, note: "Gauge found but no readings in window." };
    }

    const incidentDay = incidentDate;
    const incidentVals: number[] = [];
    const baselineVals: number[] = [];
    for (const v of values) {
      const num = parseFloat(v.value);
      if (Number.isNaN(num) || num < 0) continue; // USGS uses -999999 for no-data
      const day = String(v.dateTime).slice(0, 10);
      if (day === incidentDay) incidentVals.push(num);
      else if (day < incidentDay) baselineVals.push(num);
    }

    const incidentPeak = incidentVals.length ? Math.max(...incidentVals) : null;
    const baselineMedian = median(baselineVals);
    const parameter =
      paramCode === "00065" ? "gage height (ft)" : "discharge (cfs)";
    const gaugeSite =
      pick?.sourceInfo?.siteName ??
      pick?.sourceInfo?.siteCode?.[0]?.value ??
      "unknown";

    if (incidentPeak === null || baselineMedian === null || baselineMedian === 0) {
      return {
        ...base,
        available: true,
        gaugeSite,
        parameter,
        incidentPeak,
        baselineMedian,
        note: "Insufficient data to compute a baseline anomaly.",
      };
    }

    const ratio = incidentPeak / baselineMedian;
    const corroborated = ratio >= ANOMALY_RATIO;
    return {
      source: "USGS Water Services",
      available: true,
      corroborated,
      gaugeSite,
      parameter,
      incidentPeak,
      baselineMedian: Number(baselineMedian.toFixed(3)),
      ratio: Number(ratio.toFixed(2)),
      note: corroborated
        ? `Gauge "${gaugeSite}" ${parameter} was ${ratio.toFixed(1)}x its ${BASELINE_DAYS}-day baseline on ${incidentDate}.`
        : `Gauge "${gaugeSite}" showed no anomalous rise (${ratio.toFixed(1)}x baseline).`,
    };
  } catch (err) {
    return { ...base, note: "USGS request failed." };
  }
}
