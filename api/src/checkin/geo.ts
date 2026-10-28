const EARTH_RADIUS_M = 6_371_000;

// Haversine. Good to well under a metre at office distances, which is far
// below what phone GPS can tell apart anyway.
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// A fix worse than this can't place someone inside a typical office radius at all,
// so it is refused rather than given the benefit of the doubt.
export const MAX_ACCURACY_M = 100;

export interface Office {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export function nearestOffice(lat: number, lng: number, offices: Office[]) {
  let best: { office: Office; distance: number } | null = null;
  for (const office of offices) {
    const d = distanceM(lat, lng, office.lat, office.lng);
    if (!best || d < best.distance) best = { office, distance: d };
  }
  return best;
}
