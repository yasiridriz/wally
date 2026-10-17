import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fetchPhotoUri, summaryPhotos } from "./photos";
import type { Place } from "../types";

const photoUri = "https://lh3.googleusercontent.com/place-photos/abc=s800";
function stop(id: string, score: number, photo = true): Place {
  return { id, name: `Stop ${id}`, lat: 55.945, lng: -3.19, category: "park", baseScenicScore: score, ...(photo ? { photo: { name: `places/${id}/photos/ref-${id}`, authorAttributions: [{ displayName: "A. Walker" }] } } : {}) };
}

beforeEach(() => { vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-server-secret"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Google Place Photos", () => {
  it("requests JSON with the server key in a header and returns a key-free URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "places/a/photos/r/media", photoUri })));
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchPhotoUri("places/a/photos/r", "test-server-secret")).toBe(photoUri);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places/a/photos/r/media?maxWidthPx=800&maxHeightPx=800&skipHttpRedirect=true");
    expect(url).not.toContain("test-server-secret");
    expect(options.headers["X-Goog-Api-Key"]).toBe("test-server-secret");
    expect(options.cache).toBe("no-store");
  });
  it.each(["../places", "places/a/photos/r?key=x", "https://example.com/photo"])("rejects photo name %s before calling Google", async name => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await fetchPhotoUri(name, "key")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ photoUri: "http://insecure.example/photo" }, { photoUri: "javascript:alert(1)" }, {}, null])("rejects unsafe or missing URL %j", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    expect(await fetchPhotoUri("places/a/photos/r", "key")).toBeNull();
  });
  it("returns null for provider errors and timeouts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("", { status: 403 })).mockRejectedValueOnce(new Error("timeout")));
    expect(await fetchPhotoUri("places/a/photos/r", "key")).toBeNull();
    expect(await fetchPhotoUri("places/a/photos/r", "key")).toBeNull();
  });
});

describe("summary photos", () => {
  it("makes at most three requests for the highest-scoring stops with photos", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ photoUri })));
    vi.stubGlobal("fetch", fetcher);
    const photos = await summaryPhotos([stop("a", 70), stop("b", 95), stop("c", 99, false), stop("d", 85), stop("e", 90)]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(photos.map(photo => photo.stopId)).toEqual(["b", "d", "e"]);
    expect(photos[0]).toEqual({ stopId: "b", placeName: "Stop b", url: photoUri, authorAttributions: [{ displayName: "A. Walker" }] });
  });
  it("keeps the photos that load when one request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("", { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify({ photoUri }))));
    expect(await summaryPhotos([stop("a", 80), stop("b", 90)])).toHaveLength(1);
  });
  it("makes no requests without photos and reports a missing key or total failure", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 429 })); vi.stubGlobal("fetch", fetcher);
    expect(await summaryPhotos([stop("a", 80, false)])).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(summaryPhotos([stop("a", 80)])).rejects.toMatchObject({ code: "PHOTO_ERROR" });
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    await expect(summaryPhotos([stop("a", 80)])).rejects.toMatchObject({ code: "MISSING_KEY" });
  });
});
