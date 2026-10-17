"use client";

import { Check, CheckCheck, Clock3, Flag, RefreshCw } from "lucide-react";
import type { Duration, WanderRoute } from "@/lib/types";
import { plannedVisitMinutes } from "@/lib/geo/scoring";
import RouteCard from "./route-card";
import WalkSummary from "./walk-summary";

export default function RouteResults({ routes, selected, onSelect, visited, onVisit, onRegenerate, loading, requestedMinutes }: {
  routes: WanderRoute[]; selected?: WanderRoute; onSelect: (route: WanderRoute) => void;
  visited: string[]; onVisit: (id: string) => void; onRegenerate: () => void; loading: boolean; requestedMinutes: Duration;
}) {
  if (loading) return <section className="results-section" aria-live="polite" aria-busy="true"><div className="results-heading"><h2>Finding walking routes…</h2></div><p className="muted text-sm">Looking for interesting places and walkable paths…</p>{[1, 2, 3].map(i => <div key={i} className="route-skeleton"><div /><div /><div /></div>)}</section>;
  if (!routes.length) return null;
  return <section className="results-section"><div className="results-heading"><div><h2>Suggested routes</h2></div><button className="icon-button" onClick={onRegenerate} aria-label="Regenerate routes" title="Regenerate routes"><RefreshCw size={17} /></button></div>
    {selected?.source === "live" ? <div className="routing-notice"><span className="google-text-attribution" translate="no">Google Maps</span><p>Walking directions may not include all sidewalks or pedestrian paths. Use caution.</p>{selected.routingWarnings?.map((warning, index) => <p key={`${index}:${warning}`}>{warning}</p>)}</div> : null}
    <div className="route-list">{routes.map((route, index) => <RouteCard key={route.id} route={route} requestedMinutes={requestedMinutes} index={index} selected={route.id === selected?.id} onSelect={() => onSelect(route)} />)}</div>
    {selected ? <WalkSummary route={selected} /> : null}
    {selected ? <div className="itinerary"><div className="results-heading"><h2>Stops</h2></div><p className="time-breakdown"><Clock3 size={14} />{selected.walkingMinutes} min walking · {selected.stopMinutes} min at stops · {selected.bufferMinutes} min buffer</p>{selected.stops.some(stop => stop.suggestedActivity) ? <p className="activity-note">Activities are suggestions. Check access and opening hours.</p> : null}<ol>{selected.stops.map((stop, index) => <li key={stop.id}><span className="stop-index">{index + 1}</span><div><span className="stop-category">{stop.category.replaceAll("_", " ")} · {plannedVisitMinutes(stop)} min planned{!selected.isLoop && !selected.destination && index === selected.stops.length - 1 ? " · Finish" : ""}</span><h3>{stop.name}</h3><p>{stop.suggestedActivity || stop.description || "A point of interest along this route."}</p>{stop.suggestedActivity && stop.description && stop.description !== stop.suggestedActivity ? <p className="stop-description">{stop.description}</p> : null}{selected.source === "live" && stop.attributions?.length ? <div className="place-attributions">{stop.attributions.map((attribution, index) => attribution.uri && /^https?:\/\//.test(attribution.uri) ? <a key={`${index}:${attribution.displayName}`} href={attribution.uri} target="_blank" rel="noreferrer">{attribution.displayName}</a> : <span key={`${index}:${attribution.displayName}`}>{attribution.displayName}</span>)}</div> : null}<button className={`visited-button ${visited.includes(stop.id) ? "visited" : ""}`} onClick={() => onVisit(stop.id)} aria-pressed={visited.includes(stop.id)}>{visited.includes(stop.id) ? <CheckCheck size={14} /> : <Check size={14} />}{visited.includes(stop.id) ? "Been here" : "Mark as visited"}</button></div></li>)}{selected.destination ? <li className="destination-itinerary"><span className="stop-index endpoint-index"><Flag size={12} /></span><div><span className="stop-category">YOUR DESTINATION</span><h3>{selected.source === "demo" ? "National Museum of Scotland" : "Your chosen finish"}</h3><p>Finish at {selected.destination.lat.toFixed(4)}°, {selected.destination.lng.toFixed(4)}°. This endpoint is included in your walking estimate.</p></div></li> : null}</ol></div> : null}
  </section>;
}
