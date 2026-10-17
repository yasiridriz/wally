import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { routeWalking } from "./routing";

const points = [{ lat: 55.95, lng: -3.19 }, { lat: 55.96, lng: -3.18 }];
const payload = { features: [{ geometry: { type: "LineString", coordinates: [[-3.19, 55.95], [-3.18, 55.96]] }, properties: { summary: { distance: 1000, duration: 800 }, segments: [{ duration: 800 }] } }] };

beforeEach(() => { vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-key"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("pedestrian routing boundary", () => {
  it("sends longitude first and preserves actual geometry and timing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetchMock);
    const route = await routeWalking(points);
    expect(fetchMock.mock.calls[0][0]).toContain("/foot-walking/geojson");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).coordinates).toEqual([[-3.19, 55.95], [-3.18, 55.96]]);
    expect(route).toMatchObject({ distanceMeters: 1000, durationSeconds: 800, segmentSeconds: [800] });
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
  it("does not retry rate limits and rejects malformed geometry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const budget = { remaining: 8, rateLimited: false };
    await expect(routeWalking(points, budget)).rejects.toThrow("busy");
    expect(budget.rateLimited).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ features: [] })));
    await expect(routeWalking(points)).rejects.toThrow("incomplete");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("makes no request without credentials or valid waypoints", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(routeWalking([{ lat: NaN, lng: 0 }, points[0]])).rejects.toThrow("Invalid");
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "");
    await expect(routeWalking(points)).rejects.toThrow("API key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
