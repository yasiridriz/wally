import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { discoverExplorePlaces, discoverLoopPlaces, discoverPlaces, discoverTargetedPlaces, normalisePlaces } from "./places";
import { distanceMeters, isCoordinates } from "./coordinates";
import type { GenerateRequest } from "../types";

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
  it("keeps the first valid photo name with sanitised author attribution", () => {
    const input = { ...place("one"), photos: [{ name: "../../evil" }, { name: "places/one/photos/AbC_-1", authorAttributions: [{ displayName: "A. Walker", uri: "https://maps.google.com/maps/contrib/1" }, { displayName: "Bad", uri: "javascript:alert(1)" }] }] };
    expect(normalisePlaces([input], start, 1000)[0].photo).toEqual({ name: "places/one/photos/AbC_-1", authorAttributions: [{ displayName: "A. Walker", uri: "https://maps.google.com/maps/contrib/1" }, { displayName: "Bad" }] });
    expect(normalisePlaces([{ ...place("two"), photos: [{ name: "places/two/photos/a?key=x" }] }], start, 1000)[0].photo).toBeUndefined();
  });
  it("bounds the incoming collection and rejects invalid search areas", () => {
    const input = Array.from({ length: 40 }, (_, index) => place(String(index), "park", start.lat + index * 0.0005));
    expect(normalisePlaces(input, start, 50_000).length).toBeLessThanOrEqual(20);
    expect(normalisePlaces(input, start, 50_001)).toEqual([]);
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
    expect(options.headers["X-Goog-FieldMask"]).toBe("places.id,places.displayName,places.location,places.types,places.attributions,places.photos");
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
  it.each([0, 99, 50_001, Infinity, NaN])("rejects radius %s before calling Google", async radius => {
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

const loopRequest: GenerateRequest = { start, duration: 90, moods: ["scenic"], mode: "loop", visitedIds: [], includeEvents: false, demo: false };

describe("loop discovery coverage", () => {
  it("searches a 90-minute outer ring sequentially and retains distant discoveries", async () => {
    let active = 0;
    let peak = 0;
    let calls = 0;
    const fetcher = vi.fn().mockImplementation(async (_url, options) => {
      active++; peak = Math.max(peak, active);
      const body = JSON.parse(options.body);
      const circle = body.locationRestriction.circle;
      const index = calls++;
      await Promise.resolve(); active--;
      return new Response(JSON.stringify({ places: [place(String(index), index === 4 ? "scenic_spot" : index === 5 ? "market" : "park", circle.center.latitude + (index === 4 ? -0.005 : index === 5 ? -0.01 : 0), circle.center.longitude)] }));
    });
    vi.stubGlobal("fetch", fetcher);
    const results = await discoverLoopPlaces(loopRequest);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(peak).toBe(1);
    const bodies = fetcher.mock.calls.map(([, options]) => JSON.parse(options.body));
    for (const body of bodies) {
      expect(body.maxResultCount).toBe(20);
      expect(body.locationRestriction.circle.radius).toBeLessThanOrEqual(50_000);
    }
    for (const body of bodies.slice(1, 4)) {
      const center = body.locationRestriction.circle.center;
      expect(distanceMeters(start, { lat: center.latitude, lng: center.longitude })).toBeGreaterThan(1500);
      expect(body.rankPreference).toBe("POPULARITY");
      expect(body.locationRestriction.circle.radius).toBeGreaterThanOrEqual(700);
      expect(body.locationRestriction.circle.radius).toBeLessThanOrEqual(1100);
    }
    expect(bodies[4].includedTypes).toEqual(["observation_deck", "scenic_spot"]);
    expect(bodies[5].includedTypes).toEqual(expect.arrayContaining(["hiking_area", "botanical_garden", "art_gallery", "museum", "market"]));
    expect(results.filter(result => distanceMeters(start, result) > 1500).length).toBeGreaterThanOrEqual(3);
    expect(results.some(result => result.category === "viewpoint")).toBe(true);
    expect(results.some(result => result.suggestedActivity?.includes("market"))).toBe(true);
  });
  it("merges at most20 with geographic coverage and reserved viewpoint/activity space", async () => {
    let index = 0;
    const fetcher = vi.fn().mockImplementation(async (_url, options) => {
      const query = index++;
      const circle = JSON.parse(options.body).locationRestriction.circle;
      let results = Array.from({ length: 20 }, (_, item) => place(`${query}-${item}`, "park", circle.center.latitude + Math.floor(item / 5) * 0.0006, circle.center.longitude + (item % 5) * 0.0015));
      if (query === 4) results = [place("viewpoint", "observation_deck", start.lat - 0.004)];
      if (query === 5) results = [place("activity", "market", start.lat - 0.007)];
      return new Response(JSON.stringify({ places: results }));
    });
    vi.stubGlobal("fetch", fetcher);
    const results = await discoverLoopPlaces(loopRequest);
    expect(results).toHaveLength(20);
    expect(new Set(results.map(result => result.id)).size).toBe(20);
    expect(results.map(result => result.id)).toContain("google-viewpoint");
    expect(results.map(result => result.id)).toContain("google-activity");
    for (const query of [0, 1, 2, 3]) expect(results.some(result => result.id.startsWith(`google-${query}-`))).toBe(true);
  });
  it("deduplicates the same places across discovery queries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ places: [place("same")] }))));
    const results = await discoverLoopPlaces(loopRequest);
    expect(results).toHaveLength(1);
  });
  it("keeps available results after a timeout and does not retry any query", async () => {
    let index = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      if (index++ === 0) throw new DOMException("private network details", "TimeoutError");
      return new Response(JSON.stringify({ places: [place("available", "park", start.lat - 0.003)] }));
    });
    vi.stubGlobal("fetch", fetcher);
    expect((await discoverLoopPlaces(loopRequest)).map(result => result.id)).toContain("google-available");
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it("stops after429 and uses prior valid results", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ places: [place("nearby")] }))).mockResolvedValue(new Response("private-provider-details", { status: 429 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await discoverLoopPlaces(loopRequest)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("reports the fixed provider error when no query succeeds", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("private-provider-details", { status: 429 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(discoverLoopPlaces(loopRequest)).rejects.toThrow("request limit");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses fewer queries for short walks and bounds their returned area", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ places: [place("near"), place("too-far", "park", start.lat + 0.02)] })));
    vi.stubGlobal("fetch", fetcher);
    expect((await discoverLoopPlaces({ ...loopRequest, duration: 15 })).map(result => result.id)).toEqual(["google-near"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([{ lat: 85, lng: 179.999 }, { lat: -85, lng: -179.999 }])("keeps offset query coordinates valid at world boundaries", async boundary => {
    const fetcher = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await discoverLoopPlaces({ ...loopRequest, start: boundary });
    for (const [, options] of fetcher.mock.calls) {
      const center = JSON.parse(options.body).locationRestriction.circle.center;
      expect(isCoordinates({ lat: center.latitude, lng: center.longitude })).toBe(true);
    }
  });
  it("adds short realistic activity estimates without implying scheduled events", () => {
    for (const type of ["observation_deck", "scenic_spot", "park", "hiking_area", "art_gallery", "museum", "market"]) {
      const result = normalisePlaces([place(type, type)], start, 1000)[0];
      expect(result.visitMinutes).toBeGreaterThanOrEqual(3);
      expect(result.visitMinutes).toBeLessThanOrEqual(6);
      expect(result.suggestedActivity).toBeTruthy();
      if (["art_gallery", "museum", "market"].includes(type)) expect(result.suggestedActivity).toMatch(/hours/);
    }
  });
});

describe("Explore and Targeted discovery coverage", () => {
  it("searches far Explore areas with popularity and focused categories within six sequential requests", async () => {
    let active = 0;
    let peak = 0;
    let index = 0;
    const fetcher = vi.fn().mockImplementation(async (_url, options) => {
      active++; peak = Math.max(peak, active);
      const query = index++;
      const circle = JSON.parse(options.body).locationRestriction.circle;
      await Promise.resolve(); active--;
      return new Response(JSON.stringify({ places: [place(`explore-${query}`, query === 4 ? "scenic_spot" : query === 5 ? "market" : "park", circle.center.latitude + (query === 4 ? -0.004 : query === 5 ? -0.008 : 0), circle.center.longitude)] }));
    });
    vi.stubGlobal("fetch", fetcher);
    const results = await discoverExplorePlaces({ ...loopRequest, mode: "explore" });
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(peak).toBe(1);
    const bodies = fetcher.mock.calls.map(([, options]) => JSON.parse(options.body));
    for (const body of bodies) {
      expect(body.rankPreference).toBe("POPULARITY");
      expect(body.maxResultCount).toBe(20);
      expect(body.locationRestriction.circle.radius).toBeLessThanOrEqual(50_000);
    }
    expect(results.filter(result => distanceMeters(start, result) > 2500)).toHaveLength(3);
    expect(bodies[4].includedTypes).toEqual(["observation_deck", "scenic_spot"]);
    expect(bodies[5].includedTypes).toContain("market");
    expect(results.some(result => result.category === "viewpoint")).toBe(true);
    expect(results.some(result => result.suggestedActivity?.includes("market"))).toBe(true);
  });
  it("widens Targeted discovery for a long budget even when the destination is close", async () => {
    const destination = { lat: start.lat + 0.001, lng: start.lng };
    const queryBodies: { locationRestriction: { circle: { radius: number; center: { latitude: number; longitude: number } } } }[] = [];
    const fetcher = vi.fn().mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      queryBodies.push(body);
      const center = body.locationRestriction.circle.center;
      return new Response(JSON.stringify({ places: [place(String(queryBodies.length), "park", center.latitude, center.longitude)] }));
    });
    vi.stubGlobal("fetch", fetcher);
    const results = await discoverTargetedPlaces({ ...loopRequest, mode: "destination", destination });
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(queryBodies.slice(0, 4).every(body => body.locationRestriction.circle.radius > 1000)).toBe(true);
    const centers = queryBodies.slice(0, 4).map(body => ({ lat: body.locationRestriction.circle.center.latitude, lng: body.locationRestriction.circle.center.longitude }));
    expect(centers[0]).toEqual(start);
    expect(centers[1]).toEqual(destination);
    expect(distanceMeters(start, centers[2])).toBeGreaterThan(1500);
    expect(distanceMeters(start, centers[3])).toBeGreaterThan(1500);
    expect(centers[2].lng).toBeGreaterThan(start.lng);
    expect(centers[3].lng).toBeLessThan(start.lng);
    expect(results.some(result => distanceMeters(start, result) > 1500)).toBe(true);
    // A larger allowance should expand the same close-endpoint search.
    queryBodies.length = 0;
    await discoverTargetedPlaces({ ...loopRequest, mode: "destination", destination, duration: 15 });
    expect(queryBodies[0].locationRestriction.circle.radius).toBeLessThan(1000);
  });
  it("filters Targeted places with the full start-to-place-to-end envelope", async () => {
    const destination = { lat: start.lat, lng: start.lng + 0.07 };
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ places: [place("near-end", "museum", destination.lat + 0.001, destination.lng), place("impossible", "park", start.lat + 0.05, start.lng)] })));
    vi.stubGlobal("fetch", fetcher);
    const results = await discoverTargetedPlaces({ ...loopRequest, mode: "destination", destination });
    expect(results.map(result => result.id)).toContain("google-near-end");
    expect(distanceMeters(start, results.find(result => result.id === "google-near-end")!)).toBeGreaterThan(3500);
    expect(results.map(result => result.id)).not.toContain("google-impossible");
  });
  it.each(["explore", "destination"] as const)("caps %s output at20 with deduplication and focused categories", async mode => {
    let index = 0;
    const fetcher = vi.fn().mockImplementation(async (_url, options) => {
      const query = index++;
      const circle = JSON.parse(options.body).locationRestriction.circle;
      let results = Array.from({ length: 20 }, (_, item) => place(`${query}-${item}`, "park", circle.center.latitude + Math.floor(item / 5) * 0.0006, circle.center.longitude + (item % 5) * 0.0015));
      if (query === 4) results = [place("viewpoint", "observation_deck", start.lat - 0.004)];
      if (query === 5) results = [place("activity", "market", start.lat - 0.007)];
      return new Response(JSON.stringify({ places: results }));
    });
    vi.stubGlobal("fetch", fetcher);
    const request = { ...loopRequest, mode, destination: { lat: start.lat + 0.003, lng: start.lng } };
    const results = await (mode === "explore" ? discoverExplorePlaces(request) : discoverTargetedPlaces(request));
    expect(results).toHaveLength(20);
    expect(new Set(results.map(result => result.id)).size).toBe(20);
    expect(results.map(result => result.id)).toContain("google-viewpoint");
    expect(results.map(result => result.id)).toContain("google-activity");
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it.each([discoverExplorePlaces, discoverTargetedPlaces])("stops after an auth failure while preserving earlier valid results", async discover => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ places: [place("available")] }))).mockResolvedValue(new Response("private-info", { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await discover({ ...loopRequest, destination: { lat: start.lat + 0.003, lng: start.lng } })).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("requires a valid Targeted destination before any Google request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(discoverTargetedPlaces({ ...loopRequest, mode: "destination" })).rejects.toThrow("destination");
    await expect(discoverTargetedPlaces({ ...loopRequest, mode: "destination", destination: { lat: 0, lng: Infinity } })).rejects.toThrow("destination");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps Targeted coordinates and radii valid across the antimeridian", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await discoverTargetedPlaces({ ...loopRequest, start: { lat: 84.99, lng: 179.999 }, destination: { lat: 84.99, lng: -179.999 } });
    expect(fetcher).toHaveBeenCalledTimes(6);
    for (const [, options] of fetcher.mock.calls) {
      const circle = JSON.parse(options.body).locationRestriction.circle;
      expect(isCoordinates({ lat: circle.center.latitude, lng: circle.center.longitude })).toBe(true);
      expect(Math.abs(circle.center.longitude)).toBeGreaterThan(170);
      expect(circle.radius).toBeLessThanOrEqual(50_000);
    }
  });
});
