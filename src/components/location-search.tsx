"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { searchLocations } from "@/app/actions/search-locations";
import type { Coordinates, LocationSearchResult } from "@/lib/types";

export default function LocationSearch({ label, selectedLabel, selectedAddress, hasSelection, near, disabled, onSelect, onClear }: {
  label: string; selectedLabel: string; selectedAddress?: string; hasSelection: boolean; near?: Coordinates; disabled: boolean;
  onSelect: (result: LocationSearchResult) => void; onClear: () => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, []);

  function clearSearch() { version.current++; setQuery(""); setResults([]); setError(""); setSearched(false); setLoading(false); }
  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || loading) return;
    const text = query.trim().replace(/\s+/g, " ");
    if (text.length < 3) { setError("Enter at least three characters, such as a place name and city."); return; }
    const request = ++version.current;
    setLoading(true); setError(""); setSearched(false); setResults([]);
    try {
      const response = await searchLocations({ query: text, ...(near ? { near } : {}) });
      if (request !== version.current) return;
      if (response.ok) { setResults(response.data); setSearched(true); }
      else setError(response.error);
    } catch { if (request === version.current) setError("Place search couldn’t connect. Try again, choose a point on the map, or use your location."); }
    finally { if (request === version.current) setLoading(false); }
  }

  return <div className="location-search">
    <div className={`chosen-location ${hasSelection ? "chosen" : ""}`}><span>{hasSelection ? <Check size={13} /> : null}<strong>{selectedLabel}</strong>{selectedAddress ? <small>{selectedAddress}</small> : null}</span>{hasSelection ? <button type="button" className="clear-location" onClick={() => { clearSearch(); onClear(); }} disabled={disabled} aria-label={`Clear ${label.toLowerCase()}`} title="Clear selected location"><X size={13} /></button> : null}</div>
    <form onSubmit={search} className="location-search-form"><label className="sr-only" htmlFor={inputId}>{label}: search a place or address</label><div className="search-input-wrap"><Search size={15} /><input id={inputId} type="search" autoComplete="off" placeholder="Search a place or address" value={query} maxLength={160} disabled={disabled} onChange={event => { version.current++; setQuery(event.target.value); setResults([]); setError(""); setSearched(false); setLoading(false); }} /><button type="button" onClick={clearSearch} disabled={disabled || !query} aria-label={`Clear ${label.toLowerCase()} search`}><X size={12} /></button></div><button type="submit" className="location-search-submit" disabled={disabled || loading || query.trim().replace(/\s+/g, " ").length < 3}>{loading ? "Searching…" : "Search"}</button></form>
    {loading ? <p className="search-status" role="status">Looking up places with Google Maps…</p> : null}
    {error ? <p className="search-error" role="alert">{error}</p> : null}
    {searched && !results.length ? <p className="search-status" role="status">No places found. Try adding a city or a more specific address.</p> : null}
    {results.length ? <div className="location-search-results"><ul aria-label={`${label} search results`}>{results.map(result => <li key={result.id}><button type="button" disabled={disabled} onClick={() => { clearSearch(); onSelect(result); }}><strong>{result.name}</strong><span>{result.address}</span></button>{result.attributions?.length ? <div className="search-attributions">{result.attributions.map((attribution, index) => attribution.uri && /^https?:\/\//.test(attribution.uri) ? <a key={`${index}:${attribution.displayName}`} href={attribution.uri} target="_blank" rel="noreferrer">{attribution.displayName}</a> : <span key={`${index}:${attribution.displayName}`}>{attribution.displayName}</span>)}</div> : null}</li>)}</ul><span className="google-text-attribution" translate="no">Google Maps</span></div> : null}
  </div>;
}
