import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

function mockBrowser() {
  const browser: Record<string, unknown> = { setTimeout, clearTimeout, dispatchEvent: vi.fn() };
  const script: Record<string, unknown> = {};
  const appendChild = vi.fn();
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', { createElement: vi.fn(() => script), head: { appendChild } });
  return { browser, script, appendChild };
}

describe('Google Maps browser loader', () => {
  it('explains the missing browser key without requesting a script', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', '');
    const { appendChild } = mockBrowser();
    const { loadGoogleMaps } = await import('./google-maps-loader');
    await expect(loadGoogleMaps()).rejects.toThrow('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
    expect(appendChild).not.toHaveBeenCalled();
  });
  it('loads the official script once and resolves after its callback', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'browser-test-key');
    const { browser, script, appendChild } = mockBrowser();
    const { loadGoogleMaps } = await import('./google-maps-loader');
    const first = loadGoogleMaps();
    expect(loadGoogleMaps()).toBe(first);
    expect(appendChild).toHaveBeenCalledTimes(1);
    const url = new URL(String(script.src));
    expect(url.origin).toBe('https://maps.googleapis.com');
    expect(url.searchParams.get('key')).toBe('browser-test-key');
    expect(url.searchParams.get('libraries')).toContain('marker');
    const maps = { marker: { AdvancedMarkerElement: class {} } };
    browser.google = { maps };
    (browser.__wallyGoogleMapsReady as () => void)();
    await expect(first).resolves.toBe(maps);
  });
  it('reports script load failures rather than hanging', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'browser-test-key');
    const { script } = mockBrowser();
    const { loadGoogleMaps } = await import('./google-maps-loader');
    const pending = loadGoogleMaps();
    const assertion = expect(pending).rejects.toThrow('couldn’t load');
    (script.onerror as () => void)();
    await assertion;
  });
});
