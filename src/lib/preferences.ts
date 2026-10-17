import type { GenerateRequest } from './types';

export type Preferences = Pick<GenerateRequest, 'duration' | 'mood' | 'mode' | 'includeEvents' | 'demo'>;
export const DEFAULT_PREFERENCES: Preferences = {
  duration: 30, mood: 'surprise', mode: 'loop', includeEvents: false, demo: false,
};

/** Legacy preferences migrate once to Loop. Demo remains a session choice. */
export function restorePreferences(raw: unknown, hasLiveSetup: boolean): Preferences {
  const defaults = { ...DEFAULT_PREFERENCES, demo: !hasLiveSetup };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const value = raw as Record<string, unknown>;
  if (![15, 30, 45, 60, 90].includes(value.duration as number) ||
      !['surprise', 'scenic', 'green', 'historic', 'hidden'].includes(value.mood as string) ||
      !['destination', 'loop', 'explore'].includes(value.mode as string)) return defaults;
  return { duration: value.duration as Preferences['duration'], mood: value.mood as Preferences['mood'], mode: value.version === 2 ? value.mode as Preferences['mode'] : 'loop', includeEvents: value.includeEvents === true, demo: !hasLiveSetup };
}

export function persistablePreferences({ duration, mood, mode, includeEvents }: Preferences) {
  return { version: 2, duration, mood, mode, includeEvents };
}
