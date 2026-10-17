import type { GenerateRequest } from './types';

export type Preferences = Pick<GenerateRequest, 'duration' | 'mood' | 'mode' | 'includeEvents' | 'demo'>;
export const DEFAULT_PREFERENCES: Preferences = {
  duration: 30, mood: 'surprise', mode: 'destination', includeEvents: false, demo: false,
};

/** Demo is a session choice, never restored over newly configured live APIs. */
export function restorePreferences(raw: unknown, hasLiveSetup: boolean): Preferences {
  const defaults = { ...DEFAULT_PREFERENCES, demo: !hasLiveSetup };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const value = raw as Record<string, unknown>;
  if (![15, 30, 45, 60, 90].includes(value.duration as number) ||
      !['surprise', 'scenic', 'green', 'historic', 'hidden'].includes(value.mood as string) ||
      !['destination', 'loop', 'explore'].includes(value.mode as string)) return defaults;
  return { duration: value.duration as Preferences['duration'], mood: value.mood as Preferences['mood'], mode: value.mode as Preferences['mode'], includeEvents: value.includeEvents === true, demo: !hasLiveSetup };
}

export function persistablePreferences({ duration, mood, mode, includeEvents }: Preferences) {
  return { duration, mood, mode, includeEvents };
}
