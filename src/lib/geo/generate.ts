import "server-only";
import type { Coordinates, GenerateRequest, Place, WanderRoute } from "../types";
import { distanceMeters, pathDistance, searchRadius } from "./coordinates";
import { discoverPlaces } from "./places";
import { routeWalking, type RoutingBudget } from "./routing";
import { estimateExperience, fitsTimeBudget, preferenceScore, rankRoutes, repetitionPenalty, scorePlaces, stopOverlap } from "./scoring";

type Candidate = { stops: Place[]; merit: number };

export function shortlistCandidates(places: Place[], request: GenerateRequest): Place[][] {
  const available = places.filter((place) => distanceMeters(request.start, place) > 35).slice(0, 20);
  const candidates: Candidate[] = [];
  function add(stops: Place[]) {
    const points: Coordinates[] = [request.start, ...stops];
    if (request.mode === "loop") points.push(request.start);
    // Straight-line distance is a shortlist heuristic only; actual walking determines eligibility.
    const estimate = estimateExperience(pathDistance(points) * 1.3 / 1.15, stops.length);
    if (estimate.totalMinutes > request.duration || pathDistance(points) < 180) return;
    const scenic = scorePlaces(stops, request.mood, request.visitedIds);
    const utilisation = estimate.totalMinutes / request.duration;
    candidates.push({ stops, merit: scenic + 25 * utilisation + stops.reduce((sum, place) => sum + preferenceScore(place, request.mood), 0) / stops.length * .1 });
  }
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
  const places = await discoverPlaces(request.start, searchRadius(request.duration, request.mode === "loop"));
  if (places.length < 2) throw new Error("Not enough mapped places nearby. Try a different start, a longer walk, or Demo Mode.");
  const candidates = shortlistCandidates(places, request);
  if (!candidates.length) throw new Error("Nearby stops are too far apart for this time budget. Try a longer walk or another start.");
  const budget: RoutingBudget = { remaining: 8, rateLimited: false };
  const routes: WanderRoute[] = [];
  let next = 0;
  let lastError: unknown;
  async function worker() {
    while (next < candidates.length && budget.remaining > 0 && !budget.rateLimited) {
      const index = next++;
      const stops = candidates[index];
      const waypoints: Coordinates[] = [request.start, ...stops];
      if (request.mode === "loop") waypoints.push(request.start);
      try {
        const routed = await routeWalking(waypoints, budget);
        const timing = estimateExperience(routed.durationSeconds, stops.length);
        if (!fitsTimeBudget(timing.totalMinutes, request.duration)) continue;
        const dominant = [...stops].sort((a, b) => preferenceScore(b, request.mood) - preferenceScore(a, request.mood) || b.baseScenicScore - a.baseScenicScore)[0];
        routes.push({ id: crypto.randomUUID(), name: `${dominant.name} ${request.mode === "loop" ? "loop" : "wander"}`,
          description: `Discover ${stops.map((place) => place.name).join(" and ")}${request.mode === "loop" ? ", then return to where you started." : ", finishing somewhere new."}`,
          geometry: routed.geometry, stops, distanceMeters: Math.round(routed.distanceMeters), ...timing,
          score: Math.max(0, scorePlaces(stops, request.mood, request.visitedIds) - repetitionPenalty(routed.geometry)),
          highlights: stops.slice(0, 3).map((place) => place.name), isLoop: request.mode === "loop", source: "live" });
      } catch (error) { lastError = error; }
    }
  }
  await Promise.all([worker(), worker()]);
  if (!routes.length) {
    if (lastError instanceof Error) throw lastError;
    throw new Error("No verified walking routes fit this budget. Try a longer walk or another start.");
  }
  return rankRoutes(routes);
}
