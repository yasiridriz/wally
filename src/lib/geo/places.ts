import "server-only";
import type { Coordinates, Place } from "../types";
import { distanceMeters, isCoordinates } from "./coordinates";

const cache = new Map<string, { expires: number; places: Place[] }>();
type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

function category(tags: Record<string, string>): Place["category"] {
  if (tags.leisure === "park" || tags.leisure === "garden") return "park";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.historic) return "historic";
  if (tags.tourism === "artwork") return "art";
  if (tags.highway) return "path";
  return "attraction";
}

const scenic: Record<Place["category"], number> = { park: 85, viewpoint: 95, historic: 80, art: 78, attraction: 72, path: 70 };
const descriptions: Record<Place["category"], string> = {
  park: "A green pause among the city streets.", viewpoint: "A mapped viewpoint worth slowing down for.",
  historic: "A piece of local history to discover on foot.", art: "Public art that rewards a closer look.",
  attraction: "A locally mapped point of interest along the way.", path: "A named pedestrian path for a change of scenery.",
};

export function normalisePlaces(elements: OsmElement[], start: Coordinates, radius: number): Place[] {
  const places: Place[] = [];
  for (const element of elements.slice(0, 1000)) {
    if (!element || typeof element !== "object") continue;
    const tags = element.tags;
    const name = typeof tags?.name === "string" ? tags.name.trim() : "";
    const coords = { lat: element.lat ?? element.center?.lat, lng: element.lon ?? element.center?.lon };
    if (!tags || !Number.isSafeInteger(element.id) || !["node", "way", "relation"].includes(element.type) || !name || name.length > 180 || !isCoordinates(coords) || tags.access === "private" || tags.access === "no" || distanceMeters(start, coords) > radius) continue;
    if (places.some((place) => distanceMeters(place, coords) < 45 || (place.name.toLowerCase() === name.toLowerCase() && distanceMeters(place, coords) < 180))) continue;
    const kind = category(tags);
    places.push({ id: `osm-${element.type}-${element.id}`, name, ...coords, category: kind,
      description: descriptions[kind], baseScenicScore: scenic[kind],
      tags: Object.fromEntries(Object.entries(tags).filter(([key]) => ["tourism", "historic", "leisure", "artwork_type", "highway"].includes(key))),
    });
  }
  // Spread the discovery across distance bands so short and longer candidates survive.
  return places.sort((a, b) => b.baseScenicScore - a.baseScenicScore || distanceMeters(start, a) - distanceMeters(start, b)).slice(0, 20);
}

export async function discoverPlaces(start: Coordinates, radius: number): Promise<Place[]> {
  if (!isCoordinates(start) || !Number.isFinite(radius) || radius < 100 || radius > 3500) throw new Error("Invalid discovery area.");
  const key = `${start.lat.toFixed(4)},${start.lng.toFixed(4)}:${Math.round(radius)}`;
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.places;
  const around = `(around:${Math.round(radius)},${start.lat},${start.lng})`;
  const query = `[out:json][timeout:15];(nwr${around}[name][leisure~"^(park|garden)$"];nwr${around}[name][tourism~"^(viewpoint|artwork|attraction)$"];nwr${around}[name][historic];way${around}[name][highway~"^(footway|pedestrian|path)$"];);out center 150;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(18_000), cache: "no-store",
    });
    if (!response.ok) throw new Error("Nearby place discovery is busy. Please try again or use Demo Mode.");
    const data = await response.json();
    if (!Array.isArray(data?.elements) || data.remark) throw new Error("Nearby place discovery returned incomplete results. Please try again or use Demo Mode.");
    const places = normalisePlaces(data.elements, start, radius);
    if (cache.size >= 40) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 5 * 60_000, places });
    return places;
  } catch (error) {
    if (error instanceof Error && !["TimeoutError", "AbortError", "TypeError"].includes(error.name)) throw error;
    throw new Error("Nearby place discovery could not connect. Please try again or use Demo Mode.");
  }
}
