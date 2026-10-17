import "server-only";
import { isCoordinates } from "./coordinates";
import type { Coordinates, LocationSearchResult } from "../types";

const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.attributions";
const messages = {
  INVALID_INPUT: "Search for a place or address using 3–160 characters.",
  MISSING_KEY: "Location search needs a Google Maps server API key with Places API (New) enabled. You can still choose a point on the map.",
  ACCESS_DENIED: "Google Places access was denied. Check that Places API (New) is enabled and the server key is authorised.",
  RATE_LIMITED: "Location search has reached its request limit. Try again later or choose a point on the map.",
  PROVIDER_ERROR: "Location search is unavailable. Try again or choose a point on the map.",
} as const;

export class LocationSearchError extends Error {
  constructor(public readonly code: keyof typeof messages) { super(messages[code]); }
}

export function normaliseSearchQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const query = value.trim().replace(/\s+/g, " ");
  return query.length >= 3 && query.length <= 160 ? query : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normaliseAttributions(raw: unknown): NonNullable<LocationSearchResult["attributions"]> {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap(value => {
    const attribution = record(value);
    const displayName = attribution?.provider;
    if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 500) return [];
    const uri = attribution?.providerUri;
    let safeUri: string | undefined;
    if (typeof uri === "string" && uri.length <= 2048) {
      try { if (["https:", "http:"].includes(new URL(uri).protocol)) safeUri = uri; } catch { /* Retain the provider name without an unsafe link. */ }
    }
    return [{ displayName: displayName.trim(), ...(safeUri ? { uri: safeUri } : {}) }];
  });
}

function normaliseResults(raw: unknown[]): LocationSearchResult[] {
  const results: LocationSearchResult[] = [];
  for (const value of raw.slice(0, 5)) {
    const place = record(value);
    const displayName = record(place?.displayName);
    const location = record(place?.location);
    const coordinates = { lat: location?.latitude, lng: location?.longitude };
    const id = place?.id;
    const name = typeof displayName?.text === "string" ? displayName.text.trim() : "";
    const address = typeof place?.formattedAddress === "string" ? place.formattedAddress.trim() : "";
    if (typeof id !== "string" || !id || id.length > 120 || !name || name.length > 180 || address.length > 500 || !isCoordinates(coordinates) || results.some(result => result.id === `google-${id}`)) continue;
    results.push({ id: `google-${id}`, name, address, coordinates, attributions: normaliseAttributions(place?.attributions) });
  }
  return results;
}

export async function searchLocationPlaces(rawQuery: string, near?: Coordinates): Promise<LocationSearchResult[]> {
  const query = normaliseSearchQuery(rawQuery);
  if (!query || (near !== undefined && !isCoordinates(near))) throw new LocationSearchError("INVALID_INPUT");
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) throw new LocationSearchError("MISSING_KEY");
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery: query, pageSize: 5, ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 10000 } } } : {}) }),
      signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (response.status === 403) throw new LocationSearchError("ACCESS_DENIED");
    if (response.status === 429) throw new LocationSearchError("RATE_LIMITED");
    if (!response.ok) throw new LocationSearchError("PROVIDER_ERROR");
    const data = record(await response.json());
    if (!data || data.error || (data.places !== undefined && !Array.isArray(data.places))) throw new LocationSearchError("PROVIDER_ERROR");
    return normaliseResults((data.places ?? []) as unknown[]);
  } catch (error) {
    if (error instanceof LocationSearchError) throw error;
    throw new LocationSearchError("PROVIDER_ERROR");
  }
}
