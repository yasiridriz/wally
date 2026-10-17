"use client";

import { ArrowUpRight, Clock3, Footprints, MapPin } from "lucide-react";
import type { WanderRoute } from "@/lib/types";
export const ROUTE_COLORS = ["#266b58", "#c77c45", "#6888a4"];
export default function RouteCard({ route, index, selected, onSelect }: { route: WanderRoute; index: number; selected: boolean; onSelect: () => void }) {
  return <button className={`route-card ${selected ? "selected" : ""}`} onClick={onSelect} aria-pressed={selected} style={{ "--route-color": ROUTE_COLORS[index % ROUTE_COLORS.length] } as React.CSSProperties}>
    <div className="route-card-top"><span className="route-number">0{index + 1}</span><span className="route-kind">{route.destination ? "THE SCENIC WAY THERE" : route.isLoop ? "A ROUND TRIP" : "A NEW DIRECTION"}</span><span className="wander-score">{Math.round(route.score)}<small>WANDER SCORE</small></span></div>
    <h3>{route.name}<ArrowUpRight size={17} /></h3><p>{route.description}</p>
    <div className="route-stats"><span><Clock3 size={13} />{route.totalMinutes} min</span><span><Footprints size={13} />{(route.distanceMeters / 1000).toFixed(1)} km</span><span><MapPin size={13} />{route.stops.length} stops</span></div>
    <div className="highlight-list">{route.highlights.slice(0, 3).map(highlight => <span key={highlight}>{highlight}</span>)}</div>
  </button>;
}
