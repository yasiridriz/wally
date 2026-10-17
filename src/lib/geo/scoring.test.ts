import { describe, expect, it } from "vitest";
import type { Place, WanderRoute } from "../types";
import { estimateExperience, fitsTimeBudget, rankRoutes, repetitionPenalty, scorePlaces, stopOverlap } from "./scoring";
import { distanceMeters, isCoordinates, toLngLat } from "./coordinates";

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
    expect(scorePlaces(stops, "surprise", [])).toBe(82);
    expect(scorePlaces(stops, "surprise", [], 100)).toBe(84);
    expect(scorePlaces(stops, "surprise", [])).toBe(scorePlaces(stops, "surprise", []));
  });
  it("rewards preferences and discoveries without trusting visited scores", () => {
    const stops = [place("a"), place("b")];
    expect(scorePlaces(stops, "green", [])).toBeGreaterThan(scorePlaces(stops, "historic", []));
    expect(scorePlaces(stops, "green", [])).toBeGreaterThan(scorePlaces(stops, "green", ["a", "b"]));
    expect(scorePlaces([], "scenic", [])).toBe(0);
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

describe("coordinate boundaries", () => {
  it("keeps provider longitude first and rejects invalid locations", () => {
    expect(toLngLat({ lat: 55, lng: -3 })).toEqual([-3, 55]);
    expect(isCoordinates({ lat: Infinity, lng: 0 })).toBe(false);
    expect(isCoordinates({ lat: 90, lng: 0 })).toBe(false);
    expect(isCoordinates({ lat: 0, lng: 181 })).toBe(false);
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111195, -1);
  });
});
