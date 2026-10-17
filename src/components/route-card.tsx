"use client";

import { Check, CheckCheck, Clock3, Flag, Footprints, MapPin, AlertTriangle } from "lucide-react";
import { plannedVisitMinutes } from "@/lib/geo/scoring";
import { matchReason } from "@/lib/route-labels";
import type { WanderRoute } from "@/lib/types";
import EventDetour from "./event-detour";
import type { Planner } from "./use-planner";

export const ROUTE_COLORS = ["#266b58", "#c77c45", "#6888a4"];
export const OVER_BUDGET_COLOR = "#800020"; // Deep Maroon / Burgundy

export const routeColor = (index: number, exceedsBudget?: boolean) =>
    exceedsBudget ? OVER_BUDGET_COLOR : ROUTE_COLORS[index % ROUTE_COLORS.length];

/** A route option. The selected card expands to its itinerary; it never nests another card. */
export default function RouteCard({ route, index, selected, planner }: { route: WanderRoute; index: number; selected: boolean; planner: Planner }) {
  const sample = route.source === "demo";
  const detailsId = `route-details-${index}`;
  const cardColor = routeColor(index, route.exceedsBudget);
  const overage = route.overBudgetMinutes || (route.budgetMinutes && route.totalMinutes > route.budgetMinutes ? route.totalMinutes - route.budgetMinutes : 0);

  return (
      <article
          className={`route-card ${selected ? "selected" : ""} ${route.exceedsBudget ? "over-budget" : ""}`}
          style={{ "--route-color": cardColor } as React.CSSProperties}
      >
        <button
            type="button"
            className="route-card-main"
            onClick={() => planner.selectRoute(route.id)}
            aria-expanded={selected}
            aria-controls={detailsId}
        >
        <span className="route-title-row">
          <span className="route-swatch" aria-hidden="true" />
          <span className="route-name">{route.name}</span>
          {route.exceedsBudget ? (
              <span className="sample-badge over-budget-badge">EXCEEDS TIME (+{overage}m)</span>
          ) : sample ? (
              <span className="sample-badge">SAMPLE DATA</span>
          ) : null}
        </span>

          <span className="route-stats">
          <span><Clock3 size={13} />{route.totalMinutes} min</span>
          <span><Footprints size={13} />{(route.distanceMeters / 1000).toFixed(1)} km</span>
          <span><MapPin size={13} />{route.stops.length} {route.stops.length === 1 ? "stop" : "stops"}</span>
        </span>

          <span className="route-description">{route.description}</span>

          {route.exceedsBudget && (
              <div className="flex items-center gap-2 mt-2 p-2 rounded-md bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs text-left">
                <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                <span>Takes {route.totalMinutes} mins (exceeds your {route.budgetMinutes || 15} min budget by {overage} mins). Highlighted in maroon.</span>
              </div>
          )}

          <span className="route-pills">
          <span className="pill match">{matchReason(route, planner.preferences.moods)}</span>
          <span className="pill score">Wander score {Math.round(route.score)}</span>
            {route.event ? <span className="pill sample">Sample event</span> : null}
            {route.highlights.slice(0, 3).map(highlight => <span key={highlight} className="pill">{highlight}</span>)}
        </span>
        </button>

        {selected ? (
            <div id={detailsId} className="route-details">
              <p className="time-breakdown">
                <Clock3 size={14} />{route.walkingMinutes} min {route.pace === "run" ? "running" : "walking"} · {route.stopMinutes} min at stops · {route.bufferMinutes} min buffer
              </p>
              <p className="route-shape-note">
                {route.isLoop ? "Returns to your start." : route.destination ? "Finishes at your destination." : "Finishes at the last stop."} {route.pace === "run" ? "Running" : "Walking"} and stops included.
              </p>
              {route.stops.some(stop => stop.suggestedActivity) ? <p className="activity-note">Activities are suggestions. Check access and opening hours.</p> : null}
              <ol className="itinerary">
                {route.stops.map((stop, stopIndex) => (
                    <li key={stop.id}>
                      <span className="stop-index">{stopIndex + 1}</span>
                      <div>
                        <span className="stop-category">{stop.category.replaceAll("_", " ")} · {plannedVisitMinutes(stop)} min planned{!route.isLoop && !route.destination && stopIndex === route.stops.length - 1 ? " · Finish" : ""}</span>
                        <h3>{stop.name}</h3>
                        <p>{stop.suggestedActivity || stop.description || "A point of interest along this route."}</p>
                        {stop.suggestedActivity && stop.description && stop.description !== stop.suggestedActivity ? <p className="stop-description">{stop.description}</p> : null}
                        {route.source === "live" && stop.attributions?.length ? (
                            <div className="place-attributions">
                              {stop.attributions.map((attribution, i) => attribution.uri && /^https?:\/\//.test(attribution.uri) ? (
                                  <a key={`${i}:${attribution.displayName}`} href={attribution.uri} target="_blank" rel="noreferrer">{attribution.displayName}</a>
                              ) : (
                                  <span key={`${i}:${attribution.displayName}`}>{attribution.displayName}</span>
                              ))}
                            </div>
                        ) : null}
                        <button type="button" className={`visited-button ${planner.visited.includes(stop.id) ? "visited" : ""}`} onClick={() => planner.visit(stop.id)} aria-pressed={planner.visited.includes(stop.id)}>
                          {planner.visited.includes(stop.id) ? <CheckCheck size={14} /> : <Check size={14} />}{planner.visited.includes(stop.id) ? "Been here" : "Mark as visited"}
                        </button>
                      </div>
                    </li>
                ))}
                {route.destination ? (
                    <li className="destination-stop">
                      <span className="stop-index finish"><Flag size={12} /></span>
                      <div>
                        <span className="stop-category">Your destination</span>
                        <h3>{sample ? "National Museum of Scotland" : planner.destination?.label || "Your chosen finish"}</h3>
                        <p>This endpoint is included in your walking estimate.</p>
                      </div>
                    </li>
                ) : null}
              </ol>
              {planner.preferences.includeEvents && !route.event ? <EventDetour planner={planner} /> : null}
            </div>
        ) : null}
      </article>
  );
}