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

/** `speed` scales the ground covered per minute, e.g. 2.25 when running. */
export function searchRadius(duration: number, isLoop: boolean, speed = 1): number {
  return Math.round(Math.min(3500 * speed, Math.max(350, (duration - 6) * 65 * speed / (isLoop ? 2.4 : 1.5))));
}

export function pathDistance(points: Coordinates[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + distanceMeters(points[index], point), 0);
}
