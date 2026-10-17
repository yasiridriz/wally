import type { Coordinates, GenerateRequest, Place, WanderRoute } from "./types";
import { rankTimeMatchedRoutes, scorePlaces } from "./geo/scoring";

// Hand-drawn paths along Edinburgh streets and park paths. These fixtures are
// illustrative, not surveyed routes or a substitute for live directions.
export const DEMO_START: Coordinates = { lat: 55.9442, lng: -3.19055 };
export const DEMO_DESTINATION: Coordinates = { lat: 55.94695, lng: -3.1891 };

const places: Record<string, Place> = {
  middle: { id: "demo-middle-meadow", name: "Middle Meadow Walk", lat: 55.9429, lng: -3.19045, category: "path", description: "A broad tree-lined path into the Meadows, loved by everyday Edinburgh walkers.", baseScenicScore: 76 },
  meadows: { id: "demo-meadows", name: "The Meadows", lat: 55.94245, lng: -3.1921, category: "park", description: "Open lawns and mature trees just south of Edinburgh's Old Town.", baseScenicScore: 86 },
  george: { id: "demo-george-square", name: "George Square Gardens", lat: 55.94365, lng: -3.1873, category: "park", description: "A leafy university square framed by Georgian buildings.", baseScenicScore: 81 },
  mcewan: { id: "demo-mcewan", name: "McEwan Hall", lat: 55.9447, lng: -3.18755, category: "historic", description: "The university's grand domed ceremonial hall, viewed from Bristo Square.", baseScenicScore: 83 },
  museum: { id: "demo-museum", name: "National Museum of Scotland", lat: 55.94695, lng: -3.1891, category: "attraction", description: "A landmark museum on Chambers Street; this walk stops outside.", baseScenicScore: 86 },
  greyfriars: { id: "demo-greyfriars", name: "Greyfriars Bobby", lat: 55.9469, lng: -3.1921, category: "historic", description: "The small statue celebrating Edinburgh's famously loyal terrier.", baseScenicScore: 84 },
  teviot: { id: "demo-teviot", name: "Teviot Row House", lat: 55.94395, lng: -3.1890, category: "historic", description: "A distinctive sandstone university building on the edge of Bristo Square.", baseScenicScore: 79 },
};

type Fixture = { name: string; description: string; stops: string[]; path: [number, number][] };
const start: [number, number] = [DEMO_START.lng, DEMO_START.lat];
const fixtures: Fixture[] = [
  { name: "A little breathing room", description: "A short sample wander under the Meadows' trees.", stops: ["middle"], path: [start, [-3.1905, 55.9436], [-3.19045, 55.9429], [-3.19105, 55.94315], [-3.19135, 55.94355], [-3.1912, 55.94405], start] },
  { name: "The quiet square", description: "A sample stroll from leafy paths to Georgian gardens.", stops: ["george"], path: [start, [-3.1905, 55.9437], [-3.1894, 55.94365], [-3.1883, 55.94365], [-3.1873, 55.94365], [-3.1873, 55.94405], [-3.1885, 55.94415], start] },
  { name: "Bristo's grand entrance", description: "A sample city walk between two handsome university landmarks.", stops: ["mcewan", "teviot"], path: [start, [-3.1904, 55.94455], [-3.1894, 55.9446], [-3.1882, 55.94465], [-3.18755, 55.9447], [-3.1876, 55.94415], [-3.1890, 55.94415], [-3.1890, 55.94395], [-3.1903, 55.94395], start] },
  { name: "A sandstone side quest", description: "A tiny sample adventure around a beloved university building.", stops: ["teviot"], path: [start, [-3.1905, 55.9437], [-3.1890, 55.9437], [-3.1890, 55.94395], [-3.1890, 55.9442], start] },
  { name: "Lawns and little discoveries", description: "An easy sample loop through the Meadows and a university square.", stops: ["middle", "meadows", "george"], path: [start, [-3.19045, 55.9429], [-3.1921, 55.94245], [-3.19055, 55.9419], [-3.18835, 55.94215], [-3.1873, 55.94365], [-3.18735, 55.9441], [-3.189, 55.94415], start] },
  { name: "Edinburgh in miniature", description: "A sample wander between a grand hall, museum and beloved little dog.", stops: ["mcewan", "museum", "greyfriars"], path: [start, [-3.1904, 55.94455], [-3.18755, 55.9447], [-3.1877, 55.94525], [-3.18785, 55.94695], [-3.1891, 55.94695], [-3.1921, 55.9469], [-3.1916, 55.9455], [-3.1914, 55.9446], start] },
];

