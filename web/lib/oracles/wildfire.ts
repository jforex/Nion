// ── Wildfire oracle · NASA FIRMS (VIIRS active-fire detections) ────────────
//
// Confirms a fire peril by asking NASA's Fire Information for Resource
// Management System whether any satellite fire hotspots were detected near the
// claim's coordinates on the incident date. This is an independent, non-weather
// peril source — it widens coverage beyond storms/floods into wildfire.
//
// Requires a free FIRMS map key: https://firms.modaps.eosdis.nasa.gov/api/map_key/
// Set it as FIRMS_MAP_KEY in .env.local. If absent, the oracle reports
// { available: false } and the caller decides how to handle it (never throws).
//
// NOTE: the NRT feed covers roughly the last ~2 months. Older incident dates
// fall outside NRT retention and will report available:true / confirmed:false;
// swap SOURCE to an archive product if you need deep history.

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const SOURCE = "VIIRS_SNPP_NRT";
const BBOX_PAD = 0.2; // ~22 km box around the point

export interface WildfireResult {
  source: "NASA FIRMS VIIRS";
  available: boolean;
  confirmed: boolean;
  detections: number;
  maxFrp: number | null; // Fire Radiative Power (MW) of the strongest hotspot
  note: string;
}

export async function verifyWildfire(params: {
  latitude: number;
  longitude: number;
  incidentDate: string; // YYYY-MM-DD
}): Promise<WildfireResult> {
  const base: WildfireResult = {
    source: "NASA FIRMS VIIRS",
    available: false,
    confirmed: false,
    detections: 0,
    maxFrp: null,
    note: "",
  };

  const key = process.env.FIRMS_MAP_KEY;
  if (!key) {
    return { ...base, note: "FIRMS_MAP_KEY not set — wildfire oracle disabled." };
  }

  const { latitude, longitude, incidentDate } = params;
  const west = (longitude - BBOX_PAD).toFixed(4);
  const south = (latitude - BBOX_PAD).toFixed(4);
  const east = (longitude + BBOX_PAD).toFixed(4);
  const north = (latitude + BBOX_PAD).toFixed(4);
  const area = `${west},${south},${east},${north}`;
  const url = `${FIRMS_BASE}/${key}/${SOURCE}/${area}/1/${incidentDate}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ...base, available: true, note: `FIRMS returned HTTP ${res.status}.` };
    }
    const text = (await res.text()).trim();
    // FIRMS returns CSV: a header row, then one row per detection. An error or
    // empty result is a short non-CSV body or header-only.
    if (!text || /^(no data|invalid)/i.test(text) || !text.includes(",")) {
      return { ...base, available: true, note: "No fire detections on record." };
    }

    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1);
    if (rows.length === 0) {
      return { ...base, available: true, note: "No fire detections on record." };
    }

    const frpIdx = header.indexOf("frp");
    let maxFrp: number | null = null;
    if (frpIdx >= 0) {
      for (const r of rows) {
        const v = parseFloat(r.split(",")[frpIdx]);
        if (!Number.isNaN(v)) maxFrp = maxFrp === null ? v : Math.max(maxFrp, v);
      }
    }

    return {
      source: "NASA FIRMS VIIRS",
      available: true,
      confirmed: true,
      detections: rows.length,
      maxFrp,
      note: `${rows.length} satellite fire detection(s) within ~22 km on ${incidentDate}.`,
    };
  } catch (err) {
    return { ...base, available: true, note: "FIRMS request failed." };
  }
}
