import { matchesMood } from "./geo/scoring";
import type { Mood, MoodTag, WanderRoute } from "./types";

export const MOOD_LABELS: Record<Mood, string> = {
  surprise: "Surprise me", scenic: "Scenic", green: "Green & peaceful", historic: "Historic", hidden: "Hidden gems",
};

/** A short, truthful reason based only on the stop categories the engine used. */
export function matchReason(route: WanderRoute, moods: readonly MoodTag[]): string {
  if (!moods.length) return "Picked for surprise";
  const matched = moods.filter(mood => route.stops.some(stop => matchesMood(stop, mood)));
  if (!matched.length) return "A gentle mix";
  return `Leans into ${matched.length > 2 ? `${matched.length} of your tags` : matched.map(mood => MOOD_LABELS[mood]).join(" & ")}`;
}

/** "Surprise me", one tag's name, "Scenic + Historic", or "3 tags" when space runs out. */
export function moodsLabel(moods: readonly MoodTag[]): string {
  if (!moods.length) return MOOD_LABELS.surprise;
  return moods.length > 2 ? `${moods.length} tags` : moods.map(mood => MOOD_LABELS[mood]).join(" + ");
}

/** The summary bar line, e.g. "Loop back · Historic" or "Anywhere · Surprise me". */
export function routeShapeLabel({ loop, destinationLabel, moods, includeEvents, favourites = false }: { loop: boolean; destinationLabel?: string; moods: readonly MoodTag[]; includeEvents: boolean; favourites?: boolean }): string {
  const shape = loop ? "Loop back" : destinationLabel ? `To ${destinationLabel}` : "Anywhere";
  return [shape, moodsLabel(moods), favourites ? "Favourites" : "", includeEvents ? "Event detours" : ""].filter(Boolean).join(" · ");
}
