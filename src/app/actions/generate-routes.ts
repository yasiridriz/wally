"use server";

import { randomUUID } from "node:crypto";
import { generateLiveRoutes } from "@/lib/geo/generate";
import { generateDemoRoutes, DEMO_START } from "@/lib/demo-data";
import { registerGeneratedRoutes } from "@/lib/events";
import { isCoordinates } from "@/lib/geo/coordinates";
import type { ActionResult, GenerateRequest, GenerateResponse } from "@/lib/types";

function validate(raw: unknown): GenerateRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const start = input.start as Record<string, unknown> | undefined;
  if (!isCoordinates(start)) return null;
  if (![15, 30, 45, 60, 90].includes(input.duration as number) || !["surprise", "scenic", "green", "historic", "hidden"].includes(input.mood as string) || !["loop", "explore"].includes(input.mode as string)) return null;
  if (typeof input.includeEvents !== "boolean" || typeof input.demo !== "boolean" || !Array.isArray(input.visitedIds) || input.visitedIds.length > 500 || !input.visitedIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 120)) return null;
  return { start: { lat: start.lat, lng: start.lng }, duration: input.duration, mood: input.mood, mode: input.mode, visitedIds: [...new Set(input.visitedIds)], includeEvents: input.includeEvents, demo: input.demo } as GenerateRequest;
}

export async function generateRoutes(raw: unknown): Promise<ActionResult<GenerateResponse>> {
  const request = validate(raw);
  if (!request) return { ok: false, error: "Choose a valid starting point, duration and preferences, then try again.", code: "INVALID_INPUT" };
  if (!request.demo && !process.env.OPENROUTESERVICE_API_KEY) return { ok: false, error: "Live routing needs an OpenRouteService API key. Select Demo Mode to try sample Edinburgh walks.", code: "MISSING_KEY" };
  try {
    const canonicalRequest = request.demo ? { ...request, start: DEMO_START } : request;
    const result = request.demo ? generateDemoRoutes(canonicalRequest) : await generateLiveRoutes(canonicalRequest);
    const routes = result.map((route) => ({ ...route, id: randomUUID() }));
    registerGeneratedRoutes(canonicalRequest, routes);
    let message = request.demo ? "Sample Edinburgh routes: paths are hand-drawn illustrations and times are unverified estimates. Demo walks use a fixed start at the Meadows." : undefined;
    if (routes.length < 3) message = `${message ? `${message} ` : ""}${routes.length ? `Found ${routes.length} distinct walk${routes.length === 1 ? "" : "s"} within your time budget.` : "No suitable walks fit this budget. Try more time or another starting point."}`;
    return { ok: true, data: { routes, message } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The walking or place provider could not complete this request. Try again, choose another start, or select Demo Mode for sample Edinburgh walks.", code: "PROVIDER_ERROR" };
  }
}
