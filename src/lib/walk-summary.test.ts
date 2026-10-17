import { describe, expect, it } from "vitest";
import { baseRouteId, googleMapsDirectionsUrl, summaryStops } from "./walk-summary";
import type { Event, Place, WanderRoute } from "./types";

const start = { lat: 55.9442, lng: -3.19055 };
function stop(id: string, score: number, photo = true, lat = 55.945, lng = -3.19): Place {
  return { id, name: `Stop ${id}`, lat, lng, category: "park", baseScenicScore: score, ...(photo ? { photo: { name: `places/${id}/photos/p1`, authorAttributions: [] } } : {}) };
}
function route(overrides: Partial<WanderRoute> = {}): WanderRoute {
  return { id: "route-1", name: "Walk", description: "", geometry: { type: "LineString", coordinates: [[start.lng, start.lat], [-3.19, 55.945]] }, stops: [stop("google-a", 80, true, 55.945, -3.19), stop("google-b", 90, true, 55.946, -3.188)], distanceMeters: 1000, walkingMinutes: 20, stopMinutes: 6, bufferMinutes: 2, totalMinutes: 28, score: 70, highlights: [], isLoop: true, source: "live", start, ...overrides };
}
function params(url: string | null) {
  expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  return new URL(url!).searchParams;
}
const event: Event = { id: "sample", name: "Sample event", location: { lat: 55.9455, lng: -3.189 }, startTime: "", endTime: "", visitMinutes: 8, category: "art", description: "", isSample: true };

describe("summary stop selection", () => {
  it("prefers stops with photos and the highest scores, then keeps walking order", () => {
    const stops = [stop("a", 70), stop("b", 99, false), stop("c", 95), stop("d", 80), stop("e", 90)];
    expect(summaryStops(stops).map(place => place.id)).toEqual(["c", "d", "e"]);
    expect(summaryStops([stop("x", 50, false)]).map(place => place.id)).toEqual(["x"]);
  });
  it("maps detour route IDs to their base route", () => {
    expect(baseRouteId("abc:sample-history")).toBe("abc");
    expect(baseRouteId("abc")).toBe("abc");
  });
});

describe("Google Maps directions link", () => {
  it("returns a loop to the start through every stop with place IDs", () => {
    const query = params(googleMapsDirectionsUrl(route()));
    expect(query.get("api")).toBe("1");
    expect(query.get("travelmode")).toBe("walking");
    expect(query.get("origin")).toBe("55.944200,-3.190550");
    expect(query.get("destination")).toBe("55.944200,-3.190550");
    expect(query.get("waypoints")).toBe("55.945000,-3.190000|55.946000,-3.188000");
    expect(query.get("waypoint_place_ids")).toBe("a|b");
    expect(query.get("destination_place_id")).toBeNull();
  });
  it("finishes Explore walks at the final stop", () => {
    const query = params(googleMapsDirectionsUrl(route({ isLoop: false })));
    expect(query.get("destination")).toBe("55.946000,-3.188000");
    expect(query.get("destination_place_id")).toBe("b");
    expect(query.get("waypoints")).toBe("55.945000,-3.190000");
    expect(query.get("waypoint_place_ids")).toBe("a");
  });
  it("finishes Targeted walks at the chosen destination", () => {
    const query = params(googleMapsDirectionsUrl(route({ isLoop: false, destination: { lat: 55.94695, lng: -3.1891 } })));
    expect(query.get("destination")).toBe("55.946950,-3.189100");
    expect(query.get("waypoints")?.split("|")).toHaveLength(2);
  });
  it("keeps an event detour in position and omits partial place ID lists", () => {
    const query = params(googleMapsDirectionsUrl(route({ event, eventStopIndex: 1 })));
    expect(query.get("waypoints")).toBe("55.945000,-3.190000|55.945500,-3.189000|55.946000,-3.188000");
    expect(query.get("waypoint_place_ids")).toBeNull();
  });
  it("uses coordinates only for demo stops and falls back to the route geometry start", () => {
    const query = params(googleMapsDirectionsUrl(route({ start: undefined, stops: [stop("demo-meadows", 80)] })));
    expect(query.get("origin")).toBe("55.944200,-3.190550");
    expect(query.get("waypoint_place_ids")).toBeNull();
  });
  it("returns no link for an Explore walk without stops or an invalid start", () => {
    expect(googleMapsDirectionsUrl(route({ isLoop: false, stops: [] }))).toBeNull();
    expect(googleMapsDirectionsUrl(route({ start: { lat: NaN, lng: 0 } }))).toBeNull();
  });
});
