import type { Coordinates } from "../types";

export function isCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") return false;
  const { lat, lng } = value as Coordinates;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -85 && lat <= 85 && lng >= -180 && lng <= 180;
}

export function toLngLat(point: Coordinates): [number, number] {
  return [point.lng, point.lat];
}

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** The largest search circle Google Places (New) accepts. */
export const MAX_SEARCH_RADIUS = 50_000;

/**
 * How far discovery looks: it grows with the time so long walks find stops far
 * enough out. `speed` scales the ground covered per minute, e.g. 2.25 when running.
 */
export function searchRadius(duration: number, isLoop: boolean, speed = 1): number {
  return Math.round(Math.min(MAX_SEARCH_RADIUS, Math.max(350, (duration - 6) * 65 * speed / (isLoop ? 2.4 : 1.5))));
}

export function pathDistance(points: Coordinates[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + distanceMeters(points[index], point), 0);
}

/** The point `meters` away from `origin` along a compass bearing. */
export function offset(origin: Coordinates, meters: number, degrees: number): Coordinates {
  const radians = Math.PI / 180;
  const bearing = degrees * radians;
  const angular = meters / 6371000;
  const latitude = origin.lat * radians;
  const nextLatitude = Math.asin(Math.sin(latitude) * Math.cos(angular) + Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing));
  const nextLongitude = origin.lng * radians + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude), Math.cos(angular) - Math.sin(latitude) * Math.sin(nextLatitude));
  return { lat: Math.max(-85, Math.min(85, nextLatitude / radians)), lng: ((nextLongitude / radians + 540) % 360) - 180 };
}