const destination: [number, number] = [DEMO_DESTINATION.lng, DEMO_DESTINATION.lat];
// Fixed museum-bound illustrations: Forrest Road / George IV Bridge, or
// Bristo Square / Potterrow, followed by Chambers Street to the museum.
const destinationFixtures: Fixture[] = [
  { name: "Bobby on the way", description: "A sample route past Greyfriars Bobby, then along Chambers Street to the museum.", stops: ["greyfriars"], path: [start, [-3.1904, 55.94455], [-3.1914, 55.9446], [-3.1916, 55.9455], [-3.1921, 55.9469], [-3.1918, 55.94705], [-3.1904, 55.9470], destination] },
  { name: "A grand arrival", description: "A sample museum-bound wander past Teviot and McEwan Hall, via Bristo Square and Potterrow.", stops: ["teviot", "mcewan"], path: [start, [-3.1905, 55.9437], [-3.1890, 55.9437], [-3.1890, 55.94395], [-3.1876, 55.94415], [-3.18755, 55.9447], [-3.1880, 55.9451], [-3.1877, 55.94525], [-3.18785, 55.94695], destination] },
  { name: "The leafy way there", description: "A sample detour by George Square Gardens before approaching the museum along Potterrow and Chambers Street.", stops: ["george"], path: [start, [-3.1905, 55.9437], [-3.1894, 55.94365], [-3.1883, 55.94365], [-3.1873, 55.94365], [-3.1873, 55.94405], [-3.1876, 55.94415], [-3.1877, 55.94525], [-3.18785, 55.94695], destination] },
];

function pathDistance(path: [number, number][]) {
  const radians = Math.PI / 180;
  return path.slice(1).reduce((sum, point, index) => {
    const previous = path[index];
    const a = Math.sin((point[1] - previous[1]) * radians / 2) ** 2 + Math.cos(previous[1] * radians) * Math.cos(point[1] * radians) * Math.sin((point[0] - previous[0]) * radians / 2) ** 2;
    return sum + 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, 0);
}

/** All finite sample walks, before matching the requested total duration. */
export function demoRouteSamples(request: GenerateRequest): WanderRoute[] {
  const candidates = request.mode === "destination" ? destinationFixtures : fixtures;
  return candidates.map((fixture, index): WanderRoute => {
    const stops = fixture.stops.map((id) => places[id]);
    const path = request.mode === "explore" ? fixture.path.slice(0, fixture.path.findIndex((point) => point[0] === stops.at(-1)!.lng && point[1] === stops.at(-1)!.lat) + 1) : fixture.path;
    const distanceMeters = Math.round(pathDistance(path));
    const walkingMinutes = Math.ceil(distanceMeters / 70);
    const stopMinutes = stops.length * 2;
    const bufferMinutes = Math.max(2, Math.ceil(walkingMinutes * 0.1));
    return { id: `demo-${request.mode}-${index}`, name: fixture.name, description: fixture.description, geometry: { type: "LineString", coordinates: path }, stops, distanceMeters, walkingMinutes, stopMinutes, bufferMinutes, totalMinutes: walkingMinutes + stopMinutes + bufferMinutes, score: scorePlaces(stops, request.mood, request.visitedIds), highlights: [stops[0].category === "park" ? "A little green space" : "Local discoveries", request.mode === "loop" ? "Back where you started" : request.mode === "destination" ? "Finish at the museum" : "A fresh finish", "Illustrative sample route"], isLoop: request.mode === "loop", source: "demo", ...(request.mode === "destination" ? { destination: DEMO_DESTINATION } : {}) };
  }).filter((route) => route.totalMinutes <= request.duration);
}

export function generateDemoRoutes(request: GenerateRequest): WanderRoute[] {
  return rankTimeMatchedRoutes(demoRouteSamples(request), request.duration);
}
