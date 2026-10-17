"use client";

import { ArrowRight, Crosshair, LocateFixed, Loader2, Repeat2 } from "lucide-react";
import LocationSearch from "./location-search";
import type { Planner, PickTarget } from "./use-planner";

function PickButton({ planner, target }: { planner: Planner; target: PickTarget }) {
  const active = planner.picking === target;
  return <button type="button" className={`field-icon ${active ? "picking" : ""}`} onClick={() => planner.pickOnMap(target)} disabled={planner.loading || planner.demo} aria-pressed={active}
    aria-label={target === "start" ? "Pick the starting point on the map" : "Pick the destination on the map"} title="Pick on map"><Crosshair size={14} /></button>;
}

function LocateButton({ planner }: { planner: Planner }) {
  return <button type="button" className="field-icon" onClick={planner.locateMe} disabled={planner.locating || planner.loading || planner.demo} aria-label="Use my location" title="Use my location">
    {planner.locating ? <Loader2 className="spin" size={14} /> : <LocateFixed size={14} />}
  </button>;
}

function SampleField({ label }: { label: string }) {
  return <div className="field readonly"><span>{label}</span><small>sample</small></div>;
}

function StartInput({ planner, compact }: { planner: Planner; compact?: boolean }) {
  if (planner.demo) return <SampleField label={compact ? "The Meadows" : "The Meadows, Edinburgh"} />;
  return <LocationSearch label="Starting from" placeholder={compact ? "My location" : "Your current location"} value={planner.startText} selected={Boolean(planner.start)}
    near={planner.searchBias} disabled={planner.loading} compact={compact} onValueChange={planner.setStartText}
    onSelect={result => planner.selectSearchResult("start", result)} onClear={() => planner.chooseStart(null)}
    adornment={compact ? undefined : <><LocateButton planner={planner} /><PickButton planner={planner} target="start" /></>} />;
}

function DestinationInput({ planner, compact }: { planner: Planner; compact?: boolean }) {
  if (planner.loop) return <div className="field loop-box" aria-label="Destination: back to start">Back to start</div>;
  if (planner.demo) return <SampleField label={compact ? "National Museum" : "National Museum of Scotland"} />;
  return <LocationSearch label="Where to?" placeholder={compact ? "Anywhere" : "Anywhere is fine"} value={planner.destinationText} selected={Boolean(planner.destination)}
    near={planner.searchBias} disabled={planner.loading} compact={compact} onValueChange={planner.setDestinationText}
    onSelect={result => planner.selectSearchResult("destination", result)} onClear={() => planner.chooseDestination(null)}
    adornment={compact ? undefined : <PickButton planner={planner} target="destination" />} />;
}

/** Start and finish, with the Loop back | Finish elsewhere choice. */
export default function LocationFields({ planner, layout }: { planner: Planner; layout: "stacked" | "row" }) {
  const { loop } = planner;
  if (layout === "row") {
    return <div className="route-row">
      <div className="row-field">
        <div className="row-label"><span>From</span>{planner.demo ? null : <span className="row-actions"><LocateButton planner={planner} /><PickButton planner={planner} target="start" /></span>}</div>
        <StartInput planner={planner} compact />
      </div>
      <button type="button" className={`loop-toggle ${loop ? "on" : ""}`} aria-pressed={loop} disabled={planner.loading} onClick={() => planner.setShape(loop ? "elsewhere" : "loop")}
        aria-label={loop ? "Loop back to the start. Tap to finish elsewhere." : "Finish elsewhere. Tap to loop back to the start."}>
        {loop ? <Repeat2 size={18} /> : <ArrowRight size={18} />}<span>{loop ? "Loop back" : "Elsewhere"}</span>
      </button>
      <div className="row-field">
        <div className="row-label"><span>To</span>{planner.demo || loop ? null : <span className="row-actions"><PickButton planner={planner} target="destination" /></span>}</div>
        <DestinationInput planner={planner} compact />
      </div>
    </div>;
  }
  return <section className="route-fields" aria-label="Start and finish">
    <div className="stacked-fields">
      <div className={`route-spine ${loop ? "loop" : ""}`} aria-hidden="true"><span className="spine-start" /><span className="spine-line" /><span className="spine-end" /></div>
      <div className="field-group"><span className="field-label">Starting from</span><StartInput planner={planner} /></div>
      <div className="field-group"><span className="field-label">Where to?</span><DestinationInput planner={planner} /></div>
    </div>
    <div className="segmented" role="radiogroup" aria-label="Route shape">
      <button type="button" role="radio" aria-checked={loop} disabled={planner.loading} onClick={() => planner.setShape("loop")}><Repeat2 size={15} />Loop back</button>
      <button type="button" role="radio" aria-checked={!loop} disabled={planner.loading} onClick={() => planner.setShape("elsewhere")}><ArrowRight size={15} />Finish elsewhere</button>
    </div>
  </section>;
}
