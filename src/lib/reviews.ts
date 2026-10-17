import "server-only";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { MoodTag, Pace, PlaceCategory, PlaceRating, RouteMode } from "./types";

/**
 * One route review, as stored for later analysis. Version 1. Each line of the
 * store is one record; a re-rated route appends a newer record with the same
 * `reviewId`, and only the newest counts. No coordinates or user identity are kept.
 */
export type ReviewRecord = {
  v: 1;
  reviewId: string;
  at: string;
  /** 1–5 stars, or null when the route was only favourited. */
  rating: number | null;
  favourite: boolean;
  routeName: string;
  mode: RouteMode;
  pace: Pace;
  moods: MoodTag[];
  duration: number;
  totalMinutes: number;
  distanceMeters: number;
  /** Google place ids in route order. */
  stops: { id: string; name: string; category: PlaceCategory }[];
};

/** JSON Lines file; set WALLY_REVIEWS_FILE to move it (for example onto a persistent volume). */
export function reviewsFile(): string {
  return process.env.WALLY_REVIEWS_FILE?.trim() || path.join(process.cwd(), ".data", "reviews.jsonl");
}

export async function appendReview(record: ReviewRecord): Promise<void> {
  const file = reviewsFile();
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
}

/** Newest record per review, from raw JSON Lines; malformed lines are skipped. */
export function latestReviews(text: string): ReviewRecord[] {
  const latest = new Map<string, ReviewRecord>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as ReviewRecord;
      if (record?.v !== 1 || typeof record.reviewId !== "string" || !Array.isArray(record.stops)) continue;
      const previous = latest.get(record.reviewId);
      if (!previous || previous.at <= record.at) latest.set(record.reviewId, record);
    } catch { /* A torn or edited line never breaks the rest. */ }
  }
  return [...latest.values()];
}

/** Average stars per place across everyone's newest reviews. */
export function placeRatings(records: ReviewRecord[]): Map<string, PlaceRating> {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const record of records) {
    if (record.rating === null || !Number.isInteger(record.rating) || record.rating < 1 || record.rating > 5) continue;
    for (const stop of new Set(record.stops.map(value => value.id))) {
      const total = totals.get(stop) ?? { sum: 0, count: 0 };
      totals.set(stop, { sum: total.sum + record.rating, count: total.count + 1 });
    }
  }
  return new Map([...totals].map(([id, { sum, count }]) => [id, { average: sum / count, count }]));
}

let cache: { file: string; modified: number; ratings: Map<string, PlaceRating> } | undefined;

/** Community ratings, re-read only when the store changes. Empty when there is no store yet. */
export async function loadPlaceRatings(): Promise<Map<string, PlaceRating>> {
  const file = reviewsFile();
  try {
    const { mtimeMs } = await stat(file);
    if (cache?.file === file && cache.modified === mtimeMs) return cache.ratings;
    const ratings = placeRatings(latestReviews(await readFile(file, "utf8")));
    cache = { file, modified: mtimeMs, ratings };
    return ratings;
  } catch {
    return new Map();
  }
}
