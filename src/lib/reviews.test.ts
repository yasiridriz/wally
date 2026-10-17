import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendReview, latestReviews, loadPlaceRatings, placeRatings, type ReviewRecord } from "./reviews";

const record = (reviewId: string, rating: number | null, at: string, stopIds = ["a", "b"]): ReviewRecord => ({
  v: 1, reviewId, at, rating, favourite: false, routeName: "Route", mode: "loop", pace: "walk", moods: [], duration: 30,
  totalMinutes: 29, distanceMeters: 1800, stops: stopIds.map(id => ({ id, name: id, category: "park" })),
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("review store", () => {
  it("keeps only the newest record per review and skips malformed lines", () => {
    const lines = [record("r1", 2, "2026-10-01T00:00:00Z"), record("r1", 5, "2026-10-02T00:00:00Z"), record("r2", 3, "2026-10-01T00:00:00Z")]
      .map(value => JSON.stringify(value)).join("\n");
    const latest = latestReviews(`${lines}\n{broken\n{"v":2}\n`);
    expect(latest.map(value => [value.reviewId, value.rating])).toEqual([["r1", 5], ["r2", 3]]);
  });
  it("averages stars per place and ignores favourite-only reviews", () => {
    const ratings = placeRatings([record("r1", 5, "t"), record("r2", 3, "t", ["a"]), record("r3", null, "t", ["a"])]);
    expect(ratings.get("a")).toEqual({ average: 4, count: 2 });
    expect(ratings.get("b")).toEqual({ average: 5, count: 1 });
  });
  it("appends JSON lines and reads community ratings back", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "wally-reviews-"));
    vi.stubEnv("WALLY_REVIEWS_FILE", path.join(dir, "nested", "reviews.jsonl"));
    try {
      expect((await loadPlaceRatings()).size).toBe(0);
      await appendReview(record("r1", 4, "2026-10-01T00:00:00Z"));
      expect((await loadPlaceRatings()).get("a")).toEqual({ average: 4, count: 1 });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
