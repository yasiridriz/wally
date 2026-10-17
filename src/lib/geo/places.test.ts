import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { discoverPlaces, normalisePlaces } from "./places";

const start = { lat: 55.9442, lng: -3.19055 };
function place(id: string, type = "park", lat = start.lat, lng = start.lng) {
  return { id, displayName: { text: `Place ${id}` }, location: { latitude: lat, longitude: lng }, types: [type, "point_of_interest"] };
}

beforeEach(() => { vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-server-secret"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Google Places normalisation", () => {
  it.each([["park", "park"], ["botanical_garden", "park"], ["historical_landmark", "historic"], ["monument", "historic"], ["museum", "attraction"], ["art_gallery", "art"], ["observation_deck", "viewpoint"]])("maps %s to a scenic category proxy", (type, category) => {
    expect(normalisePlaces([place("one", type)], start, 1000)[0]).toMatchObject({ id: "google-one", name: "Place one", category, lat: start.lat, lng: start.lng });
  });
  it("rejects malformed, nameless, unsupported and out-of-radius places", () => {
    expect(normalisePlaces([null, {}, { ...place("a"), displayName: { text: " " } }, { ...place("b"), location: { latitude: NaN, longitude: 0 } }, place("c", "restaurant"), place("d", "park", 0, 0)], start, 1000)).toEqual([]);
  });
  it("deduplicates IDs and nearby overlapping entries", () => {
    expect(normalisePlaces([place("same"), place("same", "park", start.lat + 0.005), place("nearby", "park", start.lat + 0.0001), place("different", "museum", start.lat + 0.006)], start, 1000)).toHaveLength(2);
  });
  it("preserves official third-party provider attribution and sanitizes links", () => {
    const input = { ...place("one"), attributions: [{ provider: "Local data provider", providerUri: "https://example.com/data" }, { provider: "Unsafe link", providerUri: "javascript:alert(1)" }, null] };
    expect(normalisePlaces([input], start, 1000)[0].attributions).toEqual([{ displayName: "Local data provider", uri: "https://example.com/data" }, { displayName: "Unsafe link" }]);
  });
  it("bounds the incoming collection and rejects invalid search areas", () => {
    const input = Array.from({ length: 40 }, (_, index) => place(String(index), "park", start.lat + index * 0.0005));
    expect(normalisePlaces(input, start, 3500).length).toBeLessThanOrEqual(20);
    expect(normalisePlaces(input, start, 3501)).toEqual([]);
  });
});

describe("Google Nearby Search requests", () => {
  it("uses a bounded circle, explicit field mask and server key without caching", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ places: [place("one")] })));
    vi.stubGlobal("fetch", fetcher);
    expect(await discoverPlaces(start, 1200)).toHaveLength(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(options.method).toBe("POST");
    expect(options.cache).toBe("no-store");
    expect(options.headers["X-Goog-Api-Key"]).toBe("test-server-secret");
    expect(options.headers["X-Goog-FieldMask"]).toBe("places.id,places.displayName,places.location,places.types,places.attributions");
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ maxResultCount: 20, rankPreference: "DISTANCE", locationRestriction: { circle: { center: { latitude: start.lat, longitude: start.lng }, radius: 1200 } } });
    expect(body.includedTypes).toEqual(expect.arrayContaining(["park", "tourist_attraction", "historical_landmark", "monument", "museum", "art_gallery"]));
    await discoverPlaces(start, 1200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("requires the server key before making a request", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(discoverPlaces(start, 1000)).rejects.toThrow("GOOGLE_MAPS_API_KEY");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([0, 99, 3501, Infinity, NaN])("rejects radius %s before calling Google", async radius => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(discoverPlaces(start, radius)).rejects.toThrow("Invalid discovery area");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([[403, "denied"], [429, "request limit"], [500, "unavailable"]] as const)("handles provider status %i without retries", async (status, message) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status })); vi.stubGlobal("fetch", fetcher);
    await expect(discoverPlaces(start, 1000)).rejects.toThrow(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("accepts a valid empty response, but rejects invalid response shapes", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("{}")).mockResolvedValueOnce(new Response('{"places":{}}'));
    vi.stubGlobal("fetch", fetcher);
    expect(await discoverPlaces(start, 1000)).toEqual([]);
    await expect(discoverPlaces(start, 1000)).rejects.toThrow("invalid results");
  });
  it("handles a timeout without leaking provider details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("secret network internals", "TimeoutError")));
    await expect(discoverPlaces(start, 1000)).rejects.toThrow("could not connect");
  });
});
