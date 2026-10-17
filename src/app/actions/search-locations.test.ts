import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { searchLocations } from "./search-locations";

beforeEach(() => { vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-server-key"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("searchLocations public input", () => {
  it.each([undefined, null, [], "museum", {}, { query: 123 }, { query: "ab" }, { query: "x".repeat(161) }, { query: "museum", near: null }, { query: "museum", near: { lat: 91, lng: 0 } }, { query: "museum", near: { lat: 55, lng: Infinity } }])("rejects untrusted invalid input without making requests", async raw => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await searchLocations(raw)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("only forwards normalized allowed input, ignoring client endpoints and counts", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"places":[{"id":"one","displayName":{"text":"Example address"},"formattedAddress":"1 Sample Street","location":{"latitude":55,"longitude":-3}}]}'));
    vi.stubGlobal("fetch", fetcher);
    expect(await searchLocations({ query: "  Example    address ", near: { lat: 55, lng: -3, radius: 999999 }, count: 999, endpoint: "https://evil.example" })).toEqual({ ok: true, data: [{ id: "google-one", name: "Example address", address: "1 Sample Street", coordinates: { lat: 55, lng: -3 }, attributions: [] }] });
    expect(fetcher.mock.calls[0][0]).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ textQuery: "Example address", pageSize: 5, locationBias: { circle: { center: { latitude: 55, longitude: -3 }, radius: 10000 } } });
  });
  it("returns a useful missing-key result", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    expect(await searchLocations({ query: "museum" })).toMatchObject({ ok: false, code: "MISSING_KEY" });
  });
  it("serializes provider errors without sensitive details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sensitive-key-value")));
    const result = await searchLocations({ query: "museum" });
    expect(result).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
    expect(JSON.stringify(result)).not.toContain("sensitive-key-value");
  });
});
