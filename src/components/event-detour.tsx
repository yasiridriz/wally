"use client";

import { ArrowRight, Clock3, Loader2 } from "lucide-react";
import type { Planner } from "./use-planner";

/** Fictional sample events only. Shown inside the selected route, without nested cards. */
export default function EventDetour({ planner }: { planner: Planner }) {
  const { detours, detourLoading, detourError, preview } = planner;
  return <section className="event-section" aria-label="Sample event detours">
    <h3>Event detours</h3>
    <p className="muted-note">Fictional sample events, not real listings.</p>
    <button type="button" className="secondary-button" onClick={planner.findDetours} disabled={detourLoading}>
      {detourLoading ? <><Loader2 className="spin" size={15} />Checking the extra walk…</> : <>Find sample event detours<ArrowRight size={15} /></>}
    </button>
    {detourError ? <p className="inline-note" role="status">{detourError}</p> : null}
    {detours.map(option => <div key={option.id} className="event-option">
      <span className="sample-label">SAMPLE EVENT</span>
      <h4>{option.event.name}</h4>
      <p>{option.event.description}</p>
      <span className="event-timing"><Clock3 size={13} />+{option.additionalMinutes} min · {(option.additionalDistanceMeters / 1000).toFixed(1)} km extra</span>
      <small>Simulated arrival: {new Date(option.arrivalTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {option.event.visitMinutes} min visit</small>
      {preview?.id === option.id
        ? <div className="detour-actions"><p className="detour-total">Updated walk: {option.route.totalMinutes} min total · {(option.route.distanceMeters / 1000).toFixed(1)} km</p><button type="button" className="secondary-button solid" onClick={planner.acceptDetour}>Add this detour</button><button type="button" className="text-link" onClick={() => planner.setPreview(null)}>Cancel preview</button></div>
        : <button type="button" className="text-link" onClick={() => planner.setPreview(option)}>Preview updated route<ArrowRight size={13} /></button>}
    </div>)}
  </section>;
}
