import type { LatLng } from './settings.ts';

const R = 6371000; // Earth radius in meters
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Distance between two points in meters (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing from a to b in degrees (0 = north, 90 = east). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `meters` away from `from` in direction `bearing` (degrees). */
export function offsetPoint(from: LatLng, meters: number, bearing: number): LatLng {
  const d = meters / R;
  const b = rad(bearing);
  const lat1 = rad(from.lat);
  const lng1 = rad(from.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
}

/**
 * A fuzzy circle that contains the true point: the circle's center is moved a random
 * distance (up to `radiusM`) in a random direction, so the runner is somewhere inside
 * but not at the middle.
 */
export function fuzzCenter(truth: LatLng, radiusM: number, rand: () => number = Math.random): LatLng {
  const dist = radiusM * Math.sqrt(rand()) * 0.9; // uniform over the disk, kept slightly inside the edge
  return offsetPoint(truth, dist, rand() * 360);
}
