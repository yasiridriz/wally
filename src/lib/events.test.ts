import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./geo/routing", () => ({ routeWalking: vi.fn() }));
import { evaluateEventTiming, registerGeneratedRoutes, getRouteContext, buildEventDetours } from "./events";
import { demoRouteSamples, generateDemoRoutes, DEMO_START, DEMO_DESTINATION } from "./demo-data";
import { generateRoutes } from "../app/actions/generate-routes";
import { routeWalking } from "./geo/routing";
import type { Event, GenerateRequest } from "./types";

const departure = new Date("2026-10-17T10:00:00Z");
const event: Event = { id: "sample", name: "Sample event", location: DEMO_START, startTime: "2026-10-17T10:10:00Z", endTime: "2026-10-17T10:40:00Z", visitMinutes: 8, category: "art", description: "Fictional", isSample: true };
const request: GenerateRequest = { start: DEMO_START, duration: 30, mood: "surprise", mode: "loop", visitedIds: [], includeEvents: true, demo: true };

describe("event feasibility", () => {
  it("counts waiting, the full visit and a safety buffer at the budget boundary", () => {
    expect(evaluateEventTiming(12, 4, 2, 5, event, departure, 31)).toMatchObject({ waitMinutes: 5, totalMinutes: 31, arrivalTime: "2026-10-17T10:05:00.000Z" });
    expect(evaluateEventTiming(12, 4, 2, 5, event, departure, 30)).toBeNull();
  });
  it("rejects a visit that cannot finish inside the event window", () => {
    expect(evaluateEventTiming(12, 4, 2, 35, event, departure, 90)).toBeNull();
  });
  it("rejects invalid and negative timing inputs", () => {
    expect(evaluateEventTiming(NaN, 4, 2, 5, event, departure, 90)).toBeNull();
    expect(evaluateEventTiming(12, -1, 2, 5, event, departure, 90)).toBeNull();
    expect(evaluateEventTiming(12, 4, 2, 5, { ...event, startTime: "invalid" }, departure, 90)).toBeNull();
  });
  it("reuses a detour result rather than repeating provider requests", async () => {
    const route = { ...demoRouteSamples(request)[0], source: "live" as const };
    registerGeneratedRoutes(request, [route]);
    const context = getRouteContext(route.id)!;
    const provider = vi.fn(async () => []);
    await Promise.all([buildEventDetours(context, provider), buildEventDetours(context, provider)]);
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("offers only a routed detour that fits, preserving the loop endpoint", async () => {
    const liveRequest = { ...request, duration: 90 as const };
    const route = { ...demoRouteSamples(request)[0], source: "live" as const };
    registerGeneratedRoutes(liveRequest, [route]);
    const now = Date.now();
    const example = { ...event, location: DEMO_START, startTime: new Date(now - 60000).toISOString(), endTime: new Date(now + 3600000).toISOString() };
    vi.mocked(routeWalking).mockImplementation(async (points) => ({
      geometry: { type: "LineString", coordinates: points.map(p => [p.lng, p.lat]) },
      distanceMeters: 700, durationSeconds: 600, segmentSeconds: points.slice(1).map(() => 600 / (points.length - 1)),
    }));
    const options = await buildEventDetours(getRouteContext(route.id)!, async () => [example]);
    expect(options).toHaveLength(1);
    expect(options[0].route.totalMinutes).toBe(10 + route.stopMinutes + 2 + example.visitMinutes);
    expect(options[0].route.event).toEqual(example);
    // The Google Maps link uses this index to keep the event at its routed position.
    const routed = vi.mocked(routeWalking).mock.calls[0][0];
    expect(routed[options[0].route.eventStopIndex! + 1]).toEqual(example.location);
    expect(options[0].route.geometry.coordinates.at(-1)).toEqual([DEMO_START.lng, DEMO_START.lat]);
    expect(routeWalking).toHaveBeenCalledTimes(1);
  });
  it("rejects a detour when actual walking consumes the remaining budget", async () => {
    const route = { ...demoRouteSamples(request)[0], source: "live" as const };
    registerGeneratedRoutes({ ...request, duration: 15 }, [route]);
    const now = Date.now();
    const example = { ...event, location: DEMO_START, startTime: new Date(now - 60000).toISOString(), endTime: new Date(now + 3600000).toISOString() };
    vi.mocked(routeWalking).mockImplementation(async points => ({ geometry: route.geometry, distanceMeters: 1000, durationSeconds: 1200, segmentSeconds: points.slice(1).map(() => 1200 / (points.length - 1)) }));
    expect(await buildEventDetours(getRouteContext(route.id)!, async () => [example])).toEqual([]);
  });
  it("inserts an event before a chosen destination without replacing the endpoint", async () => {
    const destinationRequest: GenerateRequest = { ...request, mode: "destination", destination: DEMO_DESTINATION, duration: 90, demo: false };
    const route = { ...demoRouteSamples(destinationRequest)[0], id: "destination-event-test", source: "live" as const };
    registerGeneratedRoutes(destinationRequest, [route]);
    const now = Date.now();
    const example = { ...event, location: DEMO_START, startTime: new Date(now - 60000).toISOString(), endTime: new Date(now + 3600000).toISOString() };
    vi.mocked(routeWalking).mockImplementation(async points => ({
      geometry: { type: "LineString", coordinates: points.map(point => [point.lng, point.lat]) },
      distanceMeters: 800, durationSeconds: 600, segmentSeconds: points.slice(1).map(() => 600 / (points.length - 1)),
    }));
    const options = await buildEventDetours(getRouteContext(route.id)!, async () => [example]);
    expect(options).toHaveLength(1);
    const submitted = vi.mocked(routeWalking).mock.calls.at(-1)![0];
    expect(submitted.at(-1)).toEqual(DEMO_DESTINATION);
    expect(submitted.slice(1, -1)).toContainEqual(example.location);
    expect(options[0].route.geometry.coordinates.at(-1)).toEqual([DEMO_DESTINATION.lng, DEMO_DESTINATION.lat]);
    expect(options[0].route.destination).toEqual(DEMO_DESTINATION);
    expect(options[0].route.isLoop).toBe(false);
  });
});

describe("Edinburgh samples", () => {
  it.each([15, 30, 45, 60, 90] as const)("keeps all routes within %i minutes with honest provenance", (duration) => {
    for (const mode of ["loop", "explore", "destination"] as const) {
      const routes = generateDemoRoutes({ ...request, duration, mode });
      expect(routes.length).toBeLessThanOrEqual(3);
      for (const route of routes) {
        expect(route.totalMinutes).toBeLessThanOrEqual(duration);
        expect(route.totalMinutes).toBeGreaterThanOrEqual(Math.ceil(duration * .9));
        expect(route.source).toBe("demo");
        expect(route.geometry.coordinates.length).toBeGreaterThan(1);
        const coordinates = route.geometry.coordinates;
        expect(coordinates[0]).toEqual([DEMO_START.lng, DEMO_START.lat]);
        if (mode === "loop") expect(coordinates.at(-1)).toEqual(coordinates[0]);
        else expect(coordinates.at(-1)).not.toEqual(coordinates[0]);
      }
    }
  });
  it("changes scores for visited places and mood", () => {
    const first = demoRouteSamples(request);
    expect(first.length).toBeGreaterThan(0);
    const visitedIds = first.flatMap((route) => route.stops.map((stop) => stop.id));
    const revisited = demoRouteSamples({ ...request, visitedIds });
    for (const route of first) {
      const match = revisited.find((candidate) => candidate.id === route.id);
      if (match) expect(match.score).toBeLessThan(route.score);
    }
    expect(demoRouteSamples({ ...request, mood: "historic" })).not.toEqual(demoRouteSamples({ ...request, mood: "green" }));
  });
  it.each([15, 30, 45, 60, 90] as const)("keeps a fixed museum destination within a %i-minute sample budget", duration => {
    const routes = generateDemoRoutes({ ...request, mode: "destination", destination: { lat: 0, lng: 0 }, duration });
    expect(routes.length).toBeLessThanOrEqual(3);
    for (const route of routes) {
      expect(route.totalMinutes).toBeLessThanOrEqual(duration);
        expect(route.totalMinutes).toBeGreaterThanOrEqual(Math.ceil(duration * .9));
      expect(route.destination).toEqual(DEMO_DESTINATION);
      expect(route.geometry.coordinates[0]).toEqual([DEMO_START.lng, DEMO_START.lat]);
      expect(route.geometry.coordinates.at(-1)).toEqual([DEMO_DESTINATION.lng, DEMO_DESTINATION.lat]);
      expect(route.isLoop).toBe(false);
      expect(route.geometry.coordinates.length).toBeGreaterThan(route.stops.length + 2);
    }
  });
  it("does not shorten destination estimates to fit an impossible budget", () => {
    // Exercise the pure fixture filter below the allowed public duration range.
    expect(generateDemoRoutes({ ...request, mode: "destination", duration: 1 as GenerateRequest["duration"] })).toEqual([]);
  });
});

describe("generation action boundaries", () => {
  it.each([null, {}, { ...request, start: { lat: 91, lng: 0 } }, { ...request, start: { lat: 0, lng: Infinity } }, { ...request, duration: 120 }, { ...request, mood: "anything" }, { ...request, visitedIds: Array(501).fill("a") }, { ...request, includeEvents: "yes" }])("rejects invalid public input", async (input) => {
    expect(await generateRoutes(input)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });
  it("uses the canonical fixed start for sample routes", async () => {
    const result = await generateRoutes({ ...request, duration: 15, start: { lat: 0, lng: 0 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.message).toContain("fixed start");
      expect(result.data.routes[0].geometry.coordinates[0]).toEqual([DEMO_START.lng, DEMO_START.lat]);
    }
  });
  it.each(["loop", "explore", "destination"] as const)("never presents a short %s sample as a 90-minute trip", async mode => {
    const result = await generateRoutes({ ...request, mode, destination: mode === 'destination' ? DEMO_DESTINATION : undefined, duration: 90 });
    expect(result).toMatchObject({ ok: true, data: { routes: [] } });
    if (result.ok) expect(result.data.message).toContain('do not match a 90-minute trip');
  });
});
