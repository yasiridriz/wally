"use client";

import { Check, CheckCheck, Clock3, RefreshCw, Sparkles } from "lucide-react";
import type { WanderRoute } from "@/lib/types";
import RouteCard from "./route-card";

export default function RouteResults({ routes, selected, onSelect, visited, onVisit, onRegenerate, loading }: {
  routes: WanderRoute[]; selected?: WanderRoute; onSelect: (route: WanderRoute) => void;
  visited: string[]; onVisit: (id: string) => void; onRegenerate: () => void; loading: boolean;
}) {
  if (loading) return <section className="results-section" aria-live="polite" aria-busy="true"><div className="results-heading"><h2>Good things take a few turns</h2></div><p className="muted text-sm">Looking for interesting places and walkable paths…</p>{[1, 2, 3].map(i => <div key={i} className="route-skeleton"><div /><div /><div /></div>)}</section>;
  if (!routes.length) return null;
  return <section className="results-section"><div className="results-heading"><div><span className="eyebrow">LESS ROUTINE, MORE DISCOVERY</span><h2>{routes.length === 1 ? "A walk worth taking" : "Pick your little adventure"}</h2></div><button className="icon-button" onClick={onRegenerate} aria-label="Regenerate routes" title="Regenerate routes"><RefreshCw size={17} /></button></div>
    <div className="route-list">{routes.map((route, index) => <RouteCard key={route.id} route={route} index={index} selected={route.id === selected?.id} onSelect={() => onSelect(route)} />)}</div>
    {selected ? <div className="itinerary"><div className="results-heading"><h2>A few reasons to wander</h2><Sparkles size={17} /></div><p className="time-breakdown"><Clock3 size={14} />{selected.walkingMinutes} min walking · {selected.stopMinutes} min at stops · {selected.bufferMinutes} min buffer</p><ol>{selected.stops.map((stop, index) => <li key={stop.id}><span className="stop-index">{index + 1}</span><div><span className="stop-category">{stop.category.replaceAll("_", " ")}</span><h3>{stop.name}</h3><p>{stop.description || "A little local discovery to pause and take in along the way."}</p><button className={`visited-button ${visited.includes(stop.id) ? "visited" : ""}`} onClick={() => onVisit(stop.id)} aria-pressed={visited.includes(stop.id)}>{visited.includes(stop.id) ? <CheckCheck size={14} /> : <Check size={14} />}{visited.includes(stop.id) ? "Been here" : "Mark as visited"}</button></div></li>)}</ol></div> : null}
  </section>;
}
