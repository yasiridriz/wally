import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/geo/generate', () => ({ generateLiveRoutes: vi.fn() }));
vi.mock('@/lib/events', () => ({ registerGeneratedRoutes: vi.fn() }));
import { generateRoutes } from './generate-routes';
import { generateLiveRoutes } from '@/lib/geo/generate';
import { DEMO_DESTINATION, DEMO_START } from '@/lib/demo-data';
import type { GenerateRequest } from '@/lib/types';

const request: GenerateRequest = {
  start: { lat: 55.9442, lng: -3.19055 }, destination: { lat: 55.94695, lng: -3.1891 },
  duration: 30, mode: 'destination', mood: 'green', includeEvents: false, demo: false, visitedIds: [],
};
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('destination action input', () => {
  it.each([undefined, null, {}, { lat: NaN, lng: 0 }, { lat: 90, lng: 0 }, { lat: 55, lng: 181 }])('rejects missing or malformed destination before external calls', async destination => {
    expect(await generateRoutes({ ...request, destination })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(generateLiveRoutes).not.toHaveBeenCalled();
  });
  it('rejects destinations too close or too distant for the budget', async () => {
    expect(await generateRoutes({ ...request, destination: request.start })).toMatchObject({ ok: false, code: 'INVALID_DESTINATION' });
    expect(await generateRoutes({ ...request, destination: { lat: 51.5, lng: -0.12 } })).toMatchObject({ ok: false, code: 'DESTINATION_TOO_FAR' });
    expect(generateLiveRoutes).not.toHaveBeenCalled();
  });
  it('passes only validated destination coordinates to live routing', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
    vi.mocked(generateLiveRoutes).mockResolvedValue([]);
    await generateRoutes({ ...request, destination: { ...request.destination, clientScore: 100, distanceMeters: 1 } });
    expect(generateLiveRoutes).toHaveBeenCalledWith(request);
  });
  it('discards an irrelevant destination in loop mode', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
    vi.mocked(generateLiveRoutes).mockResolvedValue([]);
    await generateRoutes({ ...request, mode: 'loop' });
    expect(vi.mocked(generateLiveRoutes).mock.calls[0][0].destination).toBeUndefined();
  });
  it('accepts any whole-minute duration from 5 to 180 and rejects others', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
    vi.mocked(generateLiveRoutes).mockResolvedValue([]);
    await generateRoutes({ ...request, duration: 52 });
    expect(vi.mocked(generateLiveRoutes).mock.calls[0][0].duration).toBe(52);
    for (const duration of [4, 181, 52.5, '52']) expect(await generateRoutes({ ...request, duration })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
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
