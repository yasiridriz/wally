"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import Link from "next/link";
import { routeShapeLabel } from "@/lib/route-labels";
import { Brand, BrandMark, DemoToggle, PaceToggle } from "./brand";
import GenerateButton from "./generate-button";
import LocationFields from "./location-fields";
import { PreferenceMenu } from "./preference-chips";
import RouteResults from "./route-results";
import TimeSelector from "./time-selector";
import type { Planner } from "./use-planner";

/** Publish an element's height as a CSS variable so the map frames routes between the panels. */
function usePublishedHeight(name: string, element: React.RefObject<HTMLElement | null>, edge: "bottom" | "height", present: boolean) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const node = element.current;
    if (!node) { root.style.setProperty(name, "0px"); return; }
    const publish = () => root.style.setProperty(name, `${Math.round(edge === "bottom" ? node.getBoundingClientRect().bottom : node.offsetHeight)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => { observer.disconnect(); root.style.setProperty(name, "0px"); };
  }, [name, element, edge, present]);
}

/** Phone: a floating top card that folds to a summary bar, and a results sheet. */
export default function MobilePlanner({ planner }: { planner: Planner }) {
  const [folded, setFolded] = useState(false);
  const [sheetFolded, setSheetFolded] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const { routes, selected, loading, error, generated } = planner;
  const showSheet = generated || routes.length > 0;
  usePublishedHeight("--wally-top", top, "bottom", true);
  usePublishedHeight("--wally-sheet", sheet, "height", showSheet);

  // Without results there is nothing to fold away, so the full card returns.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (!showSheet) { setFolded(false); setSheetFolded(false); } }, [showSheet]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onStart = () => { setFolded(true); setSheetFolded(false); };
  const onFail = () => setFolded(false);
  const reopen = () => { setFolded(false); setSheetFolded(true); };
  const title = loading ? "Finding your walk…" : routes.length ? (sheetFolded && selected ? selected.name : "Pick your adventure") : error || generated ? "No walk this time" : "";
  const destinationLabel = planner.demo ? "National Museum" : planner.destination?.label;

  return <>
    <div ref={top} className="phone-top">
      {folded ? <button type="button" className="summary-bar" onClick={reopen} aria-label="Edit your walk">
        <BrandMark size={26} />
        <span className="summary-text"><span className="summary-duration">{planner.preferences.duration} min {planner.preferences.pace === "run" ? "run" : "walk"}</span><span className="summary-detail">{routeShapeLabel({ loop: planner.loop, destinationLabel, moods: planner.preferences.moods, includeEvents: planner.preferences.includeEvents })}</span></span>
        <span className="summary-edit">Edit</span>
      </button> : <div className="phone-card">
        <div className="phone-brand">
          <Brand compact />
          <span className="phone-brand-actions">
            <DemoToggle on={planner.demo} onToggle={planner.toggleDemo} disabled={loading} />
            <PaceToggle pace={planner.preferences.pace} onToggle={planner.togglePace} disabled={loading} />
            <Link className="icon-link" href="/terms" aria-label="About Wally and terms of use"><Info size={16} /></Link>
            {routes.length ? <button type="button" className="icon-link" onClick={() => { setFolded(true); setSheetFolded(false); }} aria-label="Hide the planner"><ChevronUp size={18} /></button> : null}
          </span>
        </div>
        <TimeSelector compact value={planner.preferences.duration} onChange={planner.setDuration} disabled={loading} />
        <LocationFields planner={planner} layout="row" />
        <div className="phone-actions"><PreferenceMenu planner={planner} /><GenerateButton planner={planner} compact onStart={onStart} onFail={onFail} /></div>
        {planner.formError ? <p className="form-error" role="alert">{planner.formError}</p> : null}
      </div>}
    </div>
    {showSheet ? <section ref={sheet} className={`results-sheet ${sheetFolded ? "folded" : ""}`} aria-label="Your walks">
      <button type="button" className="sheet-header" onClick={() => setSheetFolded(value => !value)} aria-expanded={!sheetFolded}>
        <span className="sheet-handle" aria-hidden="true" />
        <span className="sheet-title">{title}</span>
        {routes.length && !loading ? <span className="sheet-count">{routes.length} {routes.length === 1 ? "option" : "options"}</span> : null}
        {sheetFolded ? <ChevronUp size={18} aria-label="Show results" /> : <ChevronDown size={18} aria-label="Fold results" />}
      </button>
      {sheetFolded ? null : <div className="sheet-scroll"><RouteResults planner={planner} /></div>}
    </section> : null}
  </>;
}
