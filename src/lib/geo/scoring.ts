import type { Mood, Place, WanderRoute } from "../types";

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const matches: Record<Mood, Place["category"][]> = {
  surprise: ["park", "viewpoint", "historic", "art", "attraction", "path"],
  scenic: ["viewpoint", "park", "path"], green: ["park", "path"],
  historic: ["historic"], hidden: ["art", "path"],
};

export function preferenceScore(place: Place, mood: Mood): number {
  return mood === "surprise" ? 75 : matches[mood].includes(place.category) ? 100 : 30;
}

export function scorePlaces(stops: Place[], mood: Mood, visitedIds: string[], eventRelevance?: number): number {
  if (!stops.length) return 0;
  const average = (fn: (place: Place) => number) => stops.reduce((sum, place) => sum + fn(place), 0) / stops.length;
  const scenic = average((place) => clamp(place.baseScenicScore));
  const visited = new Set(visitedIds);
  const novelty = average((place) => visited.has(place.id) ? 15 : place.category === "art" || place.category === "path" ? 95 : 80);
  const variety = Math.min(100, new Set(stops.map((place) => place.category)).size / Math.min(3, stops.length) * 100);
  const preference = average((place) => preferenceScore(place, mood));
  const base = scenic * .30 + novelty * .25 + variety * .15 + preference * .20;
  return Math.round(eventRelevance === undefined ? base / .9 : base + clamp(eventRelevance) * .10);
}

export function estimateExperience(durationSeconds: number, stopCount: number, eventMinutes = 0) {
  const walkingMinutes = Math.ceil(durationSeconds / 60);
  const stopMinutes = stopCount * 2;
  const bufferMinutes = Math.max(2, Math.ceil(walkingMinutes * .1));
  return { walkingMinutes, stopMinutes, bufferMinutes, totalMinutes: walkingMinutes + stopMinutes + bufferMinutes + eventMinutes };
}

/** Planned short visits, not claims about admission, opening hours or events. */
export function plannedVisitMinutes(place: Place): number {
  return Number.isFinite(place.visitMinutes) && place.visitMinutes! >= 1 && place.visitMinutes! <= 15
    ? Math.ceil(place.visitMinutes!) : 2;
}

export function estimateStopMinutes(stops: Place[]): number {
  return stops.reduce((sum, place) => sum + plannedVisitMinutes(place), 0);
}

export function estimateExperienceWithStops(durationSeconds: number, stops: Place[]) {
  const timing = estimateExperience(durationSeconds, 0);
  const stopMinutes = estimateStopMinutes(stops);
  return { ...timing, stopMinutes, totalMinutes: timing.walkingMinutes + stopMinutes + timing.bufferMinutes };
}

/** All modes use the same conservative total-trip duration target. */
export function durationTimeFit(totalMinutes: number, budget: number): boolean {
  return fitsTimeBudget(totalMinutes, budget) && totalMinutes >= Math.ceil(budget * .9);
}

export function rankTimeMatchedRoutes(routes: WanderRoute[], budget: number): WanderRoute[] {
  const ranked = routes.filter(route => durationTimeFit(route.totalMinutes, budget))
    .sort((a, b) => Math.abs(budget - a.totalMinutes) - Math.abs(budget - b.totalMinutes) || b.score - a.score || a.name.localeCompare(b.name));
  const selected: WanderRoute[] = [];
  for (const route of ranked) {
    if (selected.every(other => stopOverlap(route.stops, other.stops) <= .5)) selected.push(route);
    if (selected.length === 3) break;
  }
  return selected;
}

export function loopTimeFit(totalMinutes: number, budget: number): boolean {
  return durationTimeFit(totalMinutes, budget);
}

export function rankLoopRoutes(routes: WanderRoute[], budget: number): WanderRoute[] {
  return rankTimeMatchedRoutes(routes.filter(route => route.isLoop), budget);
}

export function fitsTimeBudget(totalMinutes: number, budget: number): boolean {
  return Number.isFinite(totalMinutes) && totalMinutes > 0 && totalMinutes <= budget;
}

export function stopOverlap(a: Place[], b: Place[]): number {
  if (!a.length || !b.length) return 0;
  const ids = new Set(a.map((place) => place.id));
  return b.filter((place) => ids.has(place.id)).length / Math.min(a.length, b.length);
}

/** Reversed edges count as repeated too, penalising out-and-back paths. */
export function repetitionPenalty(geometry: GeoJSON.LineString): number {
  const edges = new Set<string>();
  let repeated = 0;
  for (let i = 1; i < geometry.coordinates.length; i++) {
    const pointKey = (p: number[]) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
    const edge = [pointKey(geometry.coordinates[i - 1]), pointKey(geometry.coordinates[i])].sort().join(":");
    if (edges.has(edge)) repeated++;
    edges.add(edge);
  }
  return Math.round(20 * repeated / Math.max(1, geometry.coordinates.length - 1));
}

export function rankRoutes(routes: WanderRoute[], limit = 3): WanderRoute[] {
  const ranked = [...routes].sort((a, b) => b.score - a.score || a.totalMinutes - b.totalMinutes || a.id.localeCompare(b.id));
  const selected: WanderRoute[] = [];
  for (const route of ranked) {
    if (selected.every((other) => stopOverlap(route.stops, other.stops) <= .5)) selected.push(route);
    if (selected.length >= Math.min(3, Math.max(1, limit))) break;
  }
  return selected;
}
