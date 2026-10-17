"use server";

import { isCoordinates } from "@/lib/geo/coordinates";
import { LocationSearchError, normaliseSearchQuery, searchLocationPlaces } from "@/lib/geo/search";
import type { ActionResult, LocationSearchResult } from "@/lib/types";

export async function searchLocations(raw: unknown): Promise<ActionResult<LocationSearchResult[]>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "INVALID_INPUT", error: "Search for a place or address using 3–160 characters." };
  const input = raw as Record<string, unknown>;
  const query = normaliseSearchQuery(input.query);
  if (!query || (input.near !== undefined && !isCoordinates(input.near))) return { ok: false, code: "INVALID_INPUT", error: "Enter a valid place name or address and search again." };
  const near = isCoordinates(input.near) ? { lat: input.near.lat, lng: input.near.lng } : undefined;
  try {
    // Only these validated fields reach the provider; limits and endpoint are fixed.
    return { ok: true, data: await searchLocationPlaces(query, near) };
  } catch (error) {
    if (error instanceof LocationSearchError) return { ok: false, code: error.code, error: error.message };
    return { ok: false, code: "PROVIDER_ERROR", error: "Location search is unavailable. Try again or choose a point on the map." };
  }
}
