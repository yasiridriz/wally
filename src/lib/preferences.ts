import { DEFAULT_DURATION, isDuration } from './duration';
import type { Mood } from './types';

/** "Finish elsewhere" becomes Targeted with a chosen destination, otherwise Explore. */
export type RouteShape = 'loop' | 'elsewhere';
export type Preferences = { duration: number; mood: Mood; shape: RouteShape; includeEvents: boolean; demo: boolean };
export const DEFAULT_PREFERENCES: Preferences = {
  duration: DEFAULT_DURATION, mood: 'surprise', shape: 'elsewhere', includeEvents: false, demo: false,
};
const MOODS = ['surprise', 'scenic', 'green', 'historic', 'hidden'];

/** Saved preferences survive the restyle. Demo remains a session choice. */
export function restorePreferences(raw: unknown, hasLiveSetup: boolean): Preferences {
  const defaults = { ...DEFAULT_PREFERENCES, demo: !hasLiveSetup };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const value = raw as Record<string, unknown>;
  if (!isDuration(value.duration) || !MOODS.includes(value.mood as string)) return defaults;
  let shape: RouteShape = defaults.shape;
  if (value.version === 3) {
    if (value.shape !== 'loop' && value.shape !== 'elsewhere') return defaults;
    shape = value.shape;
  } else if (value.version === 2) {
    // v2 stored a route mode; Targeted and Explore both finish elsewhere.
    if (!['destination', 'loop', 'explore'].includes(value.mode as string)) return defaults;
    shape = value.mode === 'loop' ? 'loop' : 'elsewhere';
  }
  return { duration: value.duration, mood: value.mood as Mood, shape, includeEvents: value.includeEvents === true, demo: !hasLiveSetup };
}

export function persistablePreferences({ duration, mood, shape, includeEvents }: Preferences) {
  return { version: 3, duration, mood, shape, includeEvents };
}
