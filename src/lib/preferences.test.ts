import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, persistablePreferences, restorePreferences } from './preferences';
import { clampDuration, durationHint, friendlyDuration, isDuration } from './duration';

describe('preferences', () => {
  it('defaults to 30 minutes, finishing anywhere, with Surprise me', () => {
    expect(DEFAULT_PREFERENCES).toMatchObject({ duration: 30, shape: 'elsewhere', mood: 'surprise', includeEvents: false });
  });
  it.each([['loop', 'loop'], ['destination', 'elsewhere'], ['explore', 'elsewhere']] as const)('migrates a v2 %s preference to %s', (mode, shape) => {
    expect(restorePreferences({ version: 2, duration: 45, mood: 'green', mode, includeEvents: true }, true))
      .toEqual({ duration: 45, mood: 'green', shape, includeEvents: true, demo: false });
  });
  it('keeps an unversioned legacy budget and mood with the default shape', () => {
    expect(restorePreferences({ duration: 90, mood: 'scenic', mode: 'destination' }, true)).toMatchObject({ duration: 90, mood: 'scenic', shape: 'elsewhere' });
  });
  it.each(['loop', 'elsewhere'] as const)('round-trips a v3 %s preference with any whole-minute duration', shape => {
    expect(restorePreferences(persistablePreferences({ ...DEFAULT_PREFERENCES, shape, duration: 52 }), true)).toMatchObject({ shape, duration: 52 });
  });
  it('ignores a saved demo flag once credentials are configured, and stays in demo without them', () => {
    expect(restorePreferences({ ...persistablePreferences(DEFAULT_PREFERENCES), demo: true }, true).demo).toBe(false);
    expect(restorePreferences(persistablePreferences(DEFAULT_PREFERENCES), false).demo).toBe(true);
  });
  it.each([null, [], {}, { version: 3, duration: 4, mood: 'surprise', shape: 'loop' }, { version: 3, duration: 52.5, mood: 'surprise', shape: 'loop' }, { version: 3, duration: 30, mood: 'surprise', shape: 'arbitrary' }, { version: 2, duration: 30, mood: 'surprise', mode: 'arbitrary' }])('uses safe defaults for invalid stored data', raw => {
    expect(restorePreferences(raw, true)).toEqual(DEFAULT_PREFERENCES);
  });
  it('stores walking preferences without making Demo Mode sticky', () => {
    expect(persistablePreferences({ ...DEFAULT_PREFERENCES, demo: true })).toEqual({ version: 3, duration: 30, mood: 'surprise', shape: 'elsewhere', includeEvents: false });
  });
});

describe('duration', () => {
  it.each([[5, true], [180, true], [52, true], [4, false], [181, false], [52.5, false], ['30', false], [NaN, false]])('validates %s as %s', (value, valid) => {
    expect(isDuration(value)).toBe(valid);
  });
  it('clamps and rounds slider input', () => {
    expect([clampDuration(2), clampDuration(52.4), clampDuration(999), clampDuration(NaN)]).toEqual([5, 52, 180, 30]);
  });
  it.each([[20, 'A tiny escape.'], [35, 'Enough time to find a hidden gem.'], [50, 'Take the long way.'], [60, 'Make an afternoon of it. · 1 h'], [80, 'Get properly lost. · 1 h 20 min']])('hints %i minutes', (minutes, hint) => {
    expect(durationHint(minutes)).toBe(hint);
  });
  it('formats friendly durations', () => {
    expect([friendlyDuration(45), friendlyDuration(60), friendlyDuration(125)]).toEqual(['45 min', '1 h', '2 h 5 min']);
  });
});
