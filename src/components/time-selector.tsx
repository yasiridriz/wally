"use client";

import { useId, useState } from "react";
import { Minus, Plus, Sprout } from "lucide-react";
import { DURATION_PRESETS, MAX_DURATION, MIN_DURATION, clampDuration, durationHint } from "@/lib/duration";

const fraction = (minutes: number) => (minutes - MIN_DURATION) / (MAX_DURATION - MIN_DURATION);

/** The main control: a big number, a 1-minute slider, ±5 buttons and presets, always in sync. */
export default function TimeSelector({ value, onChange, compact = false, disabled = false }: { value: number; onChange: (minutes: number) => void; compact?: boolean; disabled?: boolean }) {
  const headingId = useId();
  // The number bounces after a tap, never on every slider step.
  const [bounce, setBounce] = useState(0);
  function set(minutes: number, tapped: boolean) {
    const next = clampDuration(minutes);
    if (next === value) return;
    onChange(next);
    if (tapped) setBounce(count => count + 1);
  }
  const hint = durationHint(value);
  return <section className={`time-selector ${compact ? "compact" : ""}`} aria-labelledby={headingId}>
    <h2 id={headingId} className={compact ? "sr-only" : "section-title"}>How much time have you got?</h2>
    <div className="time-readout">
      <p className="time-value"><span key={bounce} className={`time-number ${bounce ? "bounce" : ""}`}>{value}</span><span className="time-unit">minutes</span></p>
      <div className="time-steppers">
        <button type="button" className="round-button" onClick={() => set(value - 5, true)} disabled={disabled || value <= MIN_DURATION} aria-label="5 minutes less"><Minus size={compact ? 16 : 18} /></button>
        <button type="button" className="round-button" onClick={() => set(value + 5, true)} disabled={disabled || value >= MAX_DURATION} aria-label="5 minutes more"><Plus size={compact ? 16 : 18} /></button>
      </div>
    </div>
    <div className="time-slider" style={{ "--fill": fraction(value) } as React.CSSProperties}>
      <input type="range" min={MIN_DURATION} max={MAX_DURATION} step={1} value={value} disabled={disabled} aria-label="Total walk time" aria-valuetext={`${value} minutes`} onChange={event => set(Number(event.target.value), false)} />
      {DURATION_PRESETS.filter(preset => preset > value).map(preset => <span key={preset} className="time-tick" style={{ "--at": fraction(preset) } as React.CSSProperties} aria-hidden="true" />)}
    </div>
    <div className="time-presets" role="group" aria-label="Quick durations">
      {DURATION_PRESETS.map(preset => <button key={preset} type="button" className="preset" aria-pressed={value === preset} disabled={disabled} onClick={() => set(preset, true)}>{preset}<span> min</span></button>)}
    </div>
    <p key={hint} className="time-hint"><Sprout size={14} aria-hidden="true" />{hint}</p>
  </section>;
}
