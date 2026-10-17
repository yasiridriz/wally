import "server-only";
import type { Coordinates, GenerateRequest, Place, PlacePhotoRef } from "../types";
import { distanceMeters, isCoordinates, searchRadius } from "./coordinates";

const INCLUDED_TYPES = ["park", "botanical_garden", "tourist_attraction", "historical_landmark", "monument", "museum", "art_gallery", "observation_deck"];
// Photos share the Nearby Search Pro tier with displayName, so they add no request cost.
const FIELD_MASK = "places.id,places.displayName,places.location,places.types,places.attributions,places.photos";
export const PHOTO_NAME = /^places\/[A-Za-z0-9_-]{1,300}\/photos\/[A-Za-z0-9_-]{1,1000}$/;
const VIEWPOINT_TYPES = ["observation_deck", "scenic_spot"];
const ACTIVITY_TYPES = ["hiking_area", "botanical_garden", "art_gallery", "museum", "market"];
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
  if (types.includes("hiking_area")) return "path";
  if (types.some(type => ["tourist_attraction", "museum", "market", "farmers_market", "flea_market"].includes(type))) return "attraction";
  return null;
}

function activity(types: string[], kind: Place["category"]): Pick<Place, "visitMinutes" | "suggestedActivity"> {
  if (kind === "viewpoint") return { visitMinutes: 4, suggestedActivity: "Pause for the view" };
  if (types.some(type => ["market", "farmers_market", "flea_market"].includes(type))) return { visitMinutes: 5, suggestedActivity: "Browse the market; check opening hours" };
  if (types.includes("botanical_garden")) return { visitMinutes: 5, suggestedActivity: "Enjoy a short garden stroll; check access and opening hours" };
  if (types.some(type => ["art_gallery", "art_museum"].includes(type))) return { visitMinutes: 5, suggestedActivity: "Look at the gallery exterior or window displays; check hours before entering" };
  if (types.some(type => ["museum", "history_museum"].includes(type))) return { visitMinutes: 5, suggestedActivity: "Explore the museum exterior; check hours before entering" };
  if (kind === "path") return { visitMinutes: 4, suggestedActivity: "Try a short stretch of the trail" };
  if (kind === "park") return { visitMinutes: 3, suggestedActivity: "Take a quiet pause among the greenery" };
  if (kind === "historic") return { visitMinutes: 3, suggestedActivity: "Pause to notice the landmark's details" };
  return { visitMinutes: 3, suggestedActivity: "Take a closer look from outside" };
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

/** Keep only the first valid photo name; the image itself is requested on demand. */
function firstPhoto(raw: unknown): PlacePhotoRef | undefined {
  if (!Array.isArray(raw)) return undefined;
  for (const value of raw.slice(0, 10)) {
    const photo = record(value);
    if (typeof photo?.name === "string" && PHOTO_NAME.test(photo.name)) return { name: photo.name, authorAttributions: attributions(photo.authorAttributions).slice(0, 5) };
  }
  return undefined;
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
    const photo = firstPhoto(element?.photos);
    if (places.some(place => place.id === normalizedId || distanceMeters(place, coordinates) < 45 || (place.name.toLowerCase() === name.toLowerCase() && distanceMeters(place, coordinates) < 180))) continue;
    places.push({ id: normalizedId, name, ...coordinates, category: kind, description: descriptions[kind], baseScenicScore: scenic[kind], ...activity(types, kind), tags: { source: "google", google_types: types.join(",") }, attributions: attributions(element?.attributions), ...(photo ? { photo } : {}) });
  }
  return places.sort((a, b) => b.baseScenicScore - a.baseScenicScore || distanceMeters(start, a) - distanceMeters(start, b));
}

class PlacesDiscoveryError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

