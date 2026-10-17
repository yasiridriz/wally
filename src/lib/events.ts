import "server-only";
import { routeWalking } from "./geo/routing";
import { estimateStopMinutes, scorePlaces, repetitionPenalty } from "./geo/scoring";
import type { Coordinates, DetourOption, Event, GenerateRequest, SummaryPhoto, WanderRoute } from "./types";

type CachedRoute = { request: GenerateRequest; route: WanderRoute; createdAt: number; detours?: Promise<DetourOption[]>; photos?: Promise<SummaryPhoto[]> };
const routes = new Map<string, CachedRoute>();
const CACHE_TTL_MS = 20 * 60 * 1000;

export function registerGeneratedRoutes(request: GenerateRequest, generated: WanderRoute[]) {
  const now = Date.now();
  for (const [id, context] of routes) if (now - context.createdAt > CACHE_TTL_MS) routes.delete(id);
  for (const route of generated) routes.set(route.id, { request, route, createdAt: now });
  while (routes.size > 150) routes.delete(routes.keys().next().value!);
}

export function getRouteContext(id: string) {
  const context = routes.get(id);
  if (!context || Date.now() - context.createdAt > CACHE_TTL_MS) {
    routes.delete(id);
    return undefined;
  }
  return context;
}

export type EventProvider = (now: Date) => Promise<Event[]>;

// Every schedule below belongs to a fictional demo, never a live listing.
export const sampleEventProvider: EventProvider = async (now) => {
  const startTime = new Date(now.getTime() - 60 * 60000).toISOString();
  const endTime = new Date(now.getTime() + 3 * 60 * 60000).toISOString();
  return [
    { id: "sample-meadows-sketch", name: "Sample: sketching in the Meadows", location: { lat: 55.9429, lng: -3.19045 }, startTime, endTime, visitMinutes: 8, category: "art", description: "Fictional outdoor sketching meetup for demonstrating a detour. This is not a real event.", isSample: true },
    { id: "sample-bristo-music", name: "Sample: Bristo Square acoustic set", location: { lat: 55.9450, lng: -3.1885 }, startTime, endTime, visitMinutes: 10, category: "music", description: "Fictional acoustic performance with simulated times. No performance is confirmed.", isSample: true },
    { id: "sample-history", name: "Sample: Old Town stories", location: { lat: 55.9469, lng: -3.1921 }, startTime, endTime, visitMinutes: 8, category: "history", description: "Fictional storytelling stop to demonstrate time-aware routing. Not a real listing.", isSample: true },
  ];
};

/** Pure timing check. Waiting, a complete visit and the route buffer must fit. */
export function evaluateEventTiming(walkingMinutes: number, stopMinutes: number, bufferMinutes: number, arrivalMinutes: number, event: Event, departure: Date, budgetMinutes: number) {
  const values = [walkingMinutes, stopMinutes, bufferMinutes, arrivalMinutes, event.visitMinutes, budgetMinutes];
  const starts = Date.parse(event.startTime);
  const ends = Date.parse(event.endTime);
  if (values.some((value) => !Number.isFinite(value) || value < 0) || !Number.isFinite(departure.getTime()) || !Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || event.visitMinutes <= 0) return null;
  const arrives = departure.getTime() + arrivalMinutes * 60000;
  const waitMinutes = Math.max(0, Math.ceil((starts - arrives) / 60000));
  const finishes = arrives + (waitMinutes + event.visitMinutes) * 60000;
  const totalMinutes = walkingMinutes + stopMinutes + bufferMinutes + waitMinutes + event.visitMinutes;
  if (finishes > ends || totalMinutes > budgetMinutes) return null;
  return { arrivalTime: new Date(arrives).toISOString(), waitMinutes, totalMinutes };
}

function squaredDistance(a: Coordinates, b: Coordinates) {
  return (a.lat - b.lat) ** 2 + ((a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180)) ** 2;
}

