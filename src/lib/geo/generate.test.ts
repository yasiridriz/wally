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