async function queryPlaces(start: Coordinates, radius: number, includedTypes: string[], rankPreference: "DISTANCE" | "POPULARITY"): Promise<Place[]> {
  if (!isCoordinates(start) || !Number.isFinite(radius) || radius < 100 || radius > 3500) throw new Error("Invalid discovery area.");
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) throw new PlacesDiscoveryError("Live place discovery needs GOOGLE_MAPS_API_KEY. Select Demo Mode for sample walks.", 401);
  try {
    // No application or Next.js response cache: Google place content stays ephemeral.
    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ includedTypes, maxResultCount: 20, rankPreference, locationRestriction: { circle: { center: { latitude: start.lat, longitude: start.lng }, radius } } }),
      signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (response.status === 403) throw new PlacesDiscoveryError("Google Places access was denied. Check that Places API (New) is enabled and the server key is authorised.", 403);
    if (response.status === 429) throw new PlacesDiscoveryError("Google Places is at its request limit. Try again later or select Demo Mode.", 429);
    if (!response.ok) throw new PlacesDiscoveryError("Nearby place discovery is unavailable. Please try again or select Demo Mode.", response.status);
    const data: unknown = await response.json();
    const result = record(data);
    if (!result || result.error || (result.places !== undefined && !Array.isArray(result.places))) throw new PlacesDiscoveryError("Nearby place discovery returned invalid results. Please try again or select Demo Mode.");
    return normalisePlaces((result.places ?? []) as unknown[], start, radius);
  } catch (error) {
    if (error instanceof PlacesDiscoveryError) throw error;
    throw new PlacesDiscoveryError("Nearby place discovery could not connect. Please try again or select Demo Mode.");
  }
}

export async function discoverPlaces(start: Coordinates, radius: number): Promise<Place[]> {
  return queryPlaces(start, radius, INCLUDED_TYPES, "DISTANCE");
}

function offset(origin: Coordinates, meters: number, degrees: number): Coordinates {
  const radians = Math.PI / 180;
  const bearing = degrees * radians;
  const angular = meters / 6371000;
  const latitude = origin.lat * radians;
  const nextLatitude = Math.asin(Math.sin(latitude) * Math.cos(angular) + Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing));
  const nextLongitude = origin.lng * radians + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude), Math.cos(angular) - Math.sin(latitude) * Math.sin(nextLatitude));
  return { lat: Math.max(-85, Math.min(85, nextLatitude / radians)), lng: ((nextLongitude / radians + 540) % 360) - 180 };
}

function mergeLoopPlaces(groups: Place[][], start: Coordinates, radius: number): Place[] {
  return mergePlaceGroups(groups, place => distanceMeters(start, place) <= radius);
}

function mergePlaceGroups(groups: Place[][], accepts: (place: Place) => boolean): Place[] {
  const selected: Place[] = [];
  function add(place: Place) {
    if (selected.length >= 20 || !accepts(place) || selected.some(other => other.id === place.id || distanceMeters(other, place) < 45 || (other.name.toLowerCase() === place.name.toLowerCase() && distanceMeters(other, place) < 180))) return;
    selected.push(place);
  }
  // Reserve a little space for actual viewpoint and activity query results.
  for (const group of groups.slice(-2)) for (const place of group.slice(0, 2)) add(place);
  // Round-robin discovery areas so the nearest streets cannot consume all slots.
  for (let index = 0; index < 20 && selected.length < 20; index++) for (const group of groups) if (group[index]) add(group[index]);
  return selected;
}

export async function discoverLoopPlaces(request: GenerateRequest): Promise<Place[]> {
  if (!isCoordinates(request.start) || ![15, 30, 45, 60, 90].includes(request.duration)) throw new Error("Invalid loop discovery area or duration.");
  const radius = searchRadius(request.duration, true);
  const ringDistance = radius * 0.75;
  const outerRadius = Math.round(Math.max(700, Math.min(1100, radius * 0.4)));
  const queries = [
    { center: request.start, radius: Math.min(750, radius), types: INCLUDED_TYPES, rank: "DISTANCE" as const },
    ...(request.duration >= 45 ? [0, 120, 240].map(bearing => ({ center: offset(request.start, ringDistance, bearing), radius: outerRadius, types: INCLUDED_TYPES, rank: "POPULARITY" as const })) : []),
    { center: request.start, radius, types: VIEWPOINT_TYPES, rank: "POPULARITY" as const },
    { center: request.start, radius, types: ACTIVITY_TYPES, rank: "POPULARITY" as const },
  ];
  const groups: Place[][] = [];
  let successfulQueries = 0;
  let failure: unknown;
  for (const query of queries) {
    try {
      groups.push(await queryPlaces(query.center, query.radius, query.types, query.rank));
      successfulQueries++;
    } catch (error) {
      groups.push([]);
      failure = error;
      if (error instanceof PlacesDiscoveryError && [401, 403, 429].includes(error.status)) break;
    }
  }
  if (!successfulQueries && failure) throw failure;
  return mergeLoopPlaces(groups, request.start, radius);
}

