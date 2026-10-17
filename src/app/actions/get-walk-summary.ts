"use server";

import { getRouteContext } from "@/lib/events";
import { PhotoError, summaryPhotos } from "@/lib/geo/photos";
import { baseRouteId } from "@/lib/walk-summary";
import type { ActionResult, WalkSummary } from "@/lib/types";

export async function getWalkSummary(raw: unknown): Promise<ActionResult<WalkSummary>> {
  const routeId = raw && typeof raw === "object" ? (raw as { routeId?: unknown }).routeId : undefined;
  if (typeof routeId !== "string" || !routeId || routeId.length > 200) return { ok: false, error: "Select a route before loading its preview.", code: "INVALID_INPUT" };
  // Only stops of a route this server generated can trigger photo requests.
  const context = getRouteContext(baseRouteId(routeId));
  if (!context) return { ok: false, error: "This walk has expired. Regenerate routes to load photos.", code: "EXPIRED_ROUTE" };
  if (context.route.source === "demo") return { ok: true, data: { photos: [] } };
  // One shared request per route; a failed attempt is not kept, so a retry can succeed.
  context.photos ??= summaryPhotos(context.route.stops);
  try {
    return { ok: true, data: { photos: await context.photos } };
  } catch (error) {
    context.photos = undefined;
    if (error instanceof PhotoError) return { ok: false, error: error.message, code: error.code };
    return { ok: false, error: "Place photos are unavailable right now.", code: "PHOTO_ERROR" };
  }
}
