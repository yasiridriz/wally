"use client";

import { ArrowRight, Clock3 } from "lucide-react";
import type { DetourOption } from "@/lib/types";
export default function EventDetour({ options, loading, error, onFind, onPreview, onAccept, onCancel, preview }: {
  options: DetourOption[]; loading: boolean; error: string; onFind: () => void; onPreview: (option: DetourOption) => void; onAccept: () => void; onCancel: () => void; preview: DetourOption | null;
}) {
  return <section className="event-section"><h2>Event detours</h2><p>Fictional sample events, not real listings.</p><button className="secondary-button" onClick={onFind} disabled={loading}>{loading ? "Checking the extra walk…" : "Find sample event detours"}<ArrowRight size={16} /></button>{error ? <p className="inline-error" role="status">{error}</p> : null}
    {options.map(option => <article key={option.id} className="event-option"><span className="sample-label">SAMPLE EVENT</span><h3>{option.event.name}</h3><p>{option.event.description}</p><span className="event-timing"><Clock3 size={13} />+{option.additionalMinutes} min · {(option.additionalDistanceMeters / 1000).toFixed(1)} km extra</span><small className="muted">Simulated arrival: {new Date(option.arrivalTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {option.event.visitMinutes} min visit</small>{preview?.id === option.id ? <div className="detour-actions"><p className="detour-total">Updated walk: {option.route.totalMinutes} min total · {(option.route.distanceMeters / 1000).toFixed(1)} km</p><button className="primary-button" onClick={onAccept}>Add this detour</button><button className="text-button" onClick={onCancel}>Cancel preview</button></div> : <button className="text-button" onClick={() => onPreview(option)}>Preview updated route <ArrowRight size={14} /></button>}</article>)}
  </section>;
}
