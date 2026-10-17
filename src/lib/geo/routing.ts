import "server-only";
import type { Coordinates } from "../types";
import { distanceMeters, isCoordinates, toLngLat } from "./coordinates";

export type WalkingResult = { geometry: GeoJSON.LineString; distanceMeters: number; durationSeconds: number; segmentSeconds: number[] };
export type RoutingBudget = { remaining: number; rateLimited: boolean };
export class RoutingError extends Error {
  constructor(message: string, public readonly status = 0) { super(message); this.name = "RoutingError"; }
}

export async function routeWalking(waypoints: Coordinates[], budget: RoutingBudget = { remaining: 2, rateLimited: false }): Promise<WalkingResult> {
  const key = process.env.OPENROUTESERVICE_API_KEY;
  if (!key) throw new RoutingError("Live walking routes need an OpenRouteService API key. Try Demo Mode.");
  if (waypoints.length < 2 || waypoints.length > 6 || !waypoints.every(isCoordinates)) throw new RoutingError("Invalid walking waypoints.");
  for (let attempt = 0; attempt < 2; attempt++) {
    if (budget.remaining <= 0 || budget.rateLimited) throw new RoutingError("Routing request limit reached. Please try again shortly.");
    budget.remaining--;
    try {
      const response = await fetch("https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson", {
        method: "POST", headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: waypoints.map(toLngLat), radiuses: waypoints.map(() => 150), instructions: false }),
        signal: AbortSignal.timeout(12_000), cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 429) budget.rateLimited = true;
        throw new RoutingError(response.status === 429 ? "The walking provider is busy. Please try again shortly or use Demo Mode." : "The walking provider could not find this route.", response.status);
      }
      const data = await response.json();
      const feature = data?.features?.[0];
      const geometry = feature?.geometry;
      const summary = feature?.properties?.summary;
      if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || geometry.coordinates.length > 100_000 || !geometry.coordinates.every((p: unknown) => Array.isArray(p) && p.length >= 2 && isCoordinates({ lng: p[0], lat: p[1] })) || !Number.isFinite(summary?.distance) || !Number.isFinite(summary?.duration) || summary.distance <= 0 || summary.duration <= 0) throw new RoutingError("The walking provider returned an incomplete route.");
      const ends = [geometry.coordinates[0], geometry.coordinates[geometry.coordinates.length - 1]];
      if (ends.some((p: number[], index: number) => distanceMeters({ lng: p[0], lat: p[1] }, index === 0 ? waypoints[0] : waypoints[waypoints.length - 1]) > 200)) throw new RoutingError("The walking network is too far from a selected location.");
      const segments = feature.properties.segments;
      const segmentSeconds = Array.isArray(segments) ? segments.map((segment: { duration: number }) => segment.duration) : [];
      if (segmentSeconds.length !== waypoints.length - 1 || !segmentSeconds.every((seconds: number) => Number.isFinite(seconds) && seconds >= 0)) throw new RoutingError("The walking provider returned incomplete timing information.");
      return { geometry: { type: "LineString", coordinates: geometry.coordinates.map((p: number[]) => p.slice(0, 2)) }, distanceMeters: summary.distance, durationSeconds: summary.duration, segmentSeconds };
    } catch (error) {
      const retryable = !(error instanceof RoutingError) || error.status >= 500;
      if (attempt === 0 && retryable && budget.remaining > 0 && !budget.rateLimited) continue;
      if (error instanceof RoutingError) throw error;
      throw new RoutingError("The walking provider did not respond in time. Please try again or use Demo Mode.");
    }
  }
  throw new RoutingError("No walking route was available.");
}
