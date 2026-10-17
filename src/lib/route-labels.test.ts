import { describe, expect, it } from "vitest";
import { matchReason, routeShapeLabel } from "./route-labels";
import type { Place, WanderRoute } from "./types";

const stop = (category: Place["category"]): Place => ({ id: category, name: category, lat: 55.94, lng: -3.19, category, baseScenicScore: 80 });
const route = (stops: Place[]) => ({ stops } as WanderRoute);

describe("route labels", () => {
  it("explains a match only when a stop really fits the mood", () => {
    expect(matchReason(route([stop("historic")]), "historic")).toBe("Leans into Historic");
    expect(matchReason(route([stop("park")]), "historic")).toBe("A gentle mix");
    expect(matchReason(route([stop("park")]), "surprise")).toBe("Picked for surprise");
  });
  it("summarises the route shape and tags", () => {
    expect(routeShapeLabel({ loop: true, mood: "historic", includeEvents: false })).toBe("Loop back · Historic");
    expect(routeShapeLabel({ loop: false, destinationLabel: "National Museum", mood: "surprise", includeEvents: false })).toBe("To National Museum · Surprise me");
    expect(routeShapeLabel({ loop: false, mood: "surprise", includeEvents: true })).toBe("Anywhere · Surprise me · Event detours");
  });
});
