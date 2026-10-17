import "server-only";
import type { Coordinates } from "../types";
import { distanceMeters, isCoordinates } from "./coordinates";

export type WalkingResult = {
  geometry: GeoJSON.LineString;
  distanceMeters: number;
  durationSeconds: number;
  segmentSeconds: number[];
  warnings?: string[];
};
export type RoutingBudget = { remaining: number; rateLimited: boolean };
export class RoutingError extends Error {
  constructor(message: string, public readonly status = 0) { super(message); this.name = "RoutingError"; }
}

function parseDuration(value: unknown): number {
  // Google encodes protobuf durations as seconds with up to nine decimal places.
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,9})?s$/.test(value)) return NaN;
  return Number(value.slice(0, -1));
}

function googleWaypoint(point: Coordinates) {
  return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}

export async function routeWalking(waypoints: Coordinates[], budget: RoutingBudget = { remaining: 2, rateLimited: false }): Promise<WalkingResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new RoutingError("Live walking routes need a Google Maps API key. Try Demo Mode.");
  if (waypoints.length < 2 || waypoints.length > 6 || !waypoints.every(isCoordinates)) throw new RoutingError("Invalid walking waypoints.");
  for (let attempt = 0; attempt < 2; attempt++) {
    if (budget.remaining <= 0 || budget.rateLimited) throw new RoutingError("Routing request limit reached. Please try again shortly.");
    budget.remaining--;
    try {
      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.geoJsonLinestring,routes.legs.duration,routes.warnings",
        },
        body: JSON.stringify({
          origin: googleWaypoint(waypoints[0]),
          destination: googleWaypoint(waypoints[waypoints.length - 1]),
          // Non-via stops retain one leg per waypoint pair, needed for event arrival times.
          intermediates: waypoints.slice(1, -1).map((point) => ({ ...googleWaypoint(point), via: false })),
          travelMode: "WALK", computeAlternativeRoutes: false, optimizeWaypointOrder: false,
          polylineEncoding: "GEO_JSON_LINESTRING", polylineQuality: "HIGH_QUALITY",
        }),
        signal: AbortSignal.timeout(12_000), cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 429) budget.rateLimited = true;
        const message = response.status === 429 ? "The walking provider is busy. Please try again shortly or use Demo Mode."
          : response.status === 401 || response.status === 403 ? "Google walking routes are not authorised. Check your server API key and enabled Routes API."
          : "The walking provider could not find this route.";
        throw new RoutingError(message, response.status);
      }
      const data = await response.json();
      const route = data?.routes?.[0];
      const geometry = route?.polyline?.geoJsonLinestring;
      const durationSeconds = parseDuration(route?.duration);
      if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || geometry.coordinates.length > 100_000 || !geometry.coordinates.every((p: unknown) => Array.isArray(p) && p.length >= 2 && isCoordinates({ lng: p[0], lat: p[1] })) || !Number.isSafeInteger(route?.distanceMeters) || route.distanceMeters <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new RoutingError("The walking provider returned an incomplete route.");
      const ends = [geometry.coordinates[0], geometry.coordinates[geometry.coordinates.length - 1]];
      if (ends.some((p: number[], index: number) => distanceMeters({ lng: p[0], lat: p[1] }, index === 0 ? waypoints[0] : waypoints[waypoints.length - 1]) > 200)) throw new RoutingError("The walking network is too far from a selected location.");
      const segmentSeconds = Array.isArray(route.legs) ? route.legs.map((leg: { duration?: unknown }) => parseDuration(leg?.duration)) : [];
      if (segmentSeconds.length !== waypoints.length - 1 || !segmentSeconds.every((seconds: number) => Number.isFinite(seconds) && seconds >= 0)) throw new RoutingError("The walking provider returned incomplete timing information.");
      const warnings = Array.isArray(route.warnings) ? route.warnings.filter((warning: unknown): warning is string => typeof warning === "string").slice(0, 20).map((warning: string) => warning.slice(0, 2000)) : [];
      return { geometry: { type: "LineString", coordinates: geometry.coordinates.map((p: number[]) => p.slice(0, 2)) }, distanceMeters: route.distanceMeters, durationSeconds, segmentSeconds, warnings };
    } catch (error) {
      const retryable = !(error instanceof RoutingError) || error.status >= 500;
      if (attempt === 0 && retryable && budget.remaining > 0 && !budget.rateLimited) continue;
      if (error instanceof RoutingError) throw error;
      throw new RoutingError("The walking provider did not respond in time. Please try again or use Demo Mode.");
    }
  }
  throw new RoutingError("No walking route was available.");
}
