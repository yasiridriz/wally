import { preferenceScore } from "./geo/scoring";
import type { Mood, WanderRoute } from "./types";

export const MOOD_LABELS: Record<Mood, string> = {
  surprise: "Surprise me", scenic: "Scenic", green: "Green & peaceful", historic: "Historic", hidden: "Hidden gems",
};

/** A short, truthful reason based only on the stop categories the engine used. */
export function matchReason(route: WanderRoute, mood: Mood): string {
  if (mood === "surprise") return "Picked for surprise";
  return route.stops.some(stop => preferenceScore(stop, mood) === 100) ? `Leans into ${MOOD_LABELS[mood]}` : "A gentle mix";
}

/** The summary bar line, e.g. "Loop back · Historic" or "Anywhere · Surprise me". */
export function routeShapeLabel({ loop, destinationLabel, mood, includeEvents }: { loop: boolean; destinationLabel?: string; mood: Mood; includeEvents: boolean }): string {
  const shape = loop ? "Loop back" : destinationLabel ? `To ${destinationLabel}` : "Anywhere";
  return [shape, MOOD_LABELS[mood], includeEvents ? "Event detours" : ""].filter(Boolean).join(" · ");
}
