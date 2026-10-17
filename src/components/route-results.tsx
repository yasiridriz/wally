"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Info, Plug, RefreshCw, TriangleAlert } from "lucide-react";
import RouteCard from "./route-card";
import WalkSummary from "./walk-summary";
import type { Planner } from "./use-planner";

const LOADING_LINES = ["Finding the road less travelled…", "Looking for something interesting…", "Avoiding the obvious…"];

function LoadingState() {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setLine(index => (index + 1) % LOADING_LINES.length), 1800);
    return () => clearInterval(timer);
  }, []);
  return <div className="results-loading" aria-live="polite" aria-busy="true">
    <p key={line} className="loading-line">{LOADING_LINES[line]}</p>
    {[0, 1, 2].map(index => <div key={index} className="route-skeleton" aria-hidden="true"><span /><span /><span /></div>)}
  </div>;
}

/** Loading, error, or up to three route cards for the current request. */
export default function RouteResults({ planner }: { planner: Planner }) {
  const { error, loading, routes, selected, message, demo } = planner;
  const overBudget = routes.find(route => route.overBudget);
  if (!planner.generated && !routes.length) return null;
  return <section className="results" aria-label="Your walks">
    {demo ? <div className="notice"><Info size={16} /><p><strong>Sample Edinburgh walks.</strong> Paths and times are illustrative, not verified directions.{!planner.hasLiveSetup ? " Configure Google Maps to use live routing." : ""}</p></div> : null}
    {loading ? <LoadingState /> : null}
    {error ? <div className="error-box" role="alert">
      {error.code === "MISSING_KEY" ? <Plug size={18} /> : <TriangleAlert size={18} />}
      <div>
        <strong>{error.code === "MISSING_KEY" ? "Route engine not connected" : "No walk this time"}</strong>
        <p>{error.message}</p>
        {!demo ? <button type="button" className="text-link" onClick={planner.toggleDemo}>Try Edinburgh Demo Mode<ArrowUpRight size={14} /></button> : null}
      </div>
    </div> : null}
    {message && !loading ? <p className="generation-message" role="status">{message}</p> : null}
    {overBudget && !loading ? <div className="over-budget-alert" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <p><strong>Your destination can’t be reached in {planner.preferences.duration} minutes.</strong> The most direct {overBudget.pace === "run" ? "run" : "walk"} takes about <strong>{overBudget.totalMinutes} minutes</strong>, {overBudget.totalMinutes - planner.preferences.duration} minutes longer. It’s shown in red: allow more time or choose a closer destination.</p>
    </div> : null}
    {routes.length && !loading ? <>
      <div className="results-heading">
        <h2 className="section-title">{overBudget ? "The way there" : "Pick your adventure"}</h2>
        <button type="button" className="round-button small" onClick={() => planner.generate()} aria-label="Find different walks" title="Find different walks"><RefreshCw size={15} /></button>
      </div>
      {selected?.source === "live" ? <div className="routing-notice"><span className="google-text-attribution" translate="no">Google Maps</span><p>Walking directions may not include all sidewalks or pedestrian paths. Use caution.</p>{selected.routingWarnings?.map((warning, index) => <p key={`${index}:${warning}`}>{warning}</p>)}</div> : null}
      <div className="route-list">{routes.map((route, index) => <RouteCard key={route.id} route={route} index={index} selected={route.id === selected?.id} planner={planner} />)}</div>
      {selected ? <WalkSummary route={selected} /> : null}
      {planner.acceptedDetour ? <p className="generation-message">Sample detour added: {planner.acceptedDetour.event.name}. Total estimate includes the visit.</p> : null}
    </> : null}
  </section>;
}
