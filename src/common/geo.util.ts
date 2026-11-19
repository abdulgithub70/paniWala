const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Rectangle that fully contains the circle; used to pre-filter rows cheaply in SQL. */
export function boundingBox(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(Math.cos(toRad(lat)), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/**
 * Rough arrival range in whole minutes for a handcart. Straight-line distance is multiplied by 1.3
 * for lanes. Shown as a range because it is an estimate, not a promise.
 */
export function etaMinutesRange(distanceM: number, speedKmh = 3.5): [number, number] {
  const metersPerMin = (speedKmh * 1000) / 60;
  const base = (distanceM * 1.3) / metersPerMin;
  const low = Math.max(1, Math.round(base * 0.8));
  const high = Math.max(low + 1, Math.round(base * 1.3));
  return [low, high];
}
