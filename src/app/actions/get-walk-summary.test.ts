import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/events', () => ({ getRouteContext: vi.fn() }));
vi.mock('@/lib/geo/photos', async () => {
  const actual = await vi.importActual<typeof import('@/lib/geo/photos')>('@/lib/geo/photos');
  return { ...actual, summaryPhotos: vi.fn() };
});
import { getWalkSummary } from './get-walk-summary';
import { getRouteContext } from '@/lib/events';
import { PhotoError, summaryPhotos } from '@/lib/geo/photos';

const photo = { stopId: 'google-a', placeName: 'A', url: 'https://lh3.googleusercontent.com/a', authorAttributions: [] };
function context(source: 'live' | 'demo' = 'live') {
  return { request: {}, route: { id: 'route-1', source, stops: [] }, createdAt: Date.now() } as unknown as NonNullable<ReturnType<typeof getRouteContext>>;
}
afterEach(() => { vi.resetAllMocks(); });

describe('walk summary action', () => {
  it.each([undefined, null, {}, { routeId: '' }, { routeId: 5 }, { routeId: 'x'.repeat(201) }])('rejects invalid input %j', async input => {
    expect(await getWalkSummary(input)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(getRouteContext).not.toHaveBeenCalled();
  });
  it('only loads photos for a route this server generated', async () => {
    vi.mocked(getRouteContext).mockReturnValue(undefined);
    expect(await getWalkSummary({ routeId: 'unknown' })).toMatchObject({ ok: false, code: 'EXPIRED_ROUTE' });
    expect(summaryPhotos).not.toHaveBeenCalled();
  });
  it('makes no photo requests for demo routes', async () => {
    vi.mocked(getRouteContext).mockReturnValue(context('demo'));
    expect(await getWalkSummary({ routeId: 'route-1' })).toEqual({ ok: true, data: { photos: [] } });
    expect(summaryPhotos).not.toHaveBeenCalled();
  });
  it('resolves detour IDs to the base route and reuses one photo request', async () => {
    const cached = context();
    vi.mocked(getRouteContext).mockReturnValue(cached);
    vi.mocked(summaryPhotos).mockResolvedValue([photo]);
    expect(await getWalkSummary({ routeId: 'route-1:sample-history' })).toEqual({ ok: true, data: { photos: [photo] } });
    expect(await getWalkSummary({ routeId: 'route-1' })).toEqual({ ok: true, data: { photos: [photo] } });
    expect(getRouteContext).toHaveBeenCalledWith('route-1');
    expect(summaryPhotos).toHaveBeenCalledTimes(1);
  });
  it('reports a failure and allows a later retry', async () => {
    vi.mocked(getRouteContext).mockReturnValue(context());
    vi.mocked(summaryPhotos).mockRejectedValueOnce(new PhotoError('Place photos are unavailable right now.', 'PHOTO_ERROR')).mockResolvedValueOnce([photo]);
    expect(await getWalkSummary({ routeId: 'route-1' })).toMatchObject({ ok: false, code: 'PHOTO_ERROR' });
    expect(await getWalkSummary({ routeId: 'route-1' })).toMatchObject({ ok: true });
    expect(summaryPhotos).toHaveBeenCalledTimes(2);
  });
});
