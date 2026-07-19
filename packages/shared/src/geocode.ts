/**
 * Forward geocoding via OSM Nominatim (MVP; swappable for a paid provider).
 * Called from the admin approval flow only — user addresses are geocoded once
 * and only the coarse result is stored.
 */

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  city: string | null;
  neighbourhood: string | null;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    neighbourhood?: string;
    suburb?: string;
  };
}

export async function geocodeAddress(
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeResult | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=" +
    encodeURIComponent(address);
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "spectrum-app/0.1 (verification geocoding)" },
  });
  if (!res.ok) throw new Error(`geocoding failed: HTTP ${res.status}`);
  const places = (await res.json()) as NominatimPlace[];
  const place = places[0];
  if (!place) return null;
  return {
    latitude: parseFloat(place.lat),
    longitude: parseFloat(place.lon),
    city: place.address?.city ?? place.address?.town ?? place.address?.village ?? null,
    neighbourhood: place.address?.neighbourhood ?? place.address?.suburb ?? null,
  };
}
