import { DEFAULT_DURATION, isDuration } from './duration';
import { MOOD_TAGS, type MoodTag, type Pace } from './types';

/** "Finish elsewhere" becomes Targeted with a chosen destination, otherwise Explore. */
export type RouteShape = 'loop' | 'elsewhere';
/** No mood tags means Surprise me. */
/** `favourites` is the Favourites tag: favourite routes are strongly preferred. */
export type Preferences = { duration: number; moods: MoodTag[]; shape: RouteShape; includeEvents: boolean; demo: boolean; pace: Pace; favourites: boolean };
export const DEFAULT_PREFERENCES: Preferences = {
  duration: DEFAULT_DURATION, moods: [], shape: 'elsewhere', includeEvents: false, demo: false, pace: 'walk', favourites: false,
};

export const isMoodTag = (value: unknown): value is MoodTag => MOOD_TAGS.includes(value as MoodTag);

/** Keeps known tags once each, in the canonical tag order. */
export function normalizeMoods(moods: readonly MoodTag[]): MoodTag[] {
  return MOOD_TAGS.filter(tag => moods.includes(tag));
}

/** Saved preferences survive the restyle. Demo remains a session choice. */
export function restorePreferences(raw: unknown, hasLiveSetup: boolean): Preferences {
  const defaults = { ...DEFAULT_PREFERENCES, demo: !hasLiveSetup };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const value = raw as Record<string, unknown>;
  if (!isDuration(value.duration)) return defaults;
  let moods: MoodTag[];
  if (value.version === 4) {
    if (!Array.isArray(value.moods) || !value.moods.every(isMoodTag)) return defaults;
    moods = normalizeMoods(value.moods);
  } else {
    // Up to v3 a single mood was stored; Surprise me becomes no tags.
    if (value.mood !== 'surprise' && !isMoodTag(value.mood)) return defaults;
    moods = value.mood === 'surprise' ? [] : [value.mood as MoodTag];
  }
  let shape: RouteShape = defaults.shape;
  if (value.version === 3 || value.version === 4) {
    if (value.shape !== 'loop' && value.shape !== 'elsewhere') return defaults;
    shape = value.shape;
  } else if (value.version === 2) {
    // v2 stored a route mode; Targeted and Explore both finish elsewhere.
    if (!['destination', 'loop', 'explore'].includes(value.mode as string)) return defaults;
    shape = value.mode === 'loop' ? 'loop' : 'elsewhere';
  }
  return { duration: value.duration, moods, shape, includeEvents: value.includeEvents === true, demo: !hasLiveSetup, pace: value.pace === 'run' ? 'run' : 'walk', favourites: value.favourites === true };
}

export function persistablePreferences({ duration, moods, shape, includeEvents, pace, favourites }: Preferences) {
  return { version: 4, duration, moods, shape, includeEvents, pace, favourites };
}
