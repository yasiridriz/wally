import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, persistablePreferences, restorePreferences } from './preferences';

describe('live preference migration', () => {
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
    expect(persistablePreferences({ ...DEFAULT_PREFERENCES, demo: true })).toEqual({ duration: 30, mood: 'surprise', mode: 'destination', includeEvents: false });
  });
});
