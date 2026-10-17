import { isCoordinates } from './geo/coordinates';
import type { GenerateRequest, MemoryHint, MoodTag, Pace, Place, PlaceCategory, RouteMode, WanderRoute } from './types';

/** A stop as remembered in path history: enough to score and re-offer it, no photos. */
export type PlaceSummary = Pick<Place, 'id' | 'name' | 'category' | 'lat' | 'lng' | 'baseScenicScore'>;

/** A route the user opened. Stored only in this browser. */
export type HistoryEntry = {
  /** Stable id for this entry; also the review id when it is rated. */
  id: string;
  routeId: string;
  name: string;
  stops: PlaceSummary[];
  mode: RouteMode;
  pace: Pace;
  moods: MoodTag[];
  duration: number;
  totalMinutes: number;
  distanceMeters: number;
  source: WanderRoute['source'];
  selectedAt: string;
  /** 1–5 stars, when reviewed. */
  rating?: number;
  favourite: boolean;
};

export const HISTORY_LIMIT = 100;
/** How many recent history entries a route request carries. */
export const MEMORY_LIMIT = 50;
export const FAVOURITE_PLACES_LIMIT = 40;

/** Weights, in Wander-score points. */
const REPEAT_PENALTY = 30;
const FAVOURITE_ROUTE_BONUS = 60;
const FAVOURITE_PLACE_BONUS = 25;
const PERSONAL_RATING_WEIGHT = 5;
const COMMUNITY_RATING_WEIGHT = 4;
/** Community averages count fully from this many reviews of a place. */
const COMMUNITY_CONFIDENT_COUNT = 5;

const CATEGORIES: PlaceCategory[] = ['park', 'viewpoint', 'historic', 'art', 'attraction', 'path'];
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 120;
export const isRating = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;

export function summarizePlace({ id, name, category, lat, lng, baseScenicScore }: Place): PlaceSummary {
  return { id, name, category, lat, lng, baseScenicScore };
}

export function isPlaceSummary(value: unknown): value is PlaceSummary {
  if (!value || typeof value !== 'object') return false;
  const place = value as Record<string, unknown>;
  return isId(place.id) && typeof place.name === 'string' && place.name.length > 0 && place.name.length <= 200
    && CATEGORIES.includes(place.category as PlaceCategory)
    && typeof place.baseScenicScore === 'number' && Number.isFinite(place.baseScenicScore) && isCoordinates(place);
}

export function isMemoryHint(value: unknown): value is MemoryHint {
  if (!value || typeof value !== 'object') return false;
  const hint = value as Record<string, unknown>;
  return Array.isArray(hint.stopIds) && hint.stopIds.length > 0 && hint.stopIds.length <= 8 && hint.stopIds.every(isId)
    && (hint.rating === undefined || isRating(hint.rating)) && typeof hint.favourite === 'boolean';
}

/** The compact form of history a route request carries: most recent first. */
export function memoryHints(history: HistoryEntry[]): MemoryHint[] {
  return history.slice(0, MEMORY_LIMIT).map(entry => ({
    stopIds: entry.stops.map(stop => stop.id), favourite: entry.favourite, ...(entry.rating ? { rating: entry.rating } : {}),
  }));
}

/** Stops of favourite routes, once each, for the planner to offer again. */
export function favouritePlaces(history: HistoryEntry[]): PlaceSummary[] {
  const seen = new Set<string>();
  return history.filter(entry => entry.favourite).flatMap(entry => entry.stops)
    .filter(stop => !seen.has(stop.id) && seen.add(stop.id)).slice(0, FAVOURITE_PLACES_LIMIT);
}

/** Share of two stop sets that is shared (Jaccard): 1 means the same set of stops. */
function similarity(ids: Set<string>, other: string[]): number {
  const shared = other.filter(id => ids.has(id)).length;
  return shared / new Set([...ids, ...other]).size;
}

/**
 * Points added to a candidate's score from what this user did before and from
 * everyone's reviews. Repeating a route the user already opened costs points in
 * proportion to how similar it is, so new places and ways come first. With the
 * Favourites tag, favourite routes and their places gain points instead. Rated
 * routes pull their places up (4–5 stars) or down (1–2 stars) in new combinations.
 */
export function memoryScore(stops: Place[], request: Pick<GenerateRequest, 'memory' | 'favourites' | 'ratings'>): number {
  if (!stops.length) return 0;
  const ids = new Set(stops.map(stop => stop.id));
  const memory = request.memory ?? [];
  let repeat = 0;
  let favourite = 0;
  const favouriteIds = new Set<string>();
  const personal = new Map<string, { sum: number; count: number }>();
  for (const hint of memory) {
    const same = similarity(ids, hint.stopIds);
    if (hint.favourite && request.favourites) {
      favourite = Math.max(favourite, same);
      hint.stopIds.forEach(id => favouriteIds.add(id));
    } else repeat = Math.max(repeat, same);
    if (hint.rating) for (const id of hint.stopIds) {
      const total = personal.get(id) ?? { sum: 0, count: 0 };
      personal.set(id, { sum: total.sum + hint.rating, count: total.count + 1 });
    }
  }
  const perStop = (fn: (id: string) => number) => stops.reduce((sum, stop) => sum + fn(stop.id), 0) / stops.length;
  const favouriteShare = perStop(id => favouriteIds.has(id) ? 1 : 0);
  const personalRating = perStop(id => { const total = personal.get(id); return total ? total.sum / total.count - 3 : 0; });
  const communityRating = perStop(id => {
    const rated = request.ratings?.get(id);
    return rated ? (rated.average - 3) * Math.min(1, rated.count / COMMUNITY_CONFIDENT_COUNT) : 0;
  });
  return Math.round(-REPEAT_PENALTY * repeat + FAVOURITE_ROUTE_BONUS * favourite + FAVOURITE_PLACE_BONUS * favouriteShare
    + PERSONAL_RATING_WEIGHT * personalRating + COMMUNITY_RATING_WEIGHT * communityRating);
}

/**
 * With the Favourites tag, favourite stops that the walk can reach join the
 * discovered places, first, so they survive the candidate shortlist.
 */
export function withFavouritePlaces(places: Place[], request: Pick<GenerateRequest, 'favourites' | 'favouritePlaces'>, reachable: (place: Place) => boolean): Place[] {
  if (!request.favourites || !request.favouritePlaces?.length) return places;
  const favourites = request.favouritePlaces.filter(reachable);
  const ids = new Set(favourites.map(place => place.id));
  return [...favourites.map(place => places.find(found => found.id === place.id) ?? place), ...places.filter(place => !ids.has(place.id))];
}

/** Restores saved history, dropping anything malformed. */
export function restoreHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is HistoryEntry => {
    if (!entry || typeof entry !== 'object') return false;
    const value = entry as Record<string, unknown>;
    return isId(value.id) && isId(value.routeId) && typeof value.name === 'string' && Array.isArray(value.stops) && value.stops.length > 0
      && value.stops.every(isPlaceSummary) && ['loop', 'destination', 'explore'].includes(value.mode as string)
      && (value.pace === 'walk' || value.pace === 'run') && Array.isArray(value.moods) && typeof value.duration === 'number'
      && typeof value.totalMinutes === 'number' && typeof value.distanceMeters === 'number'
      && (value.source === 'live' || value.source === 'demo') && typeof value.selectedAt === 'string'
      && (value.rating === undefined || isRating(value.rating)) && typeof value.favourite === 'boolean';
  }).slice(0, HISTORY_LIMIT);
}
