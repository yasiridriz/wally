"use server";

import { buildEventDetours, getRouteContext } from "@/lib/events";
import type { ActionResult, DetourOption } from "@/lib/types";

export async function getEventDetours(raw: unknown): Promise<ActionResult<DetourOption[]>> {
  if (!raw || typeof raw !== "object" || typeof (raw as { routeId?: unknown }).routeId !== "string" || (raw as { routeId: string }).routeId.length > 100) return { ok: false, error: "Select a route before discovering events.", code: "INVALID_INPUT" };
  const context = getRouteContext((raw as { routeId: string }).routeId);
  if (!context) return { ok: false, error: "This walk has expired. Regenerate routes before checking detours.", code: "EXPIRED_ROUTE" };
  try {
    return { ok: true, data: await buildEventDetours(context) };
  } catch {
    return { ok: false, error: "Event detours are unavailable. Your original walk is still ready.", code: "EVENT_ERROR" };
  }
}
