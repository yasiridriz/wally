import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./places", () => ({ discoverPlaces: vi.fn() }));
vi.mock("./routing", () => ({ routeWalking: vi.fn() }));
import type { GenerateRequest, Place } from "../types";
import { generateLiveRoutes, shortlistCandidates } from "./generate";
import { discoverPlaces } from "./places";
import { routeWalking } from "./routing";

const request: GenerateRequest = { start: { lat: 55.95, lng: -3.19 }, duration: 30, mood: "surprise", mode: "loop", visitedIds: [], includeEvents: false, demo: false };
const places: Place[] = Array.from({ length: 12 }, (_, index) => ({ id: `place-${index}`, name: `Place ${index}`, lat: 55.95 + .003 * Math.sin(index / 12 * Math.PI * 2), lng: -3.19 + .005 * Math.cos(index / 12 * Math.PI * 2), category: index % 2 ? "park" : "historic", baseScenicScore: 80 }));
afterEach(() => vi.resetAllMocks());

describe("bounded real route generation", () => {
  it("shortlists at most six distinct combinations", () => {
    const candidates = shortlistCandidates(places, request);
    expect(candidates).toHaveLength(6);
    expect(new Set(candidates.map((stops) => stops.map((p) => p.id).sort().join())).size).toBe(candidates.length);
    expect(candidates.every((stops) => stops.length >= 2 && stops.length <= 3)).toBe(true);
  });
  it("uses real routed durations to reject apparently short candidates", async () => {
    vi.mocked(discoverPlaces).mockResolvedValue(places);
    vi.mocked(routeWalking).mockResolvedValue({ geometry: { type: "LineString", coordinates: [[-3.19, 55.95], [-3.18, 55.95]] }, distanceMeters: 3000, durationSeconds: 29 * 60, segmentSeconds: [600, 600, 540] });
    await expect(generateLiveRoutes(request)).rejects.toThrow("No verified walking routes fit");
    expect(routeWalking).toHaveBeenCalledTimes(6);
  });
  it("returns to the start only in loop mode and keeps output within budget", async () => {
    vi.mocked(discoverPlaces).mockResolvedValue(places);
    vi.mocked(routeWalking).mockResolvedValue({ geometry: { type: "LineString", coordinates: [[-3.19, 55.95], [-3.18, 55.95]] }, distanceMeters: 700, durationSeconds: 600, segmentSeconds: [200, 200, 200] });
    const loops = await generateLiveRoutes(request);
    expect(loops.length).toBeGreaterThan(0);
    expect(loops.every((route) => route.totalMinutes <= request.duration && route.isLoop)).toBe(true);
    expect(vi.mocked(routeWalking).mock.calls[0][0].at(-1)).toEqual(request.start);
    vi.mocked(routeWalking).mockClear();
    const explores = await generateLiveRoutes({ ...request, mode: "explore" });
    expect(explores.every((route) => !route.isLoop)).toBe(true);
    expect(vi.mocked(routeWalking).mock.calls[0][0].at(-1)).not.toEqual(request.start);
  });
});

const destination = { lat: 55.95, lng: -3.16 };
const destinationRequest: GenerateRequest = { ...request, mode: "destination", destination, duration: 45 };
const corridorPlaces: Place[] = Array.from({ length: 12 }, (_, index) => ({
  id: `corridor-${index}`, name: `Corridor stop ${index}`, lat: 55.95 + (index % 2 ? .001 : -.001),
  lng: -3.188 + index * .0022, category: index % 2 ? "park" : "historic", baseScenicScore: 82,
}));

function mockDestinationWalking(durationSeconds = 900) {
  vi.mocked(routeWalking).mockImplementation(async (points) => ({
    geometry: { type: "LineString", coordinates: points.map((point) => [point.lng, point.lat]) },
    distanceMeters: 1800, durationSeconds,
    segmentSeconds: Array.from({ length: points.length - 1 }, () => durationSeconds / (points.length - 1)),
  }));
}

