// ── Earthquake oracle · USGS FDSN event API ────────────────────────────────
//
// Confirms a seismic peril by asking USGS whether an earthquake of at least a
// minimum magnitude occurred near the claim's coordinates on the incident date.
// Free, no API key, authoritative, global — a new peril class beyond weather
// and wildfire.

const USGS_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const RADIUS_KM = 150; // felt-damage radius around the property
const MIN_MAGNITUDE = 4.0; // below ~M4 rarely causes structural damage

export interface EarthquakeResult {
  source: "USGS Earthquake";
  available: boolean;
  confirmed: boolean;
  maxMagnitude: number | null;
  place: string | null;
  note: string;
}

export async function verifyEarthquake(params: {
  latitude: number;
  longitude: number;
  incidentDate: string; // YYYY-MM-DD
}): Promise<EarthquakeResult> {
  const base: EarthquakeResult = {
    source: "USGS Earthquake",
    available: false,
    confirmed: false,
    maxMagnitude: null,
    place: null,
    note: "",
  };

  const { latitude, longitude, incidentDate } = params;

  const day = new Date(`${incidentDate}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return { ...base, note: "Invalid incidentDate." };
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);

  const qs = new URLSearchParams({
    format: "geojson",
    starttime: incidentDate,
    endtime: next.toISOString().slice(0, 10),
    latitude: String(latitude),
    longitude: String(longitude),
    maxradiuskm: String(RADIUS_KM),
    minmagnitude: String(MIN_MAGNITUDE),
    orderby: "magnitude",
  });

  try {
    const res = await fetch(`${USGS_QUERY}?${qs.toString()}`);
    if (!res.ok) {
      return { ...base, available: true, note: `USGS returned HTTP ${res.status}.` };
    }
    const data = await res.json();
    const features: any[] = data?.features ?? [];
    if (features.length === 0) {
      return {
        ...base,
        available: true,
        note: `No M${MIN_MAGNITUDE}+ earthquake within ${RADIUS_KM} km on ${incidentDate}.`,
      };
    }

    // orderby=magnitude → strongest first.
    const top = features[0];
    const maxMagnitude = typeof top?.properties?.mag === "number" ? top.properties.mag : null;
    const place = top?.properties?.place ?? null;

    return {
      source: "USGS Earthquake",
      available: true,
      confirmed: true,
      maxMagnitude,
      place,
      note: `M${maxMagnitude} earthquake ${place ? `(${place})` : ""} within ${RADIUS_KM} km on ${incidentDate}.`,
    };
  } catch {
    return { ...base, available: true, note: "USGS earthquake request failed." };
  }
}
