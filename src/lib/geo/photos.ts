import "server-only";
import type { Place, SummaryPhoto } from "../types";
import { summaryStops } from "../walk-summary";
import { PHOTO_NAME } from "./places";

export class PhotoError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

/** Resolve one photo name to a short-lived image URL. The URL holds no API key. */
export async function fetchPhotoUri(name: string, apiKey: string): Promise<string | null> {
  if (!PHOTO_NAME.test(name)) return null;
  try {
    // skipHttpRedirect returns JSON, so the server key never reaches the browser.
    // No application or Next.js response cache: Google photo content stays ephemeral.
    const response = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&maxHeightPx=800&skipHttpRedirect=true`, {
      headers: { "X-Goog-Api-Key": apiKey }, signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const uri = data && typeof data === "object" ? (data as { photoUri?: unknown }).photoUri : undefined;
    if (typeof uri !== "string" || uri.length > 4096) return null;
    return new URL(uri).protocol === "https:" ? uri : null;
  } catch {
    return null;
  }
}

/** At most three Place Photo requests, for the highest-scoring stops with photos. */
export async function summaryPhotos(stops: Place[]): Promise<SummaryPhoto[]> {
  const candidates = summaryStops(stops).filter(stop => stop.photo && PHOTO_NAME.test(stop.photo.name));
  if (!candidates.length) return [];
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) throw new PhotoError("Place photos need GOOGLE_MAPS_API_KEY.", "MISSING_KEY");
  const photos = await Promise.all(candidates.map(async (stop): Promise<SummaryPhoto | null> => {
    const url = await fetchPhotoUri(stop.photo!.name, apiKey);
    return url ? { stopId: stop.id, placeName: stop.name, url, authorAttributions: stop.photo!.authorAttributions } : null;
  }));
  const found = photos.filter((photo): photo is SummaryPhoto => photo !== null);
  if (!found.length) throw new PhotoError("Place photos are unavailable right now.", "PHOTO_ERROR");
  return found;
}
