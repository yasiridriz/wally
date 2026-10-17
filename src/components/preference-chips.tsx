"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, Compass, Landmark, Leaf, Sparkles, Tag, Trees } from "lucide-react";
import type { Mood } from "@/lib/types";
import type { Planner } from "./use-planner";

type Choosable = Exclude<Mood, "surprise">;
const moods: { value: Choosable; label: string; icon: typeof Leaf }[] = [
  { value: "scenic", label: "Scenic", icon: Leaf },
  { value: "green", label: "Green & peaceful", icon: Trees },
  { value: "historic", label: "Historic", icon: Landmark },
  { value: "hidden", label: "Hidden gems", icon: Compass },
];
const EVENTS_LABEL = "Sample event detours";

function Heading({ id }: { id?: string }) {
  return <div className="tags-heading"><h2 id={id} className="section-title">What are you in the mood for?</h2><p>Fine-tune your route. All optional.</p></div>;
}

/** Desktop: wrapping chips. One mood at a time; event detours toggle on their own. */
export function PreferenceChips({ planner }: { planner: Planner }) {
  const { mood, includeEvents } = planner.preferences;
  const chip = (key: string, label: string, Icon: typeof Leaf, on: boolean, onClick: () => void) =>
    <button key={key} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} disabled={planner.loading} onClick={onClick}>{on ? <Check size={14} /> : <Icon size={14} />}{label}</button>;
  return <section className="tags" aria-labelledby="tags-heading">
    <Heading id="tags-heading" />
    <div className="chips">
      {moods.map(({ value, label, icon }) => chip(value, label, icon, mood === value, () => planner.toggleMood(value)))}
      {chip("events", EVENTS_LABEL, CalendarDays, includeEvents, planner.toggleEvents)}
      <button type="button" className={`chip surprise ${mood === "surprise" ? "on" : ""}`} aria-pressed={mood === "surprise"} disabled={planner.loading} onClick={planner.surpriseMe}><Sparkles size={14} />Surprise me</button>
      {planner.tagCount ? <button type="button" className="text-link" onClick={planner.resetTags} disabled={planner.loading}>Reset</button> : null}
    </div>
  </section>;
}

/** Phone: a Tags button with a left-anchored, scrollable dropdown over the map. */
export function PreferenceMenu({ planner }: { planner: Planner }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const { mood, includeEvents } = planner.preferences;

  useEffect(() => {
    if (!open) return;
    const close = (returnFocus: boolean) => { setOpen(false); if (returnFocus) button.current?.focus(); };
    const pointer = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) close(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(true); };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key); };
  }, [open]);

  const row = (key: string, label: string, Icon: typeof Leaf, on: boolean, onChange: () => void) =>
    <li key={key}><label className={`menu-row ${on ? "on" : ""}`}><span className="menu-icon"><Icon size={15} /></span><span className="menu-label">{label}</span><input type="checkbox" checked={on} onChange={onChange} disabled={planner.loading} /></label></li>;
  return <div className="tags-menu">
    <button ref={button} type="button" className={`tags-button ${planner.tagCount ? "on" : ""}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(value => !value)}>
      <Tag size={16} /><span className="tags-text">Tags</span>{planner.tagCount ? <span className="tag-count" aria-label={`${planner.tagCount} selected`}>{planner.tagCount}</span> : null}<ChevronDown size={14} className={open ? "flip" : ""} />
    </button>
    {open ? <div ref={menu} className="tags-dropdown" role="dialog" aria-label="Preference tags">
      <Heading />
      <ul className="menu-list">
        {moods.map(({ value, label, icon }) => row(value, label, icon, mood === value, () => planner.toggleMood(value)))}
        {row("events", EVENTS_LABEL, CalendarDays, includeEvents, planner.toggleEvents)}
      </ul>
      <div className="menu-footer">
        <button type="button" className={`chip surprise ${mood === "surprise" ? "on" : ""}`} aria-pressed={mood === "surprise"} onClick={planner.surpriseMe} disabled={planner.loading}><Sparkles size={14} />Surprise me</button>
        {planner.tagCount ? <button type="button" className="text-link" onClick={planner.resetTags} disabled={planner.loading}>Reset</button> : null}
      </div>
    </div> : null}
  </div>;
}
