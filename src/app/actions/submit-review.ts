"use server";

import { isDuration } from "@/lib/duration";
import { isPlaceSummary, isRating } from "@/lib/memory";
import { isPace } from "@/lib/pace";
import { isMoodTag, normalizeMoods } from "@/lib/preferences";
import { appendReview, type ReviewRecord } from "@/lib/reviews";
import type { ActionResult } from "@/lib/types";

function validate(raw: unknown): ReviewRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const id = /^[A-Za-z0-9:_-]{1,120}$/;
  if (typeof input.reviewId !== "string" || !id.test(input.reviewId)) return null;
  if (input.rating !== null && !isRating(input.rating)) return null;
  if (typeof input.favourite !== "boolean" || (input.rating === null && !input.favourite)) return null;
  if (typeof input.routeName !== "string" || !input.routeName.trim() || input.routeName.length > 200) return null;
  if (!["loop", "destination", "explore"].includes(input.mode as string) || !isPace(input.pace) || !isDuration(input.duration)) return null;
  if (!Array.isArray(input.moods) || input.moods.length > 4 || !input.moods.every(isMoodTag)) return null;
  if (typeof input.totalMinutes !== "number" || !Number.isFinite(input.totalMinutes) || input.totalMinutes <= 0 || input.totalMinutes > 2_000) return null;
  if (typeof input.distanceMeters !== "number" || !Number.isFinite(input.distanceMeters) || input.distanceMeters < 0 || input.distanceMeters > 500_000) return null;
  if (!Array.isArray(input.stops) || !input.stops.length || input.stops.length > 8 || !input.stops.every(isPlaceSummary)) return null;
  return {
    v: 1, reviewId: input.reviewId, at: new Date().toISOString(), rating: input.rating as number | null, favourite: input.favourite,
    routeName: input.routeName.trim(), mode: input.mode as ReviewRecord["mode"], pace: input.pace, moods: normalizeMoods(input.moods),
    duration: input.duration, totalMinutes: Math.round(input.totalMinutes), distanceMeters: Math.round(input.distanceMeters),
    stops: input.stops.map(({ id, name, category }) => ({ id, name: name.slice(0, 200), category })),
  };
}

/** Stores a live route's review for future ranking. Demo routes are never sent here. */
export async function submitReview(raw: unknown): Promise<ActionResult<{ stored: boolean }>> {
  const record = validate(raw);
  if (!record) return { ok: false, error: "That review could not be saved.", code: "INVALID_INPUT" };
  try {
    await appendReview(record);
    return { ok: true, data: { stored: true } };
  } catch {
    // A read-only host keeps the review in this browser only.
    return { ok: true, data: { stored: false } };
  }
}
