import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/reviews", () => ({ appendReview: vi.fn() }));
import { submitReview } from "./submit-review";
import { appendReview } from "@/lib/reviews";

const review = {
  reviewId: "3f2a-entry", rating: 4, favourite: true, routeName: "Calton Hill loop", mode: "loop", pace: "run", moods: ["historic", "scenic"],
  duration: 45, totalMinutes: 43.6, distanceMeters: 7210.4,
  stops: [{ id: "ChIJ1", name: "Calton Hill", category: "viewpoint", lat: 55.955, lng: -3.182, baseScenicScore: 90 }],
};
afterEach(() => { vi.resetAllMocks(); });

describe("review submission", () => {
  it("stores a normalised record without coordinates", async () => {
    expect(await submitReview(review)).toEqual({ ok: true, data: { stored: true } });
    const stored = vi.mocked(appendReview).mock.calls[0][0];
    expect(stored).toMatchObject({ v: 1, reviewId: "3f2a-entry", rating: 4, favourite: true, moods: ["scenic", "historic"], totalMinutes: 44, distanceMeters: 7210 });
    expect(stored.stops).toEqual([{ id: "ChIJ1", name: "Calton Hill", category: "viewpoint" }]);
    expect(JSON.stringify(stored)).not.toContain("55.955");
  });
  it.each([
    { ...review, rating: 6 }, { ...review, rating: 0 }, { ...review, rating: null, favourite: false }, { ...review, reviewId: "bad id!" },
    { ...review, stops: [] }, { ...review, mode: "teleport" }, { ...review, pace: "crawl" }, { ...review, moods: ["anything"] }, null,
  ])("rejects invalid reviews", async input => {
    expect(await submitReview(input)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(appendReview).not.toHaveBeenCalled();
  });
  it("accepts a favourite without stars, and keeps working on a read-only host", async () => {
    vi.mocked(appendReview).mockRejectedValue(new Error("EROFS"));
    expect(await submitReview({ ...review, rating: null })).toEqual({ ok: true, data: { stored: false } });
  });
});
