import "server-only";
import type { Coordinates, GenerateRequest, Place, WanderRoute } from "../types";
import { distanceMeters, isCoordinates } from "./coordinates";
import { discoverExplorePlaces, discoverLoopPlaces, discoverTargetedPlaces } from "./places";
import { routeWalking, type RoutingBudget } from "./routing";
import { durationTimeFit, estimateExperience, estimateExperienceWithStops, fitsTimeBudget, preferenceScore, rankTimeMatchedRoutes, rankRoutes, repetitionPenalty, scorePlaces } from "./scoring";
import { chooseCandidate, loopCandidatePool, type ScenicCandidate } from "./loop-candidates";
import { openCandidatePool } from "./open-candidates";
import { paceSpeed } from "../pace";

function routeWaypoints(stops: Place[], request: GenerateRequest): Coordinates[] {
  if (request.mode === "destination") {
    if (!isCoordinates(request.destination)) throw new Error("Choose a destination before finding a scenic route.");
    return [request.start, ...stops, request.destination];
  }
  return request.mode === "loop" ? [request.start, ...stops, request.start] : [request.start, ...stops];
}

function candidatePool(places: Place[], request: GenerateRequest): ScenicCandidate[] {
  return request.mode === "loop" ? loopCandidatePool(places, request) : openCandidatePool(places, request);
}

async function discoverRoutePlaces(request: GenerateRequest): Promise<Place[]> {
  if (request.mode === "loop") return discoverLoopPlaces(request);
  if (request.mode === "explore") return discoverExplorePlaces(request);
  const destination = request.destination;
  if (!isCoordinates(destination)) throw new Error("Choose a destination before finding a scenic route.");

  // An optimistic straight-line lower bound prevents wasting provider requests
  // when the fixed endpoint cannot fit even before network detours and stops.
  if (request.mode !== "destination" && !fitsTimeBudget(estimateExperience(distanceMeters(request.start, destination) / 1.5 / paceSpeed(request.pace), 1).totalMinutes, request.duration)) {
    throw new Error("Your destination is too far away for this time budget. Choose a closer destination or a longer walk.");
  }
  return discoverTargetedPlaces(request);
}

export async function generateLiveRoutes(request: GenerateRequest): Promise<WanderRoute[]> {
  const places = await discoverRoutePlaces(request);
  if (places.length < (request.mode === "destination" ? 1 : 2)) {
    throw new Error(request.mode === "destination" ? "No interesting mapped stops were found toward your destination. Try a different destination or a longer walk." : "Not enough mapped places nearby. Try a different start, a longer walk, or Demo Mode.");
  }

  const pool = candidatePool(places, request);
  const modeName = request.mode === "loop" ? "loop" : request.mode === "explore" ? "Explore walk" : "Targeted walk";

  if (!pool.length) {
    if (request.mode === "destination") {
      throw new Error("No scenic stops fit on the way to your destination within this budget. Try a longer walk or a closer destination.");
    }
    throw new Error(`No ${modeName} close to ${request.duration} minutes could be planned from nearby scenic stops. Try another start or duration.`);
  }

  const budget: RoutingBudget = {remaining: 8, rateLimited: false};
  const attempted: ScenicCandidate[] = [];
  const routes: WanderRoute[] = [];
  const observed: { seconds: number; meters: number; totalMinutes: number }[] = [];
  let lastError: unknown;

  async function calculate(candidate: ScenicCandidate) {
    if (budget.remaining <= 0 || budget.rateLimited) return;
    attempted.push(candidate);
    try {
      const routed = await routeWalking(routeWaypoints(candidate.stops, request), budget);
      const timing = estimateExperienceWithStops(routed.durationSeconds / paceSpeed(request.pace), candidate.stops);
      observed.push({
        seconds: routed.durationSeconds,
        meters: candidate.geographicMeters,
        totalMinutes: timing.totalMinutes
      });

      const withinBudget = durationTimeFit(timing.totalMinutes, request.duration);
      let overBudgetMins = 0;

      if (!withinBudget) {
        if (request.mode === 'destination') {
          overBudgetMins = Math.round(timing.totalMinutes - request.duration);
        } else {
          return; // Skip non-destination routes that exceed time budget
        }
      }

      const isOverBudget = !withinBudget;

      const stops = candidate.stops;
      const dominant = [...stops].sort((a, b) => preferenceScore(b, request.moods) - preferenceScore(a, request.moods) || b.baseScenicScore - a.baseScenicScore)[0];
      const suffix = request.mode === "loop" ? "loop" : request.mode === "explore" ? "wander" : "scenic route";
      const ending = request.mode === "loop" ? ", then walk back to where you started." : request.mode === "explore" ? ", finishing somewhere new." : ", then arrive at your chosen destination.";

      routes.push({
        id: crypto.randomUUID(),
        name: `${dominant.name} ${suffix}`,
        description: `Discover ${stops.map((place) => place.name).join(" and ")}${ending}${isOverBudget ? ` Note: Exceeds preferred time by ${overBudgetMins} minutes.` : ""}`,        geometry: routed.geometry,
        stops,
        distanceMeters: Math.round(routed.distanceMeters),
        ...timing,
        score: Math.max(0, scorePlaces(stops, request.moods, request.visitedIds) - repetitionPenalty(routed.geometry)),
        highlights: stops.slice(0, 3).map((place) => place.name),
        isLoop: request.mode === "loop",
        source: "live",
        pace: request.pace ?? "walk",
        routingWarnings: [
          ...(routed.warnings || []),
          ...(isOverBudget ? [`Exceeds selected budget by ${overBudgetMins} mins`] : [])
        ],
        exceedsBudget: isOverBudget,
        budgetMinutes: request.duration,
        overBudgetMinutes: overBudgetMins,
        ...(request.mode === "destination" ? {destination: request.destination} : {})
      });
    } catch (error) {
      lastError = error;
    }
  }

  const initial: ScenicCandidate[] = [];
  for (const target of [.97, .90, 1.04, .97]) {
    const candidate = chooseCandidate(pool, request, initial, 1, target);
    if (candidate) initial.push(candidate);
  }

  let next = 0;

  async function worker() {
    while (next < initial.length && budget.remaining > 0 && !budget.rateLimited) {
      await calculate(initial[next++]);
    }
  }

  await Promise.all([worker(), worker()]);

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

  const hasOverBudget = routes.some(r => r.exceedsBudget);
  if (request.mode === "destination" && hasOverBudget) {
    return rankRoutes(routes);
  }

  return rankTimeMatchedRoutes(routes, request.duration);
}