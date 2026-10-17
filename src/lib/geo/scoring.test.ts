import { describe, expect, it } from "vitest";
import type { Place, WanderRoute } from "../types";
import { durationTimeFit, estimateExperience, estimateExperienceWithStops, estimateStopMinutes, fitsTimeBudget, loopTimeFit, rankLoopRoutes, rankTimeMatchedRoutes, rankRoutes, repetitionPenalty, scorePlaces, shortlistForMoods, stopOverlap } from "./scoring";
import { distanceMeters, isCoordinates, searchRadius, toLngLat } from "./coordinates";

const place = (id: string, category: Place["category"] = "park"): Place => ({ id, name: id, category, lat: 55.95, lng: -3.19, baseScenicScore: 80 });
const route = (id: string, stops: Place[], score: number): WanderRoute => ({ id, name: id, description: "", geometry: { type: "LineString", coordinates: [[-3.19, 55.95], [-3.18, 55.96]] }, stops, score, distanceMeters: 500, walkingMinutes: 8, stopMinutes: 4, bufferMinutes: 2, totalMinutes: 14, highlights: [], isLoop: true, source: "live" });

describe("conservative time budgeting", () => {
  it("rounds walking upward and adds all stops and a safety buffer", () => {
    expect(estimateExperience(601, 2)).toEqual({ walkingMinutes: 11, stopMinutes: 4, bufferMinutes: 2, totalMinutes: 17 });
    expect(estimateExperience(1800, 3, 5)).toEqual({ walkingMinutes: 30, stopMinutes: 6, bufferMinutes: 3, totalMinutes: 44 });
  });
  it("accepts exact budgets but rejects overshoots and invalid durations", () => {
    expect(fitsTimeBudget(15, 15)).toBe(true);
    expect(fitsTimeBudget(15.01, 15)).toBe(false);
    expect(fitsTimeBudget(NaN, 30)).toBe(false);
    expect(fitsTimeBudget(-1, 30)).toBe(false);
  });
});

describe("transparent route scoring", () => {
  it("redistributes absent event weight and remains deterministic", () => {
    const stops = [place("a", "park"), place("b", "historic")];
    // scenic80*.3 + novelty80*.25 + variety100*.15 + surprise75*.2 = 74; / .9
    expect(scorePlaces(stops, [], [])).toBe(82);
    expect(scorePlaces(stops, [], [], 100)).toBe(84);
    expect(scorePlaces(stops, [], [])).toBe(scorePlaces(stops, [], []));
  });
  it("rewards preferences and discoveries without trusting visited scores", () => {
    const stops = [place("a"), place("b")];
    expect(scorePlaces(stops, ["green"], [])).toBeGreaterThan(scorePlaces(stops, ["historic"], []));
    expect(scorePlaces(stops, ["green"], [])).toBeGreaterThan(scorePlaces(stops, ["green"], ["a", "b"]));
    expect(scorePlaces([], ["scenic"], [])).toBe(0);
  });
  it("favours walks that cover every selected tag", () => {
    const mixed = [place("a", "park"), place("b", "historic")];
    const parks = [place("c", "park"), place("d", "park")];
    expect(scorePlaces(mixed, ["green", "historic"], [])).toBeGreaterThan(scorePlaces(parks, ["green", "historic"], []));
  });
  it("keeps places for a minority tag in the candidate shortlist", () => {
    const places = [...Array.from({ length: 24 }, (_, i) => place(`p${i}`, "park")), place("h1", "historic"), place("h2", "historic")];
    expect(shortlistForMoods(places, ["green", "historic"]).map(p => p.id)).toEqual(expect.arrayContaining(["h1", "h2"]));
    expect(shortlistForMoods(places, ["green", "historic"])).toHaveLength(20);
    expect(shortlistForMoods(places, [])).toEqual(places.slice(0, 20));
  });
  it("penalises retracing an edge in reverse", () => {
    expect(repetitionPenalty({ type: "LineString", coordinates: [[0, 0], [0, 1], [0, 0]] })).toBe(10);
  });
});

describe("ranking and diversity", () => {
  it("returns the best routes without nearly identical stop sets", () => {
    const a = place("a"), b = place("b"), c = place("c"), d = place("d");
    const routes = [route("duplicate", [b, a], 90), route("best", [a, b], 95), route("different", [c, d], 85), route("partial", [a, c], 80)];
    expect(rankRoutes(routes).map((r) => r.id)).toEqual(["best", "different", "partial"]);
    expect(routes[0].id).toBe("duplicate");
    expect(stopOverlap([a, b], [b, c])).toBe(.5);
  });
  it("returns fewer results when no distinct alternatives exist", () => {
    expect(rankRoutes([route("a", [place("one"), place("two")], 80), route("b", [place("one"), place("two")], 70)])).toHaveLength(1);
  });
});

describe("memory in ranking", () => {
  it("lets memory points outweigh a small difference in total time", () => {
    const favourite = { ...route("fav", [place("f1"), place("f2")], 50), totalMinutes: 27, memoryScore: 60 };
    const fresh = { ...route("new", [place("n1"), place("n2")], 90), totalMinutes: 29 };
    expect(rankTimeMatchedRoutes([fresh, favourite], 30).map(r => r.id)).toEqual(["fav", "new"]);
    expect(rankTimeMatchedRoutes([fresh, { ...favourite, memoryScore: 0 }], 30).map(r => r.id)).toEqual(["new", "fav"]);
  });
});

describe("running pace", () => {
  it("searches further when running and for long walks, up to the Places limit", () => {
    expect(searchRadius(30, true, 2.25)).toBeGreaterThan(searchRadius(30, true) * 2);
    // Long walks search further; only the Places API limit caps it.
    expect(searchRadius(180, false)).toBeGreaterThan(3500 * 2);
    expect(searchRadius(480, false, 5)).toBe(50_000);
  });
});

describe("coordinate boundaries", () => {
  it("keeps provider longitude first and rejects invalid locations", () => {
    expect(toLngLat({ lat: 55, lng: -3 })).toEqual([-3, 55]);
    expect(isCoordinates({ lat: Infinity, lng: 0 })).toBe(false);
    expect(isCoordinates({ lat: 90, lng: 0 })).toBe(false);
    expect(isCoordinates({ lat: 0, lng: 181 })).toBe(false);
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111195, -1);
  });
});

describe("loop duration targets", () => {
  it.each([15, 30, 45, 60, 90])("requires actual total time near the %i-minute selection", budget => {
    expect(loopTimeFit(Math.ceil(budget * .9), budget)).toBe(true);
    expect(loopTimeFit(budget, budget)).toBe(true);
    expect(loopTimeFit(Math.ceil(budget * .9) - 1, budget)).toBe(false);
    expect(loopTimeFit(budget + 1, budget)).toBe(false);
  });
  it("counts individually planned visits without inflating walking time", () => {
    const stops = [{ ...place('view'), visitMinutes: 5 }, { ...place('gallery'), visitMinutes: 8 }];
    expect(estimateExperienceWithStops(65 * 60, stops)).toEqual({ walkingMinutes: 65, stopMinutes: 13, bufferMinutes: 7, totalMinutes: 85 });
    expect(estimateStopMinutes([{ ...place('invalid'), visitMinutes: Infinity }, { ...place('long'), visitMinutes: 999 }])).toBe(4);
  });
  it("prioritises near-90-minute loops over higher-scoring short walks without padding", () => {
    const short = { ...route('short', [place('a'), place('b')], 100), totalMinutes: 20 };
    const good = { ...route('good', [place('c'), place('d')], 95), totalMinutes: 84 };
    const closest = { ...route('closest', [place('e'), place('f')], 75), totalMinutes: 89 };
    const tooLong = { ...route('long', [place('g'), place('h')], 99), totalMinutes: 91 };
    expect(rankLoopRoutes([short, good, closest, tooLong], 90).map(r => r.id)).toEqual(['closest', 'good']);
    expect(short.totalMinutes).toBe(20);
  });
});

describe('consistent duration targets across route modes', () => {
  it.each(['explore', 'destination'] as const)('ranks %s trips by actual closeness, excluding short and over-budget results', mode => {
    const make = (id: string, totalMinutes: number, score: number): WanderRoute => ({
      ...route(id, [place(id + '-a'), place(id + '-b')], score), totalMinutes, isLoop: false,
      ...(mode === 'destination' ? { destination: { lat: 55.95, lng: -3.18 } } : {}),
    });
    const routes = [make('short', 20, 100), make('good', 83, 95), make('closest', 89, 75), make('long', 91, 100)];
    const ranked = rankTimeMatchedRoutes(routes, 90);
    expect(ranked.map(item => item.id)).toEqual(['closest', 'good']);
    expect(ranked.every(item => durationTimeFit(item.totalMinutes, 90))).toBe(true);
    expect(routes[0].totalMinutes).toBe(20);
  });
  it('applies the same inclusive boundaries and invalid-value rules to all modes', () => {
    expect(durationTimeFit(81, 90)).toBe(true);
    expect(durationTimeFit(90, 90)).toBe(true);
    expect(durationTimeFit(80, 90)).toBe(false);
    expect(durationTimeFit(91, 90)).toBe(false);
    expect(durationTimeFit(NaN, 90)).toBe(false);
  });
});
