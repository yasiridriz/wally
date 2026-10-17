import type { Coordinates, GenerateRequest, Place } from "../types";
import { distanceMeters, pathDistance } from "./coordinates";
import { estimateExperienceWithStops } from "./scoring";
import type { ScenicCandidate } from "./loop-candidates";

function orderStops(stops: Place[], request: GenerateRequest): Place[] {
  const remaining = [...stops];
  const ordered: Place[] = [];
  let current: Coordinates = request.start;
  while (remaining.length) {
    remaining.sort((a, b) => distanceMeters(current, a) - distanceMeters(current, b) || a.id.localeCompare(b.id));
    current = remaining.shift()!;
    ordered.push(current as Place);
  }
  if (request.mode !== "destination" || !request.destination) return ordered;
  const length = (points: Place[]) => pathDistance([request.start, ...points, request.destination!]);
  const reverse = [...ordered].reverse();
  return length(reverse) < length(ordered) ? reverse : ordered;
}

export function openCandidatePool(places: Place[], request: GenerateRequest): ScenicCandidate[] {
  const available = places.filter((place) => distanceMeters(request.start, place) > 50 &&
    (request.mode !== "destination" || !request.destination || distanceMeters(request.destination, place) > 50)).slice(0, 20);
  const pool: ScenicCandidate[] = [];
  const seen = new Set<string>();
  function candidate(stops: Place[]): ScenicCandidate | undefined {
    if (stops.some((place, index) => stops.slice(index + 1).some((other) => distanceMeters(place, other) < 80))) return;
    const ordered = orderStops(stops, request);
    const points: Coordinates[] = [request.start, ...ordered];
    if (request.mode === "destination" && request.destination) points.push(request.destination);
    const geographicMeters = pathDistance(points);
    if (geographicMeters < 180 || estimateExperienceWithStops(geographicMeters, ordered).totalMinutes > request.duration * 1.25) return;
    const outward = Math.max(...stops.map((place) => distanceMeters(request.start, place)));
    return { stops: ordered, geographicMeters, key: stops.map((place) => place.id).sort().join("|"),
      spread: Math.min(1, pathDistance(ordered) / Math.max(1, outward)) };
  }
  function add(value: ScenicCandidate | undefined) {
    if (!value || seen.has(value.key)) return;
    seen.add(value.key);
    pool.push(value);
  }
  // Targeted walks may use a single worthwhile stop when the endpoint consumes
  // most of the budget. Longer budgets still shortlist genuine side detours.
  if (request.mode === "destination") available.forEach((place) => add(candidate([place])));
  for (let a = 0; a < available.length; a++) {
    for (let b = a + 1; b < available.length; b++) {
      const pair = [available[a], available[b]];
      add(candidate(pair));
      // One third stop per pair bounds the pool at380 Explore /400 Targeted.
      const thirds = available.filter((place) => !pair.includes(place))
        .map((place) => candidate([...pair, place])).filter((value): value is ScenicCandidate => !!value);
      thirds.sort((x, y) => {
        const difference = (value: ScenicCandidate) => Math.abs(estimateExperienceWithStops(value.geographicMeters, value.stops).totalMinutes - request.duration * .97);
        return difference(x) - difference(y) || y.spread - x.spread || x.key.localeCompare(y.key);
      });
      add(thirds[0]);
    }
  }
  return pool;
}
