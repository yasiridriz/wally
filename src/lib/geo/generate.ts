import "server-only";
import type { Coordinates, GenerateRequest, Place, WanderRoute } from "../types";
import { distanceMeters, isCoordinates, pathDistance, searchRadius } from "./coordinates";
import { discoverPlaces } from "./places";
import { routeWalking, type RoutingBudget } from "./routing";
import { estimateExperience, fitsTimeBudget, preferenceScore, rankRoutes, repetitionPenalty, scorePlaces, stopOverlap } from "./scoring";

type Candidate = { stops: Place[]; merit: number };

function routeWaypoints(stops: Place[], request: GenerateRequest): Coordinates[] {
  if (request.mode === "destination") {
    if (!isCoordinates(request.destination)) throw new Error("Choose a destination before finding a scenic route.");
    return [request.start, ...stops, request.destination];
  }
  return request.mode === "loop" ? [request.start, ...stops, request.start] : [request.start, ...stops];
}

function longitudeDelta(from: number, to: number): number {
  const delta = to - from;
  return delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta;
}

function destinationProgress(point: Coordinates, request: GenerateRequest): number {
  if (!request.destination) return distanceMeters(request.start, point);
  // Projection along the start-to-destination corridor, rather than distance from start,
  // prevents a side street from putting the later stop before the earlier one.
  const longitudeScale = Math.cos(request.start.lat * Math.PI / 180);
  const dx = longitudeDelta(request.start.lng, request.destination.lng) * longitudeScale;
  const dy = request.destination.lat - request.start.lat;
  return (longitudeDelta(request.start.lng, point.lng) * longitudeScale * dx + (point.lat - request.start.lat) * dy) / Math.max(Number.EPSILON, dx * dx + dy * dy);
}

async function discoverRoutePlaces(request: GenerateRequest): Promise<Place[]> {
  if (request.mode !== "destination") return discoverPlaces(request.start, searchRadius(request.duration, request.mode === "loop"));
  const destination = request.destination;
  if (!isCoordinates(destination)) throw new Error("Choose a destination before finding a scenic route.");
  const directDistance = distanceMeters(request.start, destination);
  // An optimistic lower bound avoids spending discovery/routing requests on an
  // endpoint that cannot fit even before network detours and a scenic stop.
  if (request.mode !== "destination" && !fitsTimeBudget(estimateExperience(directDistance / 1.5, 1).totalMinutes, request.duration)) {
    throw new Error("Your destination is too far away for this time budget. Choose a closer destination or a longer walk.");
  }
  const middleLongitude = request.start.lng + longitudeDelta(request.start.lng, destination.lng) / 2;
  const midpoint = { lat: (request.start.lat + destination.lat) / 2, lng: middleLongitude > 180 ? middleLongitude - 360 : middleLongitude < -180 ? middleLongitude + 360 : middleLongitude };
  const centers = directDistance <= 800 ? [midpoint] : [request.start, midpoint, destination];
  const radius = Math.min(3500, Math.max(350, Math.min(searchRadius(request.duration, false), directDistance / 3 + 250)));
  const groups: Place[][] = [];
  // Sequential discovery bounds Google Places requests. A failed corridor
  // query can use the other successful live results without inventing POIs.
  let lastError: unknown;
  for (const center of centers) {
    try { groups.push(await discoverPlaces(center, radius)); }
    catch (error) { lastError = error; }
  }
  if (!groups.length && lastError instanceof Error) throw lastError;
  const result: Place[] = [];
  for (let index = 0; index < 20 && result.length < 20; index++) {
    for (const group of groups) {
      const place = group[index];
      if (!place || result.some((other) => other.id === place.id || distanceMeters(other, place) < 45 || (other.name.toLowerCase() === place.name.toLowerCase() && distanceMeters(other, place) < 180))) continue;
      result.push(place);
      if (result.length === 20) break;
    }
  }
  return result;
}

export function shortlistCandidates(places: Place[], request: GenerateRequest): Place[][] {
  if (request.mode === "destination" && !isCoordinates(request.destination)) throw new Error("Choose a destination before finding a scenic route.");
  const available = places.filter((place) => distanceMeters(request.start, place) > 35 && (request.mode !== "destination" || distanceMeters(request.destination!, place) > 35)).slice(0, 20);
  const candidates: Candidate[] = [];

  function add(stops: Place[]) {
    const ordered = request.mode === "destination" ? [...stops].sort((a, b) => destinationProgress(a, request) - destinationProgress(b, request)) : stops;
    const points = routeWaypoints(ordered, request);

    // Straight-line distance is a shortlist heuristic only; actual walking determines eligibility.
    const estimate = estimateExperience(pathDistance(points) * 1.3 / 1.15, stops.length);

    // 👉 Allow over-budget candidate shortlisting specifically for Destination mode
    if (request.mode !== "destination" && estimate.totalMinutes > request.duration) return;
    if (pathDistance(points) < 180) return;

    const scenic = scorePlaces(stops, request.mood, request.visitedIds);
    const utilisation = estimate.totalMinutes / request.duration;

    candidates.push({
      stops: ordered,
      merit: scenic + 25 * utilisation + stops.reduce((sum, place) => sum + preferenceScore(place, request.mood), 0) / stops.length - 0.1
    });
  }

  // A single interesting stop is useful when a fixed destination leaves little spare time.
  if (request.mode === "destination") available.forEach((place) => add([place]));

  for (let a = 0; a < available.length; a++) {
    for (let b = a + 1; b < available.length; b++) {
      if (distanceMeters(available[a], available[b]) < 65) continue;
      const pair = [available[a], available[b]].sort((x, y) => distanceMeters(request.start, x) - distanceMeters(request.start, y));
      add(pair);
      if (request.duration >= 45) {
        const third = available.filter((place) => !pair.includes(place) && pair.every((other) => distanceMeters(place, other) > 65))
            .sort((x, y) => distanceMeters(pair[1], x) - distanceMeters(pair[1], y))[0];
        if (third) add([...pair, third]);
      }
    }
  }

  const selected: Candidate[] = [];
  while (candidates.length && selected.length < 6) {
    candidates.sort((a, b) => {
      const penalty = (candidate: Candidate) => selected.length ? Math.max(...selected.map((other) => stopOverlap(candidate.stops, other.stops))) * 35 : 0;
      return (b.merit - penalty(b)) - (a.merit - penalty(a)) || a.stops.map((place) => place.id).join().localeCompare(b.stops.map((place) => place.id).join());
    });
    const next = candidates.shift()!;
    if (!selected.some((other) => stopOverlap(next.stops, other.stops) === 1)) selected.push(next);
  }

  return selected.map((candidate) => candidate.stops);
}

export async function generateLiveRoutes(request: GenerateRequest): Promise<WanderRoute[]> {
  const places = await discoverRoutePlaces(request);
  if (places.length < (request.mode === "destination" ? 1 : 2)) throw new Error(request.mode === "destination" ? "No interesting mapped stops were found toward your destination. Try a different destination or a longer walk." : "Not enough mapped places nearby. Try a different start, a longer walk, or Demo Mode.");
  const candidates = shortlistCandidates(places, request);
  if (!candidates.length) throw new Error(request.mode === "destination" ? "No scenic stops fit on the way to your destination within this budget. Try a longer walk or a closer destination." : "Nearby stops are too far apart for this time budget. Try a longer walk or another start.");
  const budget: RoutingBudget = { remaining: 8, rateLimited: false };
  const routes: WanderRoute[] = [];
  let next = 0;
  let lastError: unknown;
  async function worker() {
    while (next < candidates.length && budget.remaining > 0 && !budget.rateLimited) {
      const index = next++;
      const stops = candidates[index];
      const waypoints = routeWaypoints(stops, request);
      try {
        const routed = await routeWalking(waypoints, budget);
        const timing = estimateExperience(routed.durationSeconds, stops.length);

        const fits = fitsTimeBudget(timing.totalMinutes, request.duration);
        let overBudgetMins = 0;

        if (!fits) {
          if (request.mode === 'destination') {
            overBudgetMins = Math.round(timing.totalMinutes - request.duration);
          } else {
            continue;
          }
        }

        const dominant = [...stops].sort((a, b) => preferenceScore(b, request.mood) - preferenceScore(a, request.mood) || b.baseScenicScore - a.baseScenicScore)[0];
        routes.push({
          id: crypto.randomUUID(),
          name: `${dominant.name} ${request.mode === 'loop' ? "loop" : request.mode === 'destination' ? "scenic route" : "wander"}`,
          description: `Discover ${stops.map((place) => place.name).join(" and ")}.${!fits ? ` Note: This route exceeds your preferred time budget by ${overBudgetMins} minutes.` : ""}`,
          geometry: routed.geometry,
          stops,
          distanceMeters: Math.round(routed.distanceMeters),
          ...timing,
          score: Math.max(0, scorePlaces(stops, request.mood, request.visitedIds) - repetitionPenalty(routed.geometry)),
          highlights: stops.slice(0, 3).map((place) => place.name),
          isLoop: request.mode === 'loop',
          source: "live",
          routingWarnings: [
            ...(routed.warnings || []),
            ...(!fits ? [`Exceeds selected budget by ${overBudgetMins} mins`] : [])
          ],
          // Over-budget metadata flags for UI / Map renderer
          exceedsBudget: !fits,
          budgetMinutes: request.duration,
          overBudgetMinutes: overBudgetMins,
          ...(request.mode === "destination" ? { destination: request.destination } : {})
        });
      } catch (error) { lastError = error; }
    }
  }
  await Promise.all([worker(), worker()]);
  if (!routes.length) {
    if (lastError instanceof Error) throw lastError;
    throw new Error(request.mode === "destination" ? "No verified scenic walking routes reach your destination within this budget. Try a longer walk or a closer destination." : "No verified walking routes fit this budget. Try a longer walk or another start.");
  }
  return rankRoutes(routes);
}