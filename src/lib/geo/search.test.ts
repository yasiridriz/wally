import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normaliseSearchQuery, searchLocationPlaces } from "./search";

const near = { lat: 55.9442, lng: -3.19055 };
const result = { id: "museum", displayName: { text: "National Museum of Scotland" }, formattedAddress: "Chambers Street, Edinburgh", location: { latitude: 55.94695, longitude: -3.1891 } };

beforeEach(() => { vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-server-key"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function mockResults(places: unknown[]) {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ places })));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("location query normalization", () => {
  it("trims and collapses whitespace before applying the query length limit", () => {
    expect(normaliseSearchQuery("  National   Museum\n Edinburgh  ")).toBe("National Museum Edinburgh");
    expect(normaliseSearchQuery("a".repeat(160))).toHaveLength(160);
  });
  it.each([undefined, null, 123, {}, "", "  ab  ", "a".repeat(161)])("rejects invalid or out-of-bounds queries", query => {
    expect(normaliseSearchQuery(query)).toBeNull();
  });
});

describe("Google Text Search", () => {
  it("uses pageSize5, a narrow field mask, latitude/longitude bias and server key", async () => {
    const fetcher = mockResults([result]);
    const results = await searchLocationPlaces("  National  Museum  ", near);
    expect(results).toEqual([{ id: "google-museum", name: "National Museum of Scotland", address: "Chambers Street, Edinburgh", coordinates: { lat: 55.94695, lng: -3.1891 }, attributions: [] }]);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(url).not.toContain("test-server-key");
    expect(options.method).toBe("POST");
    expect(options.headers["X-Goog-Api-Key"]).toBe("test-server-key");
    expect(options.headers["X-Goog-FieldMask"]).toBe("places.id,places.displayName,places.formattedAddress,places.location,places.attributions");
    expect(options.cache).toBe("no-store");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toEqual({ textQuery: "National Museum", pageSize: 5, locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 10000 } } });
    await searchLocationPlaces("National Museum", near);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("allows worldwide address or business results without a location restriction or type filter", async () => {
    const fetcher = mockResults([{ ...result, id: "cafe", displayName: { text: "A café" }, location: { latitude: -33.8, longitude: 151.2 } }]);
    expect((await searchLocationPlaces("A café, Sydney"))[0].coordinates).toEqual({ lat: -33.8, lng: 151.2 });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ textQuery: "A café, Sydney", pageSize: 5 });
  });
  it("bounds results at five and sanitizes provider attributions", async () => {
    mockResults(Array.from({ length: 10 }, (_, index) => ({ ...result, id: String(index), attributions: [{ provider: "Data partner", providerUri: "https://example.com" }, { provider: "Unsafe partner", providerUri: "javascript:alert(1)" }] })));
    const results = await searchLocationPlaces("Museum");
    expect(results).toHaveLength(5);
    expect(results[0].attributions).toEqual([{ displayName: "Data partner", uri: "https://example.com" }, { displayName: "Unsafe partner" }]);
  });
  it("rejects malformed records, invalid coordinates and duplicate IDs", async () => {
    mockResults([result, result, { ...result, id: "bad", location: { latitude: "55", longitude: 1 } }, { ...result, id: "empty", displayName: { text: " " } }, null]);
    expect(await searchLocationPlaces("Museum")).toHaveLength(1);
  });
  it("accepts an empty successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    expect(await searchLocationPlaces("Nothing here")).toEqual([]);
  });
  it.each(["null", '{"places":{}}', '{"error":{"message":"secret-provider-detail"}}', "not JSON"])("rejects invalid provider responses safely", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(searchLocationPlaces("Museum")).rejects.toMatchObject({ code: "PROVIDER_ERROR", message: expect.not.stringContaining("secret-provider-detail") });
  });
  it.each([[403, "ACCESS_DENIED"], [429, "RATE_LIMITED"], [500, "PROVIDER_ERROR"]])("handles status %i with a fixed error and no retry", async (status, code) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("secret-provider-detail", { status: Number(status) }));
    vi.stubGlobal("fetch", fetcher);
    await expect(searchLocationPlaces("Museum")).rejects.toMatchObject({ code, message: expect.not.stringContaining("secret-provider-detail") });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("requires a key before requesting Google", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "   ");
    const fetcher = mockResults([]);
    await expect(searchLocationPlaces("Museum")).rejects.toMatchObject({ code: "MISSING_KEY" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects an invalid query or bias without external requests", async () => {
    const fetcher = mockResults([]);
    await expect(searchLocationPlaces("ab")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(searchLocationPlaces("Museum", { lat: Infinity, lng: 0 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("converts unexpected network or timeout details into fixed safe errors", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new DOMException("secret-key-url", "TimeoutError")).mockRejectedValueOnce(new Error("secret-network-detail"));
    vi.stubGlobal("fetch", fetcher);
    for (let count = 0; count < 2; count++) await expect(searchLocationPlaces("Museum")).rejects.toMatchObject({ code: "PROVIDER_ERROR", message: expect.not.stringContaining("secret") });
  });
});
