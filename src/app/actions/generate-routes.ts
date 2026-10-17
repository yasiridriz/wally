"use server";

import { randomUUID } from "node:crypto";
import { generateLiveRoutes } from "@/lib/geo/generate";
import { generateDemoRoutes, DEMO_START, DEMO_DESTINATION } from "@/lib/demo-data";
import { registerGeneratedRoutes } from "@/lib/events";
import { distanceMeters, isCoordinates } from "@/lib/geo/coordinates";
import { isDuration } from "@/lib/duration";
import { isMoodTag, normalizeMoods } from "@/lib/preferences";
import { isPace, paceSpeed } from "@/lib/pace";
import type { ActionResult, GenerateRequest, GenerateResponse } from "@/lib/types";

function validate(raw: unknown): GenerateRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const start = input.start as Record<string, unknown> | undefined;
  if (!isCoordinates(start)) return null;
  if (!isDuration(input.duration) || !Array.isArray(input.moods) || input.moods.length > 4 || !input.moods.every(isMoodTag) || (input.pace !== undefined && !isPace(input.pace)) || !["destination", "loop", "explore"].includes(input.mode as string)) return null;
  if (input.mode === "destination" && !isCoordinates(input.destination)) return null;
  if (typeof input.includeEvents !== "boolean" || typeof input.demo !== "boolean" || !Array.isArray(input.visitedIds) || input.visitedIds.length > 500 || !input.visitedIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 120)) return null;
  const destination = input.mode === "destination" ? input.destination as GenerateRequest["destination"] : undefined;
  return { start: { lat: start.lat, lng: start.lng }, ...(destination ? { destination: { lat: destination.lat, lng: destination.lng } } : {}), duration: input.duration, moods: normalizeMoods(input.moods), mode: input.mode, pace: input.pace ?? "walk", visitedIds: [...new Set(input.visitedIds)], includeEvents: input.includeEvents, demo: input.demo } as GenerateRequest;
}

export async function generateRoutes(raw: unknown): Promise<ActionResult<GenerateResponse>> {
  const request = validate(raw);
  if (!request) return { ok: false, error: "Choose a valid starting point, duration and preferences, then try again.", code: "INVALID_INPUT" };
  if (!request.demo && request.destination) {
    const separation = distanceMeters(request.start, request.destination);
    if (separation < 50) return { ok: false, error: "Choose a destination at least 50 metres from your start, or try a loop.", code: "INVALID_DESTINATION" };
    // A generous lower-bound screen prevents requests over implausibly large areas.
    if (separation > request.duration * 90 * paceSpeed(request.pace)) return { ok: false, error: `That destination is too far for this ${request.pace === "run" ? "running" : "walking"} budget. Choose somewhere closer or allow more time.`, code: "DESTINATION_TOO_FAR" };
  }
  if (!request.demo && !process.env.GOOGLE_MAPS_API_KEY?.trim()) return { ok: false, error: "Live walks need a Google Maps server API key with Places API (New) and Routes API enabled. Select Demo Mode to try sample Edinburgh walks.", code: "MISSING_KEY" };
  try {
    const canonicalRequest = request.demo ? { ...request, start: DEMO_START, destination: request.mode === "destination" ? DEMO_DESTINATION : undefined } : request;
    const result = request.demo ? generateDemoRoutes(canonicalRequest) : await generateLiveRoutes(canonicalRequest);
    const routes = result.map((route) => ({ ...route, id: randomUUID(), start: canonicalRequest.start }));
    registerGeneratedRoutes(canonicalRequest, routes);
    let message = request.demo ? `Sample Edinburgh routes: paths are hand-drawn illustrations and times are unverified estimates. Demo walks use a fixed start at the Meadows${request.mode === "destination" ? " and finish at the National Museum of Scotland" : ""}.` : undefined;
    if (request.demo && !routes.length) {
      const modeLabel = request.mode === "loop" ? "loops" : request.mode === "explore" ? "Explore routes" : "Targeted routes";
      message = `The fixed demo ${modeLabel} do not match a ${request.duration}-minute trip. Demo routes use a fixed start at the Meadows${request.mode === "destination" ? " and finish at the National Museum of Scotland" : ""}. Switch off Demo Mode for a live route near your selected duration.`;
    } else if (routes.length < 3) message = `${message ? `${message} ` : ""}${routes.length ? `Found ${routes.length} distinct walk${routes.length === 1 ? "" : "s"} near your selected total duration.` : "No suitable walks fit this duration. Try another duration or starting point."}`;
    return { ok: true, data: { routes, message } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The walking or place provider could not complete this request. Try again, choose another start, or select Demo Mode for sample Edinburgh walks.", code: "PROVIDER_ERROR" };
  }
}
