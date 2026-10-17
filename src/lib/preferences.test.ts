import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, persistablePreferences, restorePreferences } from './preferences';

describe('live preference migration', () => {
  it('defaults new walks to Loop', () => {
    expect(DEFAULT_PREFERENCES.mode).toBe('loop');
  });
  it('migrates a legacy destination preference to Loop while retaining the budget and mood', () => {
    expect(restorePreferences({ duration: 90, mood: 'scenic', mode: 'destination', includeEvents: true, demo: true }, true))
      .toEqual({ duration: 90, mood: 'scenic', mode: 'loop', includeEvents: true, demo: false });
  });
  it.each(['loop', 'destination', 'explore'] as const)('retains an explicitly saved v2 %s preference', mode => {
    expect(restorePreferences(persistablePreferences({ ...DEFAULT_PREFERENCES, mode }), true).mode).toBe(mode);
  });
  it('ignores a saved demo flag once credentials are configured', () => {
    expect(restorePreferences({ ...DEFAULT_PREFERENCES, demo: true, duration: 45, mood: 'green' }, true))
      .toEqual({ ...DEFAULT_PREFERENCES, duration: 45, mood: 'green', demo: false });
  });
  it('keeps the credential-free experience explicitly in demo', () => {
    expect(restorePreferences({ ...DEFAULT_PREFERENCES, demo: false }, false).demo).toBe(true);
  });
  it.each([null, [], {}, { ...DEFAULT_PREFERENCES, duration: 999 }, { ...DEFAULT_PREFERENCES, mode: 'arbitrary' }])('uses safe defaults for invalid stored data', raw => {
    expect(restorePreferences(raw, true)).toEqual(DEFAULT_PREFERENCES);
  });
  it('stores walking preferences without making Demo Mode sticky', () => {
    expect(persistablePreferences({ ...DEFAULT_PREFERENCES, demo: true })).toEqual({ version: 2, duration: 30, mood: 'surprise', mode: 'loop', includeEvents: false });
  });
});
