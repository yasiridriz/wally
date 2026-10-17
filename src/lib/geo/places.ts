import "server-only";
import type { Coordinates, Place } from "../types";
import { distanceMeters, isCoordinates } from "./coordinates";

const INCLUDED_TYPES = ["park", "botanical_garden", "tourist_attraction", "historical_landmark", "monument", "museum", "art_gallery", "observation_deck"];
const FIELD_MASK = "places.id,places.displayName,places.location,places.types,places.attributions";
const scenic: Record<Place["category"], number> = { park: 85, viewpoint: 95, historic: 80, art: 78, attraction: 72, path: 70 };
const descriptions: Record<Place["category"], string> = {
  park: "A green pause among the city streets.", viewpoint: "A viewpoint worth slowing down for.",
  historic: "A piece of local history to discover on foot.", art: "A place to discover art along the way; opening hours may vary.",
  attraction: "A local point of interest along the way; this walk stops outside.", path: "A pedestrian path for a change of scenery.",
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function category(types: string[]): Place["category"] | null {
  if (types.some(type => ["observation_deck", "scenic_spot"].includes(type))) return "viewpoint";
  if (types.some(type => ["park", "city_park", "national_park", "state_park", "botanical_garden", "garden"].includes(type))) return "park";
  if (types.some(type => ["historical_landmark", "historical_place", "monument", "castle", "cultural_landmark", "history_museum"].includes(type))) return "historic";
  if (types.some(type => ["art_gallery", "art_museum", "sculpture"].includes(type))) return "art";
  if (types.some(type => ["tourist_attraction", "museum"].includes(type))) return "attraction";
  return null;
}

function attributions(raw: unknown): NonNullable<Place["attributions"]> {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap(value => {
    const attribution = record(value);
    // REST Place.Attribution uses provider/providerUri, unlike review authors.
    const displayName = attribution?.provider ?? attribution?.displayName;
    const uri = attribution?.providerUri ?? attribution?.uri;
    if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 500) return [];
    let safeUri: string | undefined;
    if (typeof uri === "string" && uri.length <= 2048) {
      try { if (["https:", "http:"].includes(new URL(uri).protocol)) safeUri = uri; } catch { /* Keep the provider name even if its link is invalid. */ }
    }
    return [{ displayName: displayName.trim(), ...(safeUri ? { uri: safeUri } : {}) }];
  });
}

/** Normalise named, relevant, nearby Google Places; scores are category proxies. */
export function normalisePlaces(elements: unknown[], start: Coordinates, radius: number): Place[] {
  if (!isCoordinates(start) || !Number.isFinite(radius) || radius < 100 || radius > 3500) return [];
  const places: Place[] = [];
  for (const raw of elements.slice(0, 20)) {
    const element = record(raw);
    const displayName = record(element?.displayName);
    const location = record(element?.location);
    const name = typeof displayName?.text === "string" ? displayName.text.trim() : "";
    const id = element?.id;
    const coordinates = { lat: location?.latitude, lng: location?.longitude };
    const types = Array.isArray(element?.types) ? element.types.filter((type): type is string => typeof type === "string").slice(0, 30) : [];
    const kind = category(types);
    if (!kind || typeof id !== "string" || !id || id.length > 120 || !name || name.length > 180 || !isCoordinates(coordinates) || distanceMeters(start, coordinates) > radius) continue;
    const normalizedId = `google-${id}`;
    if (places.some(place => place.id === normalizedId || distanceMeters(place, coordinates) < 45 || (place.name.toLowerCase() === name.toLowerCase() && distanceMeters(place, coordinates) < 180))) continue;
    places.push({ id: normalizedId, name, ...coordinates, category: kind, description: descriptions[kind], baseScenicScore: scenic[kind], tags: { source: "google", google_types: types.join(",") }, attributions: attributions(element?.attributions) });
  }
  return places.sort((a, b) => b.baseScenicScore - a.baseScenicScore || distanceMeters(start, a) - distanceMeters(start, b));
}

export async function discoverPlaces(start: Coordinates, radius: number): Promise<Place[]> {
  if (!isCoordinates(start) || !Number.isFinite(radius) || radius < 100 || radius > 3500) throw new Error("Invalid discovery area.");
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Live place discovery needs GOOGLE_MAPS_API_KEY. Select Demo Mode for sample walks.");
  try {
    // No application or Next.js response cache: Google place content stays ephemeral.
    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ includedTypes: INCLUDED_TYPES, maxResultCount: 20, rankPreference: "DISTANCE", locationRestriction: { circle: { center: { latitude: start.lat, longitude: start.lng }, radius } } }),
      signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (response.status === 403) throw new Error("Google Places access was denied. Check that Places API (New) is enabled and the server key is authorised.");
    if (response.status === 429) throw new Error("Google Places is at its request limit. Try again later or select Demo Mode.");
    if (!response.ok) throw new Error("Nearby place discovery is unavailable. Please try again or select Demo Mode.");
    const data: unknown = await response.json();
    const result = record(data);
    if (!result || result.error || (result.places !== undefined && !Array.isArray(result.places))) throw new Error("Nearby place discovery returned invalid results. Please try again or select Demo Mode.");
    return normalisePlaces((result.places ?? []) as unknown[], start, radius);
  } catch (error) {
    if (error instanceof Error && !["TimeoutError", "AbortError", "TypeError", "SyntaxError"].includes(error.name)) throw error;
    throw new Error("Nearby place discovery could not connect. Please try again or select Demo Mode.");
  }
}