describe("scenic routes to a destination", () => {
  it("keeps every routed candidate anchored to the exact selected destination", async () => {
    vi.mocked(discoverPlaces).mockResolvedValue(corridorPlaces);
    mockDestinationWalking();
    const routes = await generateLiveRoutes(destinationRequest);
    expect(routeWalking).toHaveBeenCalledTimes(6);
    expect(routes.length).toBeGreaterThan(0);
    for (const [points] of vi.mocked(routeWalking).mock.calls) {
      expect(points[0]).toEqual(request.start);
      expect(points.at(-1)).toEqual(destination);
      expect(points.length).toBeGreaterThanOrEqual(3);
      const stops = points.slice(1, -1);
      expect(stops.map((point) => point.lng)).toEqual([...stops].sort((a, b) => a.lng - b.lng).map((point) => point.lng));
    }
    for (const route of routes) {
      expect(route.destination).toEqual(destination);
      expect(route.geometry.coordinates.at(-1)).toEqual([destination.lng, destination.lat]);
      expect(route.isLoop).toBe(false);
      expect(route.totalMinutes).toBeLessThanOrEqual(destinationRequest.duration);
    }
  });
  it("discovers start, midpoint and destination sequentially and deduplicates corridor stops", async () => {
    let active = 0;
    let peak = 0;
    vi.mocked(discoverPlaces).mockImplementation(async (center) => {
      active++; peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return corridorPlaces.map((place) => ({ ...place, lat: center.lat + (place.lat - 55.95) }));
    });
    mockDestinationWalking();
    await generateLiveRoutes(destinationRequest);
    const calls = vi.mocked(discoverPlaces).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][0]).toEqual(request.start);
    expect(calls[1][0]).toEqual({ lat: 55.95, lng: (-3.19 - 3.16) / 2 });
    expect(calls[2][0]).toEqual(destination);
    expect(calls.every(([, radius]) => radius <= 3500)).toBe(true);
    expect(peak).toBe(1);
    for (const [points] of vi.mocked(routeWalking).mock.calls) {
      expect(new Set(points.slice(1, -1).map((point) => `${point.lat}:${point.lng}`)).size).toBe(points.length - 2);
    }
  });
  it("supports one scenic stop when the fixed destination leaves a constrained budget", async () => {
    const single: Place = { ...corridorPlaces[0], lat: 55.95, lng: -3.1855 };
    const closeDestination = { lat: 55.95, lng: -3.181 };
    vi.mocked(discoverPlaces).mockResolvedValue([single]);
    mockDestinationWalking(8 * 60);
    const routes = await generateLiveRoutes({ ...destinationRequest, destination: closeDestination, duration: 15 });
    expect(routes).toHaveLength(1);
    expect(routes[0].stops).toEqual([single]);
    expect(vi.mocked(routeWalking).mock.calls[0][0]).toEqual([request.start, single, closeDestination]);
    expect(routes[0].totalMinutes).toBe(12);
  });
  it("rejects excessive actual walking time including stops and safety buffer", async () => {
    vi.mocked(discoverPlaces).mockResolvedValue(corridorPlaces);
    mockDestinationWalking(43 * 60);
    await expect(generateLiveRoutes(destinationRequest)).rejects.toThrow("No verified scenic walking routes reach your destination");
    expect(routeWalking).toHaveBeenCalledTimes(6);
  });
  it("rejects an impossible direct-distance lower bound before any API request", async () => {
    await expect(generateLiveRoutes({ ...destinationRequest, destination: { lat: 55.95, lng: -3 }, duration: 15 })).rejects.toThrow("too far away");
    expect(discoverPlaces).not.toHaveBeenCalled();
    expect(routeWalking).not.toHaveBeenCalled();
  });
  it("does not drop the destination or invent a direct walk when there are no scenic stops", async () => {
    vi.mocked(discoverPlaces).mockResolvedValue([]);
    await expect(generateLiveRoutes(destinationRequest)).rejects.toThrow("No interesting mapped stops");
    expect(routeWalking).not.toHaveBeenCalled();
    await expect(generateLiveRoutes({ ...destinationRequest, destination: undefined })).rejects.toThrow("Choose a destination");
  });
});
