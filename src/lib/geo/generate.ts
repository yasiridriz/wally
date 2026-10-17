import "server-only";
import type { Coordinates, GenerateRequest, Place, WanderRoute } from "../types";
import { distanceMeters, isCoordinates, searchRadius } from "./coordinates";
import { offset } from "./coordinates";
import { discoverExplorePlaces, discoverLoopPlaces, discoverTargetedPlaces } from "./places";
import { routeWalking, type RoutingBudget, type Waypoint, type WalkingResult } from "./routing";
import { durationTimeFit, estimateExperience, estimateExperienceWithStops, fitsTimeBudget, preferenceScore, rankTimeMatchedRoutes, repetitionPenalty, retraceShare, scorePlaces } from "./scoring";
import { chooseCandidate, loopCandidatePool, type ScenicCandidate } from "./loop-candidates";
import { openCandidatePool } from "./open-candidates";
import { paceSpeed } from "../pace";
import { memoryScore, withFavouritePlaces } from "../memory";

function routeWaypoints(stops: Place[], request: GenerateRequest): Coordinates[] {
  if (request.mode === "destination") {
    if (!isCoordinates(request.destination)) throw new Error("Choose a destination before finding a scenic route.");
    return [request.start, ...stops, request.destination];
  }
  return request.mode === "loop" ? [request.start, ...stops, request.start] : [request.start, ...stops];
}

/** The Wander score with path memory folded in, kept within 0–100. */
export function scoreWithMemory(stops: Place[], request: GenerateRequest, penalty = 0): Pick<WanderRoute, "score" | "memoryScore"> {
  const memory = memoryScore(stops, request);
  return { score: Math.min(100, Math.max(0, scorePlaces(stops, request.moods, request.visitedIds) - penalty + memory)), memoryScore: memory };
}

function candidatePool(places: Place[], request: GenerateRequest): ScenicCandidate[] {
  return request.mode === "loop" ? loopCandidatePool(places, request) : openCandidatePool(places, request);
}

export function shortlistCandidates(places: Place[], request: GenerateRequest): Place[][] {
  if (request.mode === "destination" && !isCoordinates(request.destination)) throw new Error("Choose a destination before finding a scenic route.");
  const pool = candidatePool(places, request);
  const selected: ScenicCandidate[] = [];
  for (let index = 0; index < 6; index++) {
    const candidate = chooseCandidate(pool, request, selected);
    if (!candidate) break;
    selected.push(candidate);
  }
  return selected.map((candidate) => candidate.stops);
}

/** A loop that walks back over more than this share of its own path gets a different way home. */
export const LOOP_RETRACE_LIMIT = .12;

/**
 * A pass-through point that pulls the way home off the outbound path: beside
 * the straight line from the last stop to the start, on the side away from
 * the other stops (where the outbound path runs).
 */
export function returnViaPoint(stops: Place[], start: Coordinates): Waypoint | undefined {
  const last = stops[stops.length - 1];
  if (!last) return undefined;
  const leg = distanceMeters(last, start);
  if (leg < 150) return undefined;
  const scale = Math.cos(start.lat * Math.PI / 180);
  // Local flat coordinates in metres-ish units, x east and y north.
  const toXY = (p: Coordinates) => ({ x: (p.lng - start.lng) * scale, y: p.lat - start.lat });
  const a = toXY(last);
  const outbound = stops.length > 1 ? stops.slice(0, -1) : [last];
  const centroid = outbound.map(toXY).reduce((sum, p) => ({ x: sum.x + p.x / outbound.length, y: sum.y + p.y / outbound.length }), { x: 0, y: 0 });
  // Normal to the return leg; flip it away from the outbound stops.
  let normal = { x: -a.y, y: a.x };
  if (normal.x * (centroid.x - a.x / 2) + normal.y * (centroid.y - a.y / 2) > 0) normal = { x: -normal.x, y: -normal.y };
  const bearing = (Math.atan2(normal.x, normal.y) * 180 / Math.PI + 360) % 360;
  const midpoint = { lat: (last.lat + start.lat) / 2, lng: (last.lng + start.lng) / 2 };
  return { ...offset(midpoint, Math.min(600, Math.max(120, leg * .35)), bearing), via: true };
}

/** Favourite stops the walk could reach, by the same areas discovery searches. */
function reachable(request: GenerateRequest) {
  const speed = paceSpeed(request.pace);
  if (request.mode === "destination" && request.destination) {
    const envelope = Math.max(350, (request.duration - 5) * 80 * speed);
    return (place: Place) => distanceMeters(request.start, place) + distanceMeters(place, request.destination!) <= envelope;
  }
  const radius = searchRadius(request.duration, request.mode === "loop", speed);
  return (place: Place) => distanceMeters(request.start, place) <= radius;
}

async function discoverRoutePlaces(request: GenerateRequest): Promise<Place[]> {
  return withFavouritePlaces(await discoverNearbyPlaces(request), request, reachable(request));
}

async function discoverNearbyPlaces(request: GenerateRequest): Promise<Place[]> {
  if (request.mode === "loop") return discoverLoopPlaces(request);
  if (request.mode === "explore") return discoverExplorePlaces(request);
  const destination = request.destination;
  if (!isCoordinates(destination)) throw new Error("Choose a destination before finding a scenic route.");
  // An optimistic straight-line lower bound prevents wasting provider requests
  // when the fixed endpoint cannot fit even before network detours and stops.
  if (!fitsTimeBudget(estimateExperience(distanceMeters(request.start, destination) / 1.5 / paceSpeed(request.pace), 1).totalMinutes, request.duration)) {
    throw new Error("Your destination is too far away for this time budget. Choose a closer destination or a longer walk.");
  }
  return discoverTargetedPlaces(request);
}

/**
 * The direct way to the destination with no stops. Used only when no walk fits
 * the time, so the user can still see the path and how much longer it takes.
 */
export async function directRoute(request: GenerateRequest): Promise<WanderRoute> {
  if (request.mode !== "destination" || !isCoordinates(request.destination)) throw new Error("Choose a destination before finding a route.");
  // A separate, small allowance: the planner's own attempts may already be spent.
  const routed = await routeWalking([request.start, request.destination], { remaining: 2, rateLimited: false });
  const timing = estimateExperienceWithStops(routed.durationSeconds / paceSpeed(request.pace), []);
  const verb = request.pace === "run" ? "run" : "walk";
  return {
    id: crypto.randomUUID(), name: "Direct route to your destination",
    description: `The most direct ${verb} to your destination takes about ${timing.totalMinutes} minutes, more than your ${request.duration}-minute budget.`,
    geometry: routed.geometry, stops: [], distanceMeters: Math.round(routed.distanceMeters), ...timing, score: 0, highlights: [],
    isLoop: false, source: "live", pace: request.pace ?? "walk", destination: request.destination, routingWarnings: routed.warnings, overBudget: true,
  };
}

/**
 * Plans walks. When a destination cannot be reached in the chosen time, the
 * direct route comes back marked `overBudget` instead of an error.
 */
export async function generateLiveRoutes(request: GenerateRequest): Promise<WanderRoute[]> {
  if (request.mode !== "destination") return planRoutes(request);
  try {
    return await planRoutes(request);
  } catch (error) {
    const direct = await directRoute(request).catch(() => undefined);
    // A direct route within budget means the failure was something else; keep its explanation.
    if (direct && direct.totalMinutes > request.duration) return [direct];
    throw error;
  }
}

