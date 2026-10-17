import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { routeWalking } from "./routing";

const points = [{ lat: 55.95, lng: -3.19 }, { lat: 55.96, lng: -3.18 }];
const payload = { routes: [{ polyline: { geoJsonLinestring: { type: "LineString", coordinates: [[-3.19, 55.95], [-3.18, 55.96]] } }, distanceMeters: 1000, duration: "800s", legs: [{ duration: "800s" }], warnings: ["Route includes a pedestrian crossing."] }] };
const waypoint = (point: { lat: number; lng: number }) => ({ location: { latLng: { latitude: point.lat, longitude: point.lng } } });

beforeEach(() => { vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Google pedestrian routing boundary", () => {
  it("sends named latitude/longitude and preserves actual GeoJSON, timing and warnings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetchMock);
    const route = await routeWalking(points);
    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(options.headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(options.headers["X-Goog-FieldMask"]).toBe("routes.duration,routes.distanceMeters,routes.polyline.geoJsonLinestring,routes.legs.duration,routes.warnings");
    expect(JSON.parse(options.body)).toMatchObject({ origin: waypoint(points[0]), destination: waypoint(points[1]), intermediates: [], travelMode: "WALK", computeAlternativeRoutes: false, polylineEncoding: "GEO_JSON_LINESTRING" });
    expect(route).toEqual({ geometry: payload.routes[0].polyline.geoJsonLinestring, distanceMeters: 1000, durationSeconds: 800, segmentSeconds: [800], warnings: payload.routes[0].warnings });
  });
  it("uses non-via intermediate stops and parses fractional leg seconds", async () => {
    const midpoint = { lat: 55.955, lng: -3.185 };
    const multipleLegs = { routes: [{ ...payload.routes[0], duration: "800.5s", legs: [{ duration: "300.25s" }, { duration: "500.25s" }] }] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(multipleLegs)));
    vi.stubGlobal("fetch", fetchMock);
    const route = await routeWalking([points[0], midpoint, points[1]]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.intermediates).toEqual([{ ...waypoint(midpoint), via: false }]);
    expect(body.optimizeWaypointOrder).toBe(false);
    expect(route.segmentSeconds).toEqual([300.25, 500.25]);
    expect(route.durationSeconds).toBe(800.5);
  });
  it("retries transient failures within the shared attempt budget", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetchMock);
    const budget = { remaining: 2, rateLimited: false };
    await routeWalking(points, budget);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(budget.remaining).toBe(0);
    await expect(routeWalking(points, budget)).rejects.toThrow("limit");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not retry rate limits or authorisation failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const budget = { remaining: 8, rateLimited: false };
    await expect(routeWalking(points, budget)).rejects.toThrow("busy");
    expect(budget.rateLimited).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(new Response("", { status: 403 }));
    await expect(routeWalking(points)).rejects.toThrow("not authorised");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(["800", "-1s", "NaNs", "1.1234567890s", "Infinitys", 800, undefined])("rejects malformed route duration %s", async (duration) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{ ...payload.routes[0], duration }] })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(routeWalking(points)).rejects.toThrow("incomplete route");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects missing legs, malformed leg times, invalid geometry and endpoints far from the request", async () => {
    const variations = [
      { routes: [] },
      { routes: [{ ...payload.routes[0], legs: [] }] },
      { routes: [{ ...payload.routes[0], legs: [{ duration: "bad" }] }] },
      { routes: [{ ...payload.routes[0], polyline: { geoJsonLinestring: { type: "LineString", coordinates: [[500, 55], [-3, 55]] } } }] },
      { routes: [{ ...payload.routes[0], polyline: { geoJsonLinestring: { type: "LineString", coordinates: [[-3.19, 55.95], [-3.0, 55.96]] } } }] },
    ];
    for (const variation of variations) {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(variation)));
      vi.stubGlobal("fetch", fetchMock);
      await expect(routeWalking(points)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
  it("makes no request without credentials or valid waypoints", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(routeWalking([{ lat: NaN, lng: 0 }, points[0]])).rejects.toThrow("Invalid");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    await expect(routeWalking(points)).rejects.toThrow("API key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
