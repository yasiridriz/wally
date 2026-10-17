import type { Coordinates, GenerateRequest, Place } from "../types";
import { distanceMeters, pathDistance } from "./coordinates";
import { estimateExperienceWithStops, scorePlaces, stopOverlap } from "./scoring";

export type ScenicCandidate = { stops: Place[]; geographicMeters: number; key: string; spread: number };

function bearing(point: Coordinates, start: Coordinates) {
  return Math.atan2((point.lng - start.lng) * Math.cos(start.lat * Math.PI / 180), point.lat - start.lat);
}

function orderLoop(stops: Place[], start: Coordinates): Place[] {
  const angular = [...stops].sort((a, b) => bearing(a, start) - bearing(b, start));
  // Compare only cyclic rotations of one angular ordering, never all permutations.
  return angular.map((_, index) => [...angular.slice(index), ...angular.slice(0, index)])
    .sort((a, b) => pathDistance([start, ...a, start]) - pathDistance([start, ...b, start]))[0];
}

export function loopCandidatePool(places: Place[], request: GenerateRequest): ScenicCandidate[] {
  const available = places.filter((place) => distanceMeters(request.start, place) > 50).slice(0, 20);
  const pool: ScenicCandidate[] = [];
  const seen = new Set<string>();
  function add(stops: Place[]) {
    if (stops.some((place, index) => stops.slice(index + 1).some((other) => distanceMeters(place, other) < 80))) return;
    const key = stops.map((place) => place.id).sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    const ordered = orderLoop(stops, request.start);
    const geographicMeters = pathDistance([request.start, ...ordered, request.start]);
    // Initial walking model: network factor1.25 / walking speed1.25m/s.
    // Leave 25% headroom because the actual provider decides feasibility.
    const estimate = estimateExperienceWithStops(geographicMeters, ordered);
    if (geographicMeters < 180 || estimate.totalMinutes > request.duration * 1.25) return;
    const outward = Math.max(...stops.map((place) => distanceMeters(request.start, place)));
    const connecting = pathDistance(ordered);
    // More connecting distance relative to the outward leg favours a real circuit
    // over consecutive stops on the same radial line from the starting point.
    const spread = Math.min(1, connecting / Math.max(1, outward));
    pool.push({ stops: ordered, geographicMeters, key, spread });
  }
  for (let a = 0; a < available.length; a++) {
    for (let b = a + 1; b < available.length; b++) {
      const pair = [available[a], available[b]];
      add(pair);
      // At most one broad third stop per pair keeps the pool <=380 combinations.
      const third = available.filter((place) => !pair.includes(place))
        .sort((x, y) => {
          const cross = (p: Place) => Math.abs((pair[1].lng - pair[0].lng) * (p.lat - pair[0].lat) - (pair[1].lat - pair[0].lat) * (p.lng - pair[0].lng));
          return cross(y) - cross(x) || x.id.localeCompare(y.id);
        })[0];
      if (third) add([...pair, third]);
    }
  }
  return pool;
}

export function chooseCandidate(pool: ScenicCandidate[], request: GenerateRequest, selected: ScenicCandidate[], secondsPerMeter = 1, targetFraction = .97): ScenicCandidate | undefined {
  const used = new Set(selected.map((candidate) => candidate.key));
  function merit(candidate: ScenicCandidate): number {
    const estimated = estimateExperienceWithStops(candidate.geographicMeters * secondsPerMeter, candidate.stops).totalMinutes;
    const target = request.duration * targetFraction;
    const closeness = Math.abs(estimated - target) / request.duration;
    const overlap = selected.length ? Math.max(...selected.map((other) => stopOverlap(candidate.stops, other.stops))) : 0;
    const distanceFit = 250 * closeness + (estimated > request.duration ? 20 : 0);
    return -distanceFit + scorePlaces(candidate.stops, request.mood, request.visitedIds) * .12 + candidate.spread * 8 - overlap * 12;
  }
  return pool.filter((candidate) => !used.has(candidate.key))
    .sort((a, b) => merit(b) - merit(a) || a.key.localeCompare(b.key))[0];
}
