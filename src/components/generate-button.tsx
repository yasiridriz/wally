"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import type { Planner } from "./use-planner";

export default function GenerateButton({ planner, onStart, onFail, compact = false }: { planner: Planner; onStart?: () => void; onFail?: () => void; compact?: boolean }) {
  const busy = planner.loading || planner.locating;
  return <button type="button" className={`generate-button ${compact ? "compact" : ""}`} onClick={() => planner.generate(onStart, onFail)} disabled={busy} aria-busy={busy}>
    {busy ? <><Loader2 className="spin" size={18} aria-hidden="true" />{planner.locating ? "Finding you…" : planner.preferences.pace === "run" ? "Finding your run…" : "Finding your walk…"}</> : <>Find me a little adventure<ArrowRight size={18} aria-hidden="true" /></>}
  </button>;
}
