/** Total trip minutes: walking, planned visits and the safety buffer. */
export const MIN_DURATION = 5;
export const MAX_DURATION = 180;
export const DURATION_PRESETS = [15, 30, 45, 60, 90] as const;
export const DEFAULT_DURATION = 30;

export function isDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_DURATION && value <= MAX_DURATION;
}

export function clampDuration(value: number): number {
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(Number.isFinite(value) ? value : DEFAULT_DURATION)));
}

/** "1 h 20 min" from 60 minutes; shorter durations stay in minutes. */
export function friendlyDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${minutes} min`;
}

/** Encouragement only; it never promises a route length. */
export function durationHint(minutes: number): string {
  const hint = minutes <= 20 ? "A tiny escape." : minutes <= 35 ? "Enough time to find a hidden gem." : minutes <= 50 ? "Take the long way." : minutes <= 75 ? "Make an afternoon of it." : "Get properly lost.";
  return minutes >= 60 ? `${hint} · ${friendlyDuration(minutes)}` : hint;
}
