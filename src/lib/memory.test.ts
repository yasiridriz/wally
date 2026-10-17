import { describe, expect, it } from "vitest";
import { favouritePlaces, memoryHints, memoryScore, restoreHistory, withFavouritePlaces, type HistoryEntry } from "./memory";
import type { MemoryHint, Place } from "./types";

const place = (id: string): Place => ({ id, name: id, category: "park", lat: 55.95, lng: -3.19, baseScenicScore: 80 });
const stops = (...ids: string[]) => ids.map(place);
const entry = (id: string, ids: string[], extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id, routeId: `route-${id}`, name: `Route ${id}`, stops: stops(...ids), mode: "loop", pace: "walk", moods: [], duration: 30,
  totalMinutes: 29, distanceMeters: 1800, source: "live", selectedAt: "2026-10-17T12:00:00.000Z", favourite: false, ...extra,
});

describe("path memory scoring", () => {
  it("is neutral without memory", () => {
    expect(memoryScore(stops("a", "b"), {})).toBe(0);
  });
  it("penalises repeats in proportion to how similar they are", () => {
    const memory: MemoryHint[] = [{ stopIds: ["a", "b"], favourite: false }];
    const same = memoryScore(stops("a", "b"), { memory });
    const half = memoryScore(stops("a", "c"), { memory });
    expect(same).toBe(-30);
    expect(half).toBeLessThan(0);
    expect(half).toBeGreaterThan(same);
    expect(memoryScore(stops("c", "d"), { memory })).toBe(0);
  });
  it("strongly prefers favourites only with the Favourites tag", () => {
    const memory: MemoryHint[] = [{ stopIds: ["a", "b"], favourite: true }];
    expect(memoryScore(stops("a", "b"), { memory, favourites: true })).toBe(85);
    // Without the tag a favourite is still a repeat, so new places come first.
    expect(memoryScore(stops("a", "b"), { memory, favourites: false })).toBe(-30);
    // Favourite places help new combinations too.
    expect(memoryScore(stops("a", "z"), { memory, favourites: true })).toBeGreaterThan(20);
  });
  it("pulls places from well-rated routes up and from poorly rated routes down", () => {
    const loved: MemoryHint[] = [{ stopIds: ["a", "b"], favourite: false, rating: 5 }];
    const disliked: MemoryHint[] = [{ stopIds: ["a", "b"], favourite: false, rating: 1 }];
    // A new route through one of the rated places, not a repeat of the route.
    const lovedScore = memoryScore(stops("a", "c", "d"), { memory: loved });
    const dislikedScore = memoryScore(stops("a", "c", "d"), { memory: disliked });
    expect(lovedScore).toBeGreaterThan(dislikedScore);
  });
  it("weighs everyone's ratings by how many reviews a place has", () => {
    const few = new Map([["a", { average: 5, count: 1 }]]);
    const many = new Map([["a", { average: 5, count: 20 }]]);
    const poor = new Map([["a", { average: 1, count: 20 }]]);
    expect(memoryScore(stops("a"), { ratings: many })).toBeGreaterThan(memoryScore(stops("a"), { ratings: few }));
    expect(memoryScore(stops("a"), { ratings: poor })).toBeLessThan(0);
  });
});

describe("path history", () => {
  it("sends compact hints, most recent first, and favourite stops once each", () => {
    const history = [entry("1", ["a", "b"], { favourite: true, rating: 4 }), entry("2", ["b", "c"], { favourite: true }), entry("3", ["d"])];
    expect(memoryHints(history)).toEqual([{ stopIds: ["a", "b"], favourite: true, rating: 4 }, { stopIds: ["b", "c"], favourite: true }, { stopIds: ["d"], favourite: false }]);
    expect(favouritePlaces(history).map(value => value.id)).toEqual(["a", "b", "c"]);
  });
  it("offers reachable favourite stops first, without duplicates, only with the tag", () => {
    const discovered = stops("x", "b");
    const favourite = [place("a"), place("b"), { ...place("far"), lat: 56.5 }];
    const near = (value: Place) => value.lat < 56;
    expect(withFavouritePlaces(discovered, { favourites: true, favouritePlaces: favourite }, near).map(value => value.id)).toEqual(["a", "b", "x"]);
    expect(withFavouritePlaces(discovered, { favourites: false, favouritePlaces: favourite }, near)).toBe(discovered);
  });
  it("restores valid saved history and drops malformed entries", () => {
    const valid = entry("1", ["a"], { rating: 3 });
    expect(restoreHistory([valid, { ...valid, rating: 6 }, { ...valid, stops: [] }, null, "x"])).toEqual([valid]);
    expect(restoreHistory("nope")).toEqual([]);
  });
});
