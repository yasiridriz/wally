import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./places", () => ({ discoverPlaces: vi.fn(), discoverLoopPlaces: vi.fn(), discoverExplorePlaces: vi.fn(), discoverTargetedPlaces: vi.fn() }));
vi.mock("./routing", () => ({ routeWalking: vi.fn() }));
import type { GenerateRequest, Place } from "../types";
import { generateLiveRoutes, shortlistCandidates } from "./generate";
import { discoverExplorePlaces, discoverLoopPlaces, discoverPlaces, discoverTargetedPlaces } from "./places";
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
    vi.mocked(discoverExplorePlaces).mockResolvedValue(places);
    vi.mocked(discoverLoopPlaces).mockResolvedValue(places);
    vi.mocked(routeWalking).mockResolvedValue({ geometry: { type: "LineString", coordinates: [[-3.19, 55.95], [-3.18, 55.95]] }, distanceMeters: 3000, durationSeconds: 29 * 60, segmentSeconds: [600, 600, 540] });
    await expect(generateLiveRoutes(request)).rejects.toThrow("No loop close to 30 minutes");
    expect(routeWalking).toHaveBeenCalledTimes(6);
  });
  it("returns to the start only in loop mode and keeps output within budget", async () => {
    vi.mocked(discoverPlaces).mockResolvedValue(places);
    vi.mocked(discoverExplorePlaces).mockResolvedValue(places);
    vi.mocked(discoverLoopPlaces).mockResolvedValue(places);
    vi.mocked(routeWalking).mockResolvedValue({ geometry: { type: "LineString", coordinates: [[-3.19, 55.95], [-3.18, 55.95]] }, distanceMeters: 1400, durationSeconds: 1260, segmentSeconds: [420, 420, 420] });
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

function mockDestinationWalking(durationSeconds = 34 * 60) {
  vi.mocked(routeWalking).mockImplementation(async (points) => ({
    geometry: { type: "LineString", coordinates: points.map((point) => [point.lng, point.lat]) },
    distanceMeters: 1800, durationSeconds,
    segmentSeconds: Array.from({ length: points.length - 1 }, () => durationSeconds / (points.length - 1)),
  }));
}

describe("scenic routes to a destination", () => {
  it("keeps every routed candidate anchored to the exact selected destination", async () => {
    vi.mocked(discoverTargetedPlaces).mockResolvedValue(corridorPlaces);
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
  it("uses focused Targeted discovery instead of a narrow start-only query", async () => {
    vi.mocked(discoverTargetedPlaces).mockResolvedValue(corridorPlaces);
    mockDestinationWalking();
    await generateLiveRoutes(destinationRequest);
    expect(discoverTargetedPlaces).toHaveBeenCalledWith(destinationRequest);
    expect(discoverPlaces).not.toHaveBeenCalled();
    expect(discoverExplorePlaces).not.toHaveBeenCalled();
  });
  it("supports one scenic stop when the fixed destination leaves a constrained budget", async () => {
    const single: Place = { ...corridorPlaces[0], lat: 55.95, lng: -3.1855 };
    const closeDestination = { lat: 55.95, lng: -3.181 };
    vi.mocked(discoverTargetedPlaces).mockResolvedValue([single]);
    mockDestinationWalking(10 * 60);
    const routes = await generateLiveRoutes({ ...destinationRequest, destination: closeDestination, duration: 15 });
    expect(routes).toHaveLength(1);
    expect(routes[0].stops).toEqual([single]);
    expect(vi.mocked(routeWalking).mock.calls[0][0]).toEqual([request.start, single, closeDestination]);
    expect(routes[0].totalMinutes).toBe(14);
  });
  it("rejects excessive actual walking time including stops and safety buffer", async () => {
    vi.mocked(discoverTargetedPlaces).mockResolvedValue(corridorPlaces);
    mockDestinationWalking(43 * 60);
    await expect(generateLiveRoutes(destinationRequest)).rejects.toThrow("No Targeted walk close to 45 minutes");
    expect(routeWalking).toHaveBeenCalledTimes(6);
  });
  it("rejects an impossible direct-distance lower bound before any API request", async () => {
    await expect(generateLiveRoutes({ ...destinationRequest, destination: { lat: 55.95, lng: -3 }, duration: 15 })).rejects.toThrow("too far away");
    expect(discoverTargetedPlaces).not.toHaveBeenCalled();
    expect(routeWalking).not.toHaveBeenCalled();
  });
  it("does not drop the destination or invent a direct walk when there are no scenic stops", async () => {
    vi.mocked(discoverTargetedPlaces).mockResolvedValue([]);
    await expect(generateLiveRoutes(destinationRequest)).rejects.toThrow("No interesting mapped stops");
    expect(routeWalking).not.toHaveBeenCalled();
    await expect(generateLiveRoutes({ ...destinationRequest, destination: undefined })).rejects.toThrow("Choose a destination");
  });
});

import { pathDistance } from "./coordinates";
import { loopCandidatePool } from "./loop-candidates";

const longLoopRequest: GenerateRequest = { ...request, duration: 90 };
const spreadPlaces: Place[] = Array.from({ length: 20 }, (_, index) => {
  const angle = index * 2.399963;
  const radius = [450, 950, 1450, 1950, 2350][index % 5];
  return { id: `spread-${index}`, name: `Scenic stop ${index}`, lat: request.start.lat + Math.cos(angle) * radius / 111195,
    lng: request.start.lng + Math.sin(angle) * radius / 62450, category: index % 3 === 0 ? "viewpoint" : "park", baseScenicScore: 85,
    visitMinutes: 2, suggestedActivity: "Enjoy the view" };
});

function walkingLoop(points: { lat: number; lng: number }[], seconds: number) {
  return { geometry: { type: "LineString" as const, coordinates: points.map((point) => [point.lng, point.lat]) },
    distanceMeters: pathDistance(points) * 1.25, durationSeconds: seconds,
    segmentSeconds: points.slice(1).map(() => seconds / (points.length - 1)), warnings: ["Example provider caution"] };
}

describe("loops fill the requested time with real walking and visits", () => {
  it("prefers verified 85–90 minute loops instead of returning a 20 minute walk for a 90 minute budget", async () => {
    vi.mocked(discoverLoopPlaces).mockResolvedValue(spreadPlaces);
    let index = 0;
    vi.mocked(routeWalking).mockImplementation(async (points) => walkingLoop(points, index++ === 0 ? 12 * 60 : 74 * 60));
    const routes = await generateLiveRoutes(longLoopRequest);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((route) => route.totalMinutes >= 81 && route.totalMinutes <= 90)).toBe(true);
    expect(routes[0].totalMinutes).toBeGreaterThanOrEqual(85);
    expect(discoverLoopPlaces).toHaveBeenCalledWith(longLoopRequest);
    expect(discoverPlaces).not.toHaveBeenCalled();
    expect(vi.mocked(routeWalking).mock.calls.length).toBeLessThanOrEqual(6);
    for (const [points] of vi.mocked(routeWalking).mock.calls) {
      expect(points.at(-1)).toEqual(request.start);
      expect(points[0]).toEqual(request.start);
      expect(points).toHaveLength(points.slice(1, -1).length + 2);
    }
    expect(routes.every((route) => route.routingWarnings?.[0] === "Example provider caution")).toBe(true);
  });
  it("rejects an actual round trip exceeding budget even when outward legs would fit", async () => {
    vi.mocked(discoverLoopPlaces).mockResolvedValue(spreadPlaces);
    vi.mocked(routeWalking).mockImplementation(async (points) => walkingLoop(points, 90 * 60));
    await expect(generateLiveRoutes(longLoopRequest)).rejects.toThrow("No loop close to 90 minutes");
    expect(vi.mocked(routeWalking).mock.calls.length).toBeLessThanOrEqual(6);
    expect(vi.mocked(routeWalking).mock.calls.every(([points]) => points.at(-1) === request.start)).toBe(true);
  });
  it("uses measured network timing to improve the last two candidates", async () => {
    vi.mocked(discoverLoopPlaces).mockResolvedValue(spreadPlaces);
    const totals: number[] = [];
    vi.mocked(routeWalking).mockImplementation(async (points) => {
      const seconds = pathDistance(points) * .8;
      const minutes = Math.ceil(seconds / 60);
      totals.push(minutes + Math.max(2, Math.ceil(minutes * .1)) + (points.length - 2) * 2);
      return walkingLoop(points, seconds);
    });
    const routes = await generateLiveRoutes(longLoopRequest);
    expect(totals).toHaveLength(6);
    expect(Math.min(...totals.slice(0, 4))).toBeLessThan(81);
    expect(totals.slice(4).some((total) => total >= 81 && total <= 90)).toBe(true);
    expect(routes.every((route) => route.totalMinutes >= 81 && route.totalMinutes <= 90)).toBe(true);
    const keys = vi.mocked(routeWalking).mock.calls.map(([points]) => points.slice(1, -1).map((point) => `${point.lat},${point.lng}`).sort().join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("never pads a short route and explains measured totals when none match", async () => {
    vi.mocked(discoverLoopPlaces).mockResolvedValue(spreadPlaces);
    vi.mocked(routeWalking).mockImplementation(async (points) => walkingLoop(points, 12 * 60));
    await expect(generateLiveRoutes(longLoopRequest)).rejects.toThrow(/No loop close to 90 minutes.*Verified loops ranged from \d+ to \d+ minutes/);
  });
  it("bounds candidate pool, routing concurrency, retries allowance and counts variable visits", async () => {
    const activePlaces = spreadPlaces.map((place) => ({ ...place, visitMinutes: 5 }));
    expect(loopCandidatePool(activePlaces, longLoopRequest).length).toBeLessThanOrEqual(380);
    vi.mocked(discoverLoopPlaces).mockResolvedValue(activePlaces);
    let active = 0;
    let peak = 0;
    vi.mocked(routeWalking).mockImplementation(async (points, budget) => {
      active++; peak = Math.max(peak, active);
      expect(budget?.remaining).toBeGreaterThan(0);
      // Simulate one HTTP request plus a transient retry for the first two calls.
      budget!.remaining -= budget!.remaining > 5 ? 2 : 1;
      await Promise.resolve();
      active--;
      return walkingLoop(points, 65 * 60);
    });
    const routes = await generateLiveRoutes(longLoopRequest);
    expect(peak).toBeLessThanOrEqual(2);
    expect(vi.mocked(routeWalking).mock.calls.length).toBeLessThanOrEqual(6);
    expect(routes.every((route) => route.stopMinutes === route.stops.length * 5)).toBe(true);
    expect(routes.every((route) => route.totalMinutes >= 81 && route.totalMinutes <= 90)).toBe(true);
  });
});

import { openCandidatePool } from "./open-candidates";

const openModes = ["explore", "destination"] as const;
function openRequest(mode: typeof openModes[number], duration: GenerateRequest["duration"] = 90): GenerateRequest {
  return { ...request, mode, duration, ...(mode === "destination" ? { destination: { lat: request.start.lat, lng: request.start.lng + .008 } } : {}) };
}
function mockOpenDiscovery(mode: typeof openModes[number], points: Place[]) {
  vi.mocked(mode === "explore" ? discoverExplorePlaces : discoverTargetedPlaces).mockResolvedValue(points);
}

for (const mode of openModes) {
  describe(`${mode} matches the selected duration`, () => {
    it("returns 81–90 minute experiences for 90 minutes and excludes a 20 minute candidate", async () => {
      const input = openRequest(mode);
      mockOpenDiscovery(mode, spreadPlaces);
      let index = 0;
      vi.mocked(routeWalking).mockImplementation(async (points) => walkingLoop(points, index++ === 0 ? 12 * 60 : 74 * 60));
      const routes = await generateLiveRoutes(input);
      expect(routes.length).toBeGreaterThan(0);
      expect(routes.every((route) => route.totalMinutes >= 81 && route.totalMinutes <= 90 && !route.isLoop)).toBe(true);
      expect(vi.mocked(routeWalking).mock.calls).toHaveLength(6);
      for (const [points] of vi.mocked(routeWalking).mock.calls) {
        expect(points[0]).toEqual(input.start);
        if (mode === "destination") expect(points.at(-1)).toEqual(input.destination);
        else expect(points.at(-1)).not.toEqual(input.start);
      }
      for (const route of routes) {
        if (mode === "destination") {
          expect(route.destination).toEqual(input.destination);
          expect(route.geometry.coordinates.at(-1)).toEqual([input.destination!.lng, input.destination!.lat]);
        } else {
          expect(route.geometry.coordinates.at(-1)).toEqual([route.stops.at(-1)!.lng, route.stops.at(-1)!.lat]);
          expect(route.destination).toBeUndefined();
        }
      }
    });
    it("calibrates the last two requests using measured real-network time", async () => {
      const input = openRequest(mode);
      mockOpenDiscovery(mode, spreadPlaces);
      const totals: number[] = [];
      vi.mocked(routeWalking).mockImplementation(async (points) => {
        const seconds = pathDistance(points) * .8;
        const walking = Math.ceil(seconds / 60);
        const stopCount = points.length - (mode === "destination" ? 2 : 1);
        totals.push(walking + Math.max(2, Math.ceil(walking * .1)) + stopCount * 2);
        return walkingLoop(points, seconds);
      });
      const routes = await generateLiveRoutes(input);
      expect(totals).toHaveLength(6);
      expect(totals.slice(0, 4).some((total) => total < 81)).toBe(true);
      expect(totals.slice(4).some((total) => total >= 81 && total <= 90)).toBe(true);
      expect(routes.every((route) => route.totalMinutes >= 81 && route.totalMinutes <= 90)).toBe(true);
      const keys = vi.mocked(routeWalking).mock.calls.map(([points]) => points.slice(1, mode === "destination" ? -1 : undefined).map((point) => `${point.lat},${point.lng}`).sort().join("|"));
      expect(new Set(keys).size).toBe(6);
    });
    it("accepts the exact actual budget and rejects one minute over including final leg and visits", async () => {
      const input = openRequest(mode, 15);
      mockOpenDiscovery(mode, places);
      vi.mocked(routeWalking).mockImplementation(async (points) => {
        const stopCount = points.length - (mode === "destination" ? 2 : 1);
        return walkingLoop(points, (15 - 2 - stopCount * 2) * 60);
      });
      const routes = await generateLiveRoutes(input);
      expect(routes.length).toBeGreaterThan(0);
      expect(routes.every((route) => route.totalMinutes === 15)).toBe(true);
      vi.mocked(routeWalking).mockImplementation(async (points) => {
        const stopCount = points.length - (mode === "destination" ? 2 : 1);
        return walkingLoop(points, (16 - 2 - stopCount * 2) * 60);
      });
      await expect(generateLiveRoutes(input)).rejects.toThrow(/close to 15 minutes.*ranged from 16 to 16 minutes/);
    });
    it("keeps the candidate and HTTP attempt budgets bounded with two concurrent requests", async () => {
      const input = openRequest(mode);
      mockOpenDiscovery(mode, spreadPlaces);
      expect(openCandidatePool(spreadPlaces, input).length).toBeLessThanOrEqual(400);
      let active = 0;
      let peak = 0;
      let attempts = 0;
      vi.mocked(routeWalking).mockImplementation(async (points, budget) => {
        active++; peak = Math.max(peak, active);
        const count = attempts < 4 ? 2 : 1;
        budget!.remaining -= count;
        attempts += count;
        expect(budget!.remaining).toBeGreaterThanOrEqual(0);
        await Promise.resolve(); active--;
        return walkingLoop(points, 74 * 60);
      });
      const routes = await generateLiveRoutes(input);
      expect(routes.length).toBeGreaterThan(0);
      expect(attempts).toBeLessThanOrEqual(8);
      expect(vi.mocked(routeWalking).mock.calls.length).toBeLessThanOrEqual(6);
      expect(peak).toBeLessThanOrEqual(2);
    });
    it("explains verified durations instead of padding short walks", async () => {
      const input = openRequest(mode);
      mockOpenDiscovery(mode, spreadPlaces);
      vi.mocked(routeWalking).mockImplementation(async (points) => walkingLoop(points, 12 * 60));
      await expect(generateLiveRoutes(input)).rejects.toThrow(/No (Explore|Targeted) walk close to 90 minutes.*Verified (Explore|Targeted) walks ranged/);
    });
  });
}

it("allows scenic side detours for a long Targeted budget with nearby endpoints", () => {
  const input = openRequest("destination");
  const pool = openCandidatePool(spreadPlaces, input);
  const selected = shortlistCandidates(spreadPlaces, input);
  expect(pool.length).toBeGreaterThan(0);
  expect(selected.some((stops) => stops.some((place) => Math.abs(place.lat - input.start.lat) > .01))).toBe(true);
  expect(selected.every((stops) => stops.length >= 1 && stops.length <= 3)).toBe(true);
});
