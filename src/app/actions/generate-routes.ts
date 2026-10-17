"use server";

import { randomUUID } from "node:crypto";
import { generateLiveRoutes } from "@/lib/geo/generate";
import { generateDemoRoutes, DEMO_START, DEMO_DESTINATION } from "@/lib/demo-data";
import { registerGeneratedRoutes } from "@/lib/events";
import { distanceMeters, isCoordinates } from "@/lib/geo/coordinates";
import { isDuration } from "@/lib/duration";
import { isMoodTag, normalizeMoods } from "@/lib/preferences";
import { isPace } from "@/lib/pace";
import { FAVOURITE_PLACES_LIMIT, MEMORY_LIMIT, isMemoryHint, isPlaceSummary } from "@/lib/memory";
import { loadPlaceRatings } from "@/lib/reviews";
import type { ActionResult, GenerateRequest, GenerateResponse } from "@/lib/types";

function validate(raw: unknown): GenerateRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const start = input.start as Record<string, unknown> | undefined;
  if (!isCoordinates(start)) return null;
  if (!isDuration(input.duration) || !Array.isArray(input.moods) || input.moods.length > 4 || !input.moods.every(isMoodTag) || (input.pace !== undefined && !isPace(input.pace)) || !["destination", "loop", "explore"].includes(input.mode as string)) return null;
  if (input.mode === "destination" && !isCoordinates(input.destination)) return null;
  if (typeof input.includeEvents !== "boolean" || typeof input.demo !== "boolean" || !Array.isArray(input.visitedIds) || input.visitedIds.length > 500 || !input.visitedIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 120)) return null;
  // Path memory is optional; older clients send none.
  if (input.memory !== undefined && (!Array.isArray(input.memory) || input.memory.length > MEMORY_LIMIT || !input.memory.every(isMemoryHint))) return null;
  if (input.favourites !== undefined && typeof input.favourites !== "boolean") return null;
  if (input.favouritePlaces !== undefined && (!Array.isArray(input.favouritePlaces) || input.favouritePlaces.length > FAVOURITE_PLACES_LIMIT || !input.favouritePlaces.every(isPlaceSummary))) return null;
  const memory = ((input.memory ?? []) as GenerateRequest["memory"] & object).map(({ stopIds, favourite, rating }) => ({ stopIds: [...stopIds], favourite, ...(rating ? { rating } : {}) }));
  const favouritePlaces = input.favourites ? ((input.favouritePlaces ?? []) as NonNullable<GenerateRequest["favouritePlaces"]>).map(({ id, name, category, lat, lng, baseScenicScore }) => ({ id, name, category, lat, lng, baseScenicScore: Math.min(100, Math.max(0, baseScenicScore)) })) : [];
  const destination = input.mode === "destination" ? input.destination as GenerateRequest["destination"] : undefined;
  return { start: { lat: start.lat, lng: start.lng }, ...(destination ? { destination: { lat: destination.lat, lng: destination.lng } } : {}), duration: input.duration, moods: normalizeMoods(input.moods), mode: input.mode, pace: input.pace ?? "walk", visitedIds: [...new Set(input.visitedIds)], includeEvents: input.includeEvents, demo: input.demo, memory, favourites: input.favourites === true, favouritePlaces } as GenerateRequest;
}

export async function generateRoutes(raw: unknown): Promise<ActionResult<GenerateResponse>> {
  const request = validate(raw);
  if (!request) return { ok: false, error: "Choose a valid starting point, duration and preferences, then try again.", code: "INVALID_INPUT" };
  if (!request.demo && request.destination) {
    const separation = distanceMeters(request.start, request.destination);
    if (separation < 50) return { ok: false, error: "Choose a destination at least 50 metres from your start, or try a loop.", code: "INVALID_DESTINATION" };
    // Any destination is planned: one out of reach in the time gets the direct
    // route, marked over budget, so the user sees how long it really takes.
  }
  if (!request.demo && !process.env.GOOGLE_MAPS_API_KEY?.trim()) return { ok: false, error: "Live walks need a Google Maps server API key with Places API (New) and Routes API enabled. Select Demo Mode to try sample Edinburgh walks.", code: "MISSING_KEY" };
  try {
    // Everyone's reviews nudge live routes; demo places are never reviewed.
    const reviewed = request.demo ? request : { ...request, ratings: await loadPlaceRatings() };
    const canonicalRequest = request.demo ? { ...request, start: DEMO_START, destination: request.mode === "destination" ? DEMO_DESTINATION : undefined, favouritePlaces: [] } : reviewed;
    const result = request.demo ? generateDemoRoutes(canonicalRequest) : await generateLiveRoutes(canonicalRequest);
    const routes = result.map((route) => ({ ...route, id: randomUUID(), start: canonicalRequest.start }));
    registerGeneratedRoutes(canonicalRequest, routes);
    let message = request.demo ? `Sample Edinburgh routes: paths are hand-drawn illustrations and times are unverified estimates. Demo walks use a fixed start at the Meadows${request.mode === "destination" ? " and finish at the National Museum of Scotland" : ""}.` : undefined;
    if (request.demo && !routes.length) {
      const modeLabel = request.mode === "loop" ? "loops" : request.mode === "explore" ? "Explore routes" : "Targeted routes";
      message = `The fixed demo ${modeLabel} do not match a ${request.duration}-minute trip. Demo routes use a fixed start at the Meadows${request.mode === "destination" ? " and finish at the National Museum of Scotland" : ""}. Switch off Demo Mode for a live route near your selected duration.`;
    } else if (routes[0]?.overBudget) message = "";
    else if (routes.length < 3) message = `${message ? `${message} ` : ""}${routes.length ? `Found ${routes.length} distinct walk${routes.length === 1 ? "" : "s"} near your selected total duration.` : "No suitable walks fit this duration. Try another duration or starting point."}`;
    return { ok: true, data: { routes, message } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The walking or place provider could not complete this request. Try again, choose another start, or select Demo Mode for sample Edinburgh walks.", code: "PROVIDER_ERROR" };
  }
}
