import { describe, expect, it } from "vitest";
import { matchReason, routeShapeLabel } from "./route-labels";
import type { Place, WanderRoute } from "./types";

const stop = (category: Place["category"]): Place => ({ id: category, name: category, lat: 55.94, lng: -3.19, category, baseScenicScore: 80 });
const route = (stops: Place[]) => ({ stops } as WanderRoute);

describe("route labels", () => {
  it("explains a match only when a stop really fits the mood", () => {
    expect(matchReason(route([stop("historic")]), ["historic"])).toBe("Leans into Historic");
    expect(matchReason(route([stop("park")]), ["historic"])).toBe("A gentle mix");
    expect(matchReason(route([stop("park")]), [])).toBe("Picked for surprise");
    expect(matchReason(route([stop("park"), stop("historic")]), ["green", "historic"])).toBe("Leans into Green & peaceful & Historic");
    expect(matchReason(route([stop("park")]), ["green", "historic"])).toBe("Leans into Green & peaceful");
  });
  it("summarises the route shape and tags", () => {
    expect(routeShapeLabel({ loop: true, moods: ["historic"], includeEvents: false })).toBe("Loop back · Historic");
    expect(routeShapeLabel({ loop: true, moods: ["scenic", "historic"], includeEvents: false })).toBe("Loop back · Scenic + Historic");
    expect(routeShapeLabel({ loop: true, moods: ["scenic", "green", "historic"], includeEvents: false })).toBe("Loop back · 3 tags");
    expect(routeShapeLabel({ loop: false, destinationLabel: "National Museum", moods: [], includeEvents: false })).toBe("To National Museum · Surprise me");
    expect(routeShapeLabel({ loop: false, moods: [], includeEvents: true })).toBe("Anywhere · Surprise me · Event detours");
    expect(routeShapeLabel({ loop: true, moods: ["green"], includeEvents: false, favourites: true })).toBe("Loop back · Green & peaceful · Favourites");
  });
});