async function planRoutes(request: GenerateRequest): Promise<WanderRoute[]> {
  const places = await discoverRoutePlaces(request);
  if (places.length < (request.mode === "destination" ? 1 : 2)) throw new Error(request.mode === "destination" ? "No interesting mapped stops were found toward your destination. Try a different destination or a longer walk." : "Not enough mapped places nearby. Try a different start, a longer walk, or Demo Mode.");
  const pool = candidatePool(places, request);
  const modeName = request.mode === "loop" ? "loop" : request.mode === "explore" ? "Explore walk" : "Targeted walk";
  if (!pool.length) throw new Error(`No ${modeName} close to ${request.duration} minutes could be planned from nearby scenic stops. Try another start or duration.`);
  const budget: RoutingBudget = { remaining: 8, rateLimited: false };
  const attempted: ScenicCandidate[] = [];
  const routes: WanderRoute[] = [];
  const observed: { seconds: number; meters: number; totalMinutes: number }[] = [];
  let lastError: unknown;

  /** Loops that come home the way they went out are routed again through a return via point. */
  async function loopAwareRoute(stops: Place[]): Promise<WalkingResult> {
    const waypoints = routeWaypoints(stops, request);
    const routed = await routeWalking(waypoints, budget);
    if (request.mode !== "loop" || retraceShare(routed.geometry) <= LOOP_RETRACE_LIMIT || budget.remaining <= 0 || budget.rateLimited) return routed;
    const via = returnViaPoint(stops, request.start);
    if (!via) return routed;
    try {
      const alternative = await routeWalking([...waypoints.slice(0, -1), via, request.start], budget);
      const fits = (result: WalkingResult) => durationTimeFit(estimateExperienceWithStops(result.durationSeconds / paceSpeed(request.pace), stops).totalMinutes, request.duration);
      // Prefer the different way home unless it breaks a time fit the original had.
      return retraceShare(alternative.geometry) < retraceShare(routed.geometry) && (fits(alternative) || !fits(routed)) ? alternative : routed;
    } catch { return routed; }
  }

  async function calculate(candidate: ScenicCandidate) {
    if (budget.remaining <= 0 || budget.rateLimited) return;
    attempted.push(candidate);
    try {
      // Endpoint rules apply to every initial and adaptive request. Provider
      // duration includes the full return leg or selected destination leg.
      const routed = await loopAwareRoute(candidate.stops);
      // The provider times a walk; running covers the same path faster.
      const timing = estimateExperienceWithStops(routed.durationSeconds / paceSpeed(request.pace), candidate.stops);
      observed.push({ seconds: routed.durationSeconds, meters: candidate.geographicMeters, totalMinutes: timing.totalMinutes });
      if (!durationTimeFit(timing.totalMinutes, request.duration)) return;
      const stops = candidate.stops;
      const dominant = [...stops].sort((a, b) => preferenceScore(b, request.moods) - preferenceScore(a, request.moods) || b.baseScenicScore - a.baseScenicScore)[0];
      const suffix = request.mode === "loop" ? "loop" : request.mode === "explore" ? "wander" : "scenic route";
      const ending = request.mode === "loop" ? ", then walk back to where you started." : request.mode === "explore" ? ", finishing somewhere new." : ", then arrive at your chosen destination.";
      routes.push({ id: crypto.randomUUID(), name: `${dominant.name} ${suffix}`,
        description: `Discover ${stops.map((place) => place.name).join(" and ")}${ending}`,
        geometry: routed.geometry, stops, distanceMeters: Math.round(routed.distanceMeters), ...timing,
        ...scoreWithMemory(stops, request, repetitionPenalty(routed.geometry)),
        highlights: stops.slice(0, 3).map((place) => place.name), isLoop: request.mode === "loop", source: "live", pace: request.pace ?? "walk", routingWarnings: routed.warnings,
        ...(request.mode === "destination" ? { destination: request.destination } : {}) });
    } catch (error) { lastError = error; }
  }

  const initial: ScenicCandidate[] = [];
  for (const target of [.97, .90, 1.04, .97]) {
    const candidate = chooseCandidate(pool, request, initial, 1, target);
    if (candidate) initial.push(candidate);
  }
  let next = 0;
  async function worker() {
    while (next < initial.length && budget.remaining > 0 && !budget.rateLimited) await calculate(initial[next++]);
  }
  await Promise.all([worker(), worker()]);

  // Measured network timing selects two untried combinations. The same bounded
  // calibration applies to all modes; no waiting time is invented to fill a budget.
  for (let index = 0; index < 2 && budget.remaining > 0 && !budget.rateLimited; index++) {
    const ratios = observed.map((value) => value.seconds / value.meters).filter((ratio) => Number.isFinite(ratio) && ratio > 0).sort((a, b) => a - b);
    const secondsPerMeter = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
    const candidate = chooseCandidate(pool, request, attempted, secondsPerMeter);
    if (!candidate) break;
    await calculate(candidate);
  }
  if (!routes.length) {
    if (!observed.length && lastError instanceof Error) throw lastError;
    const totals = observed.map((value) => value.totalMinutes).sort((a, b) => a - b);
    const verifiedLabel = request.mode === "loop" ? "loops" : `${request.mode === "explore" ? "Explore" : "Targeted"} walks`;
    const detail = totals.length ? ` Verified ${verifiedLabel} ranged from ${totals[0]} to ${totals[totals.length - 1]} minutes.` : "";
    throw new Error(`No ${modeName} close to ${request.duration} minutes fits your budget.${detail} Try another start or duration.`);
  }
  return rankTimeMatchedRoutes(routes, request.duration);
}
