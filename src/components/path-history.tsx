"use client";

import { useEffect, useRef, useState } from "react";
import { Footprints, Heart, History, Star, Trash2, X, Zap } from "lucide-react";
import type { HistoryEntry } from "@/lib/memory";
import type { Planner } from "./use-planner";

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const SHAPES: Record<HistoryEntry["mode"], string> = { loop: "Loop", destination: "To a destination", explore: "Explore" };

/** Five stars as a radio group; choosing the current star again clears it. */
export function StarRating({ value, onRate, label, disabled }: { value?: number; onRate: (rating: number) => void; label: string; disabled?: boolean }) {
  return <span className="stars" role="radiogroup" aria-label={label}>
    {[1, 2, 3, 4, 5].map(star => <button key={star} type="button" role="radio" aria-checked={value === star} aria-label={`${star} star${star === 1 ? "" : "s"}`}
      className={value && star <= value ? "on" : ""} onClick={() => onRate(star)} disabled={disabled}><Star size={16} aria-hidden="true" /></button>)}
  </span>;
}

export function FavouriteButton({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return <button type="button" className={`favourite-button ${on ? "on" : ""}`} aria-pressed={on} onClick={onToggle} disabled={disabled}>
    <Heart size={14} aria-hidden="true" />{on ? "Favourite" : "Add to favourites"}
  </button>;
}

function HistoryItem({ entry, planner }: { entry: HistoryEntry; planner: Planner }) {
  return <li className="history-item">
    <div className="history-item-head">
      <h3>{entry.name}</h3>
      <button type="button" className="icon-link" onClick={() => planner.removeHistory(entry.id)} aria-label={`Remove ${entry.name} from history`}><Trash2 size={15} /></button>
    </div>
    <p className="history-meta">
      {entry.pace === "run" ? <Zap size={12} aria-hidden="true" /> : <Footprints size={12} aria-hidden="true" />}
      {entry.totalMinutes} min {entry.pace === "run" ? "run" : "walk"} · {(entry.distanceMeters / 1000).toFixed(1)} km · {SHAPES[entry.mode]} · {dateFormat.format(new Date(entry.selectedAt))}
      {entry.source === "demo" ? <span className="sample-badge">SAMPLE</span> : null}
    </p>
    <p className="history-stops">{entry.stops.map(stop => stop.name).join(" → ")}</p>
    <div className="history-review">
      <StarRating value={entry.rating} onRate={rating => planner.rateHistory(entry.id, rating)} label={`Rate ${entry.name}`} />
      <FavouriteButton on={entry.favourite} onToggle={() => planner.toggleHistoryFavourite(entry.id)} />
    </div>
  </li>;
}

/** Routes you opened, newest first, to review and favourite. Rated and favourite routes shape the next search. */
export default function PathHistory({ planner, onClose }: { planner: Planner; onClose: () => void }) {
  const [filter, setFilter] = useState<"all" | "favourites">("all");
  const dialog = useRef<HTMLDivElement>(null);
  const entries = filter === "favourites" ? planner.history.filter(entry => entry.favourite) : planner.history;

  // Focus moves in once on open and back on close, whatever re-renders in between.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, []);

  return <div className="history-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="history-panel" role="dialog" aria-modal="true" aria-labelledby="history-title" tabIndex={-1}>
      <header className="history-header">
        <h2 id="history-title"><History size={18} aria-hidden="true" />Path history</h2>
        <button type="button" className="icon-link" onClick={onClose} aria-label="Close path history"><X size={18} /></button>
      </header>
      <p className="history-intro">Routes you open are remembered, so the next search favours new places. Rate them out of 5 and favourite the ones you love: turn on the Favourites tag to get them back.</p>
      <div className="segmented history-filter" role="radiogroup" aria-label="Show">
        <button type="button" role="radio" aria-checked={filter === "all"} onClick={() => setFilter("all")}>All ({planner.history.length})</button>
        <button type="button" role="radio" aria-checked={filter === "favourites"} onClick={() => setFilter("favourites")}><Heart size={13} aria-hidden="true" />Favourites ({planner.favouriteCount})</button>
      </div>
      {entries.length ? <ul className="history-list">{entries.map(entry => <HistoryItem key={entry.id} entry={entry} planner={planner} />)}</ul>
        : <p className="history-empty">{filter === "favourites" ? "No favourites yet. Tap the heart on a route you love." : "No routes yet. Routes you open will appear here."}</p>}
      {planner.history.length ? <footer className="history-footer">
        <span>Stored in this browser only. Ratings of live routes also help rank future routes.</span>
        <button type="button" className="text-link" onClick={() => { if (window.confirm("Clear all path history, ratings and favourites in this browser?")) planner.clearHistory(); }}>Clear history</button>
      </footer> : null}
    </div>
  </div>;
}

/** Opens the path history panel; shows how many favourites there are. */
export function HistoryButton({ planner, compact = false }: { planner: Planner; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={compact ? "icon-link" : "history-pill"} onClick={() => setOpen(true)} aria-label="Path history" title="Path history" aria-haspopup="dialog">
      <History size={compact ? 16 : 13} aria-hidden="true" />{compact ? null : "History"}
    </button>
    {open ? <PathHistory planner={planner} onClose={() => setOpen(false)} /> : null}
  </>;
}
