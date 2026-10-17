"use client";

import { useEffect, useRef } from "react";
import { Brand, DemoToggle, LegalLinks } from "./brand";
import GenerateButton from "./generate-button";
import LocationFields from "./location-fields";
import { PreferenceChips } from "./preference-chips";
import RouteResults from "./route-results";
import TimeSelector from "./time-selector";
import type { Planner } from "./use-planner";

const smooth = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/** Desktop: a 400px left panel with a sticky generate button. */
export default function DesktopPanel({ planner }: { planner: Planner }) {
  const results = useRef<HTMLDivElement>(null);
  const hasRoutes = planner.routes.length > 0;
  // Scroll to the results when loading starts and when they arrive.
  useEffect(() => {
    if (planner.loading || hasRoutes) results.current?.scrollIntoView({ behavior: smooth(), block: "start" });
  }, [planner.loading, hasRoutes]);

  return <aside className="desktop-panel" aria-label="Plan your walk">
    <header className="panel-header"><Brand tagline /><DemoToggle on={planner.demo} onToggle={planner.toggleDemo} disabled={planner.loading} /></header>
    <div className="panel-scroll">
      <TimeSelector value={planner.preferences.duration} onChange={planner.setDuration} disabled={planner.loading} />
      <hr className="divider" />
      <LocationFields planner={planner} layout="stacked" />
      <PreferenceChips planner={planner} />
      <div ref={results} className="results-anchor"><RouteResults planner={planner} /></div>
      <LegalLinks />
    </div>
    <footer className="panel-footer">
      {planner.formError ? <p className="form-error" role="alert">{planner.formError}</p> : null}
      <GenerateButton planner={planner} />
    </footer>
  </aside>;
}
