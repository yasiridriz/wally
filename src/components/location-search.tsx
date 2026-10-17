"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { searchLocations } from "@/app/actions/search-locations";
import type { Coordinates, LocationSearchResult } from "@/lib/types";

type Status = "idle" | "loading" | "done" | "error";
const DEBOUNCE_MS = 400;
// Session-only cache: repeating a query makes no new Places request. Nothing is persisted.
const cache = new Map<string, LocationSearchResult[]>();
const normalise = (text: string) => text.trim().replace(/\s+/g, " ");

/** A place combobox: 3+ characters search after a pause; ↑ ↓ move, Enter selects, Escape closes. */
export default function LocationSearch({ label, placeholder, value, selected, near, disabled, compact = false, onValueChange, onSelect, onClear, adornment }: {
  label: string; placeholder: string; value: string; selected: boolean; near?: Coordinates; disabled?: boolean; compact?: boolean;
  onValueChange: (text: string) => void; onSelect: (result: LocationSearchResult) => void; onClear: () => void; adornment?: React.ReactNode;
}) {
  const listId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const version = useRef(0);
  const query = normalise(value);
  const searchable = !selected && query.length >= 3;
  const nearKey = near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : "";

  useEffect(() => {
    if (!searchable || disabled) return;
    const request = ++version.current;
    const key = `${query.toLowerCase()}|${nearKey}`;
    const timer = setTimeout(async () => {
      const cached = cache.get(key);
      if (cached) { setResults(cached); setStatus("done"); setActive(cached.length ? 0 : -1); return; }
      setStatus("loading"); setError("");
      try {
        const response = await searchLocations({ query, ...(near ? { near } : {}) });
        if (request !== version.current) return;
        if (response.ok) { cache.set(key, response.data); setResults(response.data); setStatus("done"); setActive(response.data.length ? 0 : -1); }
        else { setResults([]); setStatus("error"); setError(response.error); }
      } catch {
        if (request === version.current) { setResults([]); setStatus("error"); setError("Place search couldn’t connect."); }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `near` changes with the map centre; the rounded key avoids a new search on every pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, nearKey, searchable, disabled]);

  function change(text: string) {
    version.current++;
    onValueChange(text.slice(0, 160));
    setOpen(true); setActive(-1);
    if (normalise(text).length < 3) { setResults([]); setStatus("idle"); setError(""); }
  }
  function choose(result: LocationSearchResult) {
    version.current++;
    setOpen(false); setResults([]); setStatus("idle");
    onSelect(result);
  }
  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setOpen(true); setActive(index => (index + 1) % results.length); }
    else if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setOpen(true); setActive(index => (index - 1 + results.length) % results.length); }
    else if (event.key === "Enter" && open && results[active]) { event.preventDefault(); choose(results[active]); }
    else if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); }
  }

  const showList = open && searchable && status !== "idle";
  return <div className={`combobox ${compact ? "compact" : ""}`}>
    <div className={`field ${selected ? "chosen" : ""} ${disabled ? "disabled" : ""}`}>
      <label className="sr-only" htmlFor={inputId}>{label}</label>
      <input id={inputId} type="text" role="combobox" autoComplete="off" spellCheck={false} placeholder={placeholder} value={value} disabled={disabled}
        aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={event => change(event.target.value)} onKeyDown={keyDown} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} />
      {status === "loading" && searchable ? <Loader2 className="spin field-status" size={14} aria-hidden="true" /> : null}
      {value ? <button type="button" className="field-icon" onClick={() => { version.current++; setResults([]); setStatus("idle"); onClear(); }} disabled={disabled} aria-label={`Clear ${label.toLowerCase()}`} title="Clear"><X size={14} /></button> : null}
      {adornment}
    </div>
    {showList ? <div className="suggestions" onMouseDown={event => event.preventDefault()}>
      {status === "loading" ? <p className="suggestion-status" role="status">Looking up places…</p> : null}
      {status === "error" ? <p className="suggestion-status error" role="alert">{error} You can also tap the map to drop a pin.</p> : null}
      {status === "done" && !results.length ? <p className="suggestion-status" role="status">No places found. Try adding the town, or tap the map to drop a pin.</p> : null}
      {results.length ? <ul id={listId} role="listbox" aria-label={`${label} suggestions`}>
        {results.map((result, index) => <li key={result.id} id={`${listId}-${index}`} role="option" aria-selected={index === active} className={index === active ? "active" : ""} onClick={() => choose(result)} onMouseEnter={() => setActive(index)}>
          <strong>{result.name}</strong><span>{result.address}</span>
          {result.attributions?.length ? <span className="suggestion-attribution">{result.attributions.map((attribution, i) => attribution.uri && /^https?:\/\//.test(attribution.uri) ? <a key={`${i}:${attribution.displayName}`} href={attribution.uri} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>{attribution.displayName}</a> : <span key={`${i}:${attribution.displayName}`}>{attribution.displayName}</span>)}</span> : null}
        </li>)}
      </ul> : null}
      {status === "done" ? <span className="google-text-attribution" translate="no">Google Maps</span> : null}
    </div> : null}
  </div>;
}
