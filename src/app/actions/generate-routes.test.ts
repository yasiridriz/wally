import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/geo/generate', () => ({ generateLiveRoutes: vi.fn() }));
vi.mock('@/lib/events', () => ({ registerGeneratedRoutes: vi.fn() }));
vi.mock('@/lib/reviews', () => ({ loadPlaceRatings: vi.fn(async () => new Map([['ChIJ1', { average: 4.5, count: 6 }]])) }));
import { generateRoutes } from './generate-routes';
import { generateLiveRoutes } from '@/lib/geo/generate';
import { DEMO_DESTINATION, DEMO_START } from '@/lib/demo-data';
import type { GenerateRequest } from '@/lib/types';

const request: GenerateRequest = {
  start: { lat: 55.9442, lng: -3.19055 }, destination: { lat: 55.94695, lng: -3.1891 },
  duration: 30, mode: 'destination', moods: ['green'], includeEvents: false, demo: false, visitedIds: [],
};
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('destination action input', () => {
  it.each([undefined, null, {}, { lat: NaN, lng: 0 }, { lat: 90, lng: 0 }, { lat: 55, lng: 181 }])('rejects missing or malformed destination before external calls', async destination => {
    expect(await generateRoutes({ ...request, destination })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(generateLiveRoutes).not.toHaveBeenCalled();
  });
  it('rejects a destination on top of the start, and plans any distant one so its time can be shown', async () => {
    expect(await generateRoutes({ ...request, destination: request.start })).toMatchObject({ ok: false, code: 'INVALID_DESTINATION' });
    expect(generateLiveRoutes).not.toHaveBeenCalled();
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
    vi.mocked(generateLiveRoutes).mockResolvedValue([]);
    // Edinburgh to London: no distance limit; the planner returns the direct route marked over budget.
    expect(await generateRoutes({ ...request, destination: { lat: 51.5, lng: -0.12 } })).toMatchObject({ ok: true });
    expect(generateLiveRoutes).toHaveBeenCalledTimes(1);
  });
  it('passes only validated destination coordinates to live routing', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
    vi.mocked(generateLiveRoutes).mockResolvedValue([]);
    await generateRoutes({ ...request, destination: { ...request.destination, clientScore: 100, distanceMeters: 1 } });
    expect(generateLiveRoutes).toHaveBeenCalledWith(expect.objectContaining({ ...request, pace: 'walk' }));
  });
  it('passes validated path memory and community ratings, and rejects malformed memory', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
    vi.mocked(generateLiveRoutes).mockResolvedValue([]);
    const favourite = { id: 'ChIJ1', name: 'Calton Hill', category: 'viewpoint', lat: 55.955, lng: -3.182, baseScenicScore: 900, photo: 'x' };
    await generateRoutes({ ...request, memory: [{ stopIds: ['ChIJ1', 'ChIJ2'], favourite: true, rating: 5, extra: 1 }], favourites: true, favouritePlaces: [favourite] });
    const passed = vi.mocked(generateLiveRoutes).mock.calls[0][0];
    expect(passed.memory).toEqual([{ stopIds: ['ChIJ1', 'ChIJ2'], favourite: true, rating: 5 }]);
    expect(passed.favourites).toBe(true);
    expect(passed.favouritePlaces).toEqual([{ id: 'ChIJ1', name: 'Calton Hill', category: 'viewpoint', lat: 55.955, lng: -3.182, baseScenicScore: 100 }]);
    expect(passed.ratings?.get('ChIJ1')).toEqual({ average: 4.5, count: 6 });
    for (const memory of [[{ stopIds: [], favourite: false }], [{ stopIds: ['a'], favourite: false, rating: 7 }], 'a', Array(51).fill({ stopIds: ['a'], favourite: false })]) {
      expect(await generateRoutes({ ...request, memory })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    }
    expect(await generateRoutes({ ...request, favourites: true, favouritePlaces: [{ ...favourite, category: 'casino' }] })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    // A client can never supply community ratings itself.
    vi.mocked(generateLiveRoutes).mockClear();
    await generateRoutes({ ...request, ratings: { ChIJ9: { average: 5, count: 99 } } });
    expect(vi.mocked(generateLiveRoutes).mock.calls[0][0].ratings?.has('ChIJ9')).toBe(false);
  });
  it('accepts a running pace and rejects unknown paces', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
    vi.mocked(generateLiveRoutes).mockResolvedValue([]);
    await generateRoutes({ ...request, pace: 'run' });
    expect(generateLiveRoutes).toHaveBeenCalledWith(expect.objectContaining({ ...request, pace: 'run' }));
    expect(await generateRoutes({ ...request, pace: 'sprint' })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    // A destination out of reach in the time is passed on, so the direct route can be shown in red.
    vi.mocked(generateLiveRoutes).mockClear();
    await generateRoutes({ ...request, destination: { lat: request.start.lat + 0.036, lng: request.start.lng } });
    expect(generateLiveRoutes).toHaveBeenCalledTimes(1);
  });
  it('discards an irrelevant destination in loop mode', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
    vi.mocked(generateLiveRoutes).mockResolvedValue([]);
    await generateRoutes({ ...request, mode: 'loop' });
    expect(vi.mocked(generateLiveRoutes).mock.calls[0][0].destination).toBeUndefined();
  });
  it('accepts any whole-minute duration from 5 to 480 and rejects others', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
    vi.mocked(generateLiveRoutes).mockResolvedValue([]);
    await generateRoutes({ ...request, duration: 52 });
    expect(vi.mocked(generateLiveRoutes).mock.calls[0][0].duration).toBe(52);
    for (const duration of [4, 481, 52.5, '52']) expect(await generateRoutes({ ...request, duration })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
  it('explicitly labels the fixed sample destination', async () => {
    const result = await generateRoutes({ ...request, demo: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.message).toContain('National Museum of Scotland');
      for (const route of result.data.routes) expect(route.destination).toEqual(DEMO_DESTINATION);
      for (const route of result.data.routes) expect(route.start).toEqual(DEMO_START);
    }
  });
});