export function buildEventDetours(context: CachedRoute, provider: EventProvider = sampleEventProvider): Promise<DetourOption[]> {
  context.detours ??= calculateEventDetours(context, provider);
  return context.detours;
}

async function calculateEventDetours(context: CachedRoute, provider: EventProvider): Promise<DetourOption[]> {
  const { request, route } = context;
  if (!request.includeEvents || route.source === "demo") return [];
  const departure = new Date();
  const events = await provider(departure);
  const nearby = events.map((event) => ({ event, proximity: Math.min(...route.geometry.coordinates.map(([lng, lat]) => squaredDistance(event.location, { lat, lng }))) })).filter(({ proximity }) => proximity < (0.0045 ** 2)).sort((a, b) => a.proximity - b.proximity).slice(0, 2);
  const options: DetourOption[] = [];
  const budget = { remaining: 2, rateLimited: false };
  for (const { event } of nearby) {
    if (budget.remaining <= 0 || budget.rateLimited) break;
    const waypoints: Coordinates[] = [request.start, ...route.stops.map(({ lat, lng }) => ({ lat, lng }))];
    if (route.isLoop) waypoints.push(request.start);
    else if (request.mode === "destination") {
      const destination = route.destination ?? request.destination;
      if (!destination) continue;
      waypoints.push(destination);
    }
    // Choose one inexpensive geometric insertion, then verify it on the network.
    let insertion = 1;
    let cost = Infinity;
    for (let index = 1; index < waypoints.length; index++) {
      const extra = Math.sqrt(squaredDistance(waypoints[index - 1], event.location)) + Math.sqrt(squaredDistance(event.location, waypoints[index])) - Math.sqrt(squaredDistance(waypoints[index - 1], waypoints[index]));
      if (extra < cost) { cost = extra; insertion = index; }
    }
    waypoints.splice(insertion, 0, event.location);
    try {
      const result = await routeWalking(waypoints, budget);
      if (result.segmentSeconds.length !== waypoints.length - 1) continue;
      const walkingMinutes = Math.ceil(result.durationSeconds / 60);
      const bufferMinutes = Math.max(2, Math.ceil(walkingMinutes * 0.1));
      const arrivalMinutes = Math.ceil(result.segmentSeconds.slice(0, insertion).reduce((sum, seconds) => sum + seconds, 0) / 60) + estimateStopMinutes(route.stops.slice(0, insertion - 1));
      const timing = evaluateEventTiming(walkingMinutes, route.stopMinutes, bufferMinutes, arrivalMinutes, event, departure, request.duration);
      if (!timing) continue;
      const eventRelevance = request.mood === "surprise" ? 80 :
        request.mood === "historic" && event.category === "history" ? 100 :
        request.mood === "hidden" && ["art", "music"].includes(event.category) ? 100 : 60;
      const modified: WanderRoute = { ...route, event, eventStopIndex: insertion - 1, id: `${route.id}:${event.id}`, name: `${route.name} + a sample event`, geometry: result.geometry, distanceMeters: result.distanceMeters, walkingMinutes, stopMinutes: route.stopMinutes + event.visitMinutes + timing.waitMinutes, bufferMinutes, totalMinutes: timing.totalMinutes, description: `${route.description} Includes a fictional sample event (${event.visitMinutes} minutes${timing.waitMinutes ? `, plus ${timing.waitMinutes} minutes waiting` : ""}).`, highlights: [...route.highlights.slice(0, 2), "Fictional sample event"] };
      modified.score = Math.max(0, scorePlaces(route.stops, request.mood, request.visitedIds, eventRelevance) - repetitionPenalty(result.geometry));
      modified.routingWarnings = result.warnings;
      options.push({ id: modified.id, event, route: modified, additionalMinutes: Math.max(0, modified.totalMinutes - route.totalMinutes), additionalDistanceMeters: Math.max(0, modified.distanceMeters - route.distanceMeters), arrivalTime: timing.arrivalTime });
    } catch {
      // A failed detour must never invalidate the user's original walk.
    }
  }
  return options;
}