type DiscoveryQuery = { center: Coordinates; radius: number; types: string[]; rank: "DISTANCE" | "POPULARITY" };

async function queryAreas(queries: DiscoveryQuery[]): Promise<Place[][]> {
  const groups: Place[][] = [];
  let successes = 0;
  let failure: unknown;
  for (const query of queries.slice(0, 6)) {
    try {
      groups.push(await queryPlaces(query.center, query.radius, query.types, query.rank));
      successes++;
    } catch (error) {
      groups.push([]);
      failure = error;
      if (error instanceof PlacesDiscoveryError && [401, 403, 429].includes(error.status)) break;
    }
  }
  if (!successes && failure) throw failure;
  return groups;
}

export async function discoverExplorePlaces(request: GenerateRequest): Promise<Place[]> {
  if (!isCoordinates(request.start) || ![15, 30, 45, 60, 90].includes(request.duration)) throw new Error("Invalid exploration area or duration.");
  const radius = searchRadius(request.duration, false);
  const outerRadius = Math.round(Math.max(700, Math.min(1400, radius * 0.4)));
  const queries: DiscoveryQuery[] = [
    { center: request.start, radius: Math.max(100, Math.min(1000, radius * 0.4)), types: INCLUDED_TYPES, rank: "POPULARITY" },
    ...(request.duration >= 45 ? [0, 120, 240].map(bearing => ({ center: offset(request.start, radius * 0.78, bearing), radius: outerRadius, types: INCLUDED_TYPES, rank: "POPULARITY" as const })) : []),
    { center: request.start, radius, types: VIEWPOINT_TYPES, rank: "POPULARITY" },
    { center: request.start, radius, types: ACTIVITY_TYPES, rank: "POPULARITY" },
  ];
  return mergePlaceGroups(await queryAreas(queries), place => distanceMeters(request.start, place) <= radius);
}

function initialBearing(start: Coordinates, end: Coordinates): number {
  const radians = Math.PI / 180;
  const delta = (end.lng - start.lng) * radians;
  const a = start.lat * radians;
  const b = end.lat * radians;
  return Math.atan2(Math.sin(delta) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta)) / radians;
}

export async function discoverTargetedPlaces(request: GenerateRequest): Promise<Place[]> {
  const destination = request.destination;
  if (!isCoordinates(request.start) || !isCoordinates(destination) || ![15, 30, 45, 60, 90].includes(request.duration)) throw new Error("Choose a valid starting point, destination and duration before discovering places.");
  const directDistance = distanceMeters(request.start, destination);
  // This generous geographic envelope is only a discovery filter. Actual
  // walking, stop visits and the safety buffer determine route eligibility.
  const travelEnvelope = Math.max(350, (request.duration - 5) * 80);
  if (directDistance > travelEnvelope) return [];
  const bearing = initialBearing(request.start, destination);
  const midpoint = offset(request.start, directDistance / 2, bearing);
  const spareMeters = Math.max(0, travelEnvelope - directDistance);
  const broadRadius = Math.round(Math.max(350, Math.min(3500, directDistance / 3 + spareMeters * 0.22)));
  const lateralDistance = Math.min(2800, spareMeters * 0.3);
  const centers = lateralDistance >= 300
    ? [request.start, destination, offset(midpoint, lateralDistance, bearing + 90), offset(midpoint, lateralDistance, bearing - 90)]
    : [request.start, midpoint, destination];
  const focusRadius = Math.round(Math.max(350, Math.min(3500, travelEnvelope / 2)));
  const queries: DiscoveryQuery[] = [
    ...centers.map(center => ({ center, radius: broadRadius, types: INCLUDED_TYPES, rank: "POPULARITY" as const })),
    { center: midpoint, radius: focusRadius, types: VIEWPOINT_TYPES, rank: "POPULARITY" },
    { center: midpoint, radius: focusRadius, types: ACTIVITY_TYPES, rank: "POPULARITY" },
  ];
  return mergePlaceGroups(await queryAreas(queries), place => distanceMeters(request.start, place) + distanceMeters(place, destination) <= travelEnvelope);
}
