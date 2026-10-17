import type { MoodTag, Place, WanderRoute } from "../types";

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const matches: Record<MoodTag, Place["category"][]> = {
  scenic: ["viewpoint", "park", "path"], green: ["park", "path"],
  historic: ["historic"], hidden: ["art", "path"],
};

export function matchesMood(place: Place, mood: MoodTag): boolean {
  return matches[mood].includes(place.category);
}

/** No tags is Surprise me; otherwise a place scores fully when it fits any selected tag. */
export function preferenceScore(place: Place, moods: readonly MoodTag[]): number {
  return !moods.length ? 75 : moods.some((mood) => matchesMood(place, mood)) ? 100 : 30;
}

/** Share of the selected tags that at least one stop satisfies, 0 to 100. */
export function moodCoverage(stops: Place[], moods: readonly MoodTag[]): number {
  if (!moods.length) return 100;
  return moods.filter((mood) => stops.some((place) => matchesMood(place, mood))).length / moods.length * 100;
}

/**
 * Keeps the strongest places for every selected tag in the shortlist, so a
 * minority tag is not crowded out before candidate walks are combined.
 * Original order is preserved; with no tags this is a plain slice.
 */
export function shortlistForMoods(places: Place[], moods: readonly MoodTag[], limit = 20): Place[] {
  if (moods.length < 2 || places.length <= limit) return places.slice(0, limit);
  const keep = new Set<Place>();
  const perMood = Math.max(2, Math.floor(limit / (moods.length + 1)));
  for (const mood of moods) places.filter((place) => matchesMood(place, mood)).slice(0, perMood).forEach((place) => keep.add(place));
  for (const place of places) { if (keep.size >= limit) break; keep.add(place); }
  return places.filter((place) => keep.has(place));
}

export function scorePlaces(stops: Place[], moods: readonly MoodTag[], visitedIds: string[], eventRelevance?: number): number {
  if (!stops.length) return 0;
  const average = (fn: (place: Place) => number) => stops.reduce((sum, place) => sum + fn(place), 0) / stops.length;
  const scenic = average((place) => clamp(place.baseScenicScore));
  const visited = new Set(visitedIds);
  const novelty = average((place) => visited.has(place.id) ? 15 : place.category === "art" || place.category === "path" ? 95 : 80);
  const variety = Math.min(100, new Set(stops.map((place) => place.category)).size / Math.min(3, stops.length) * 100);
  // With several tags, a walk that touches each of them beats one that repeats a single tag.
  const fit = average((place) => preferenceScore(place, moods));
  const preference = moods.length > 1 ? fit * .5 + moodCoverage(stops, moods) * .5 : fit;
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
