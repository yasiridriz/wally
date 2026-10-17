"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Compass, Footprints, Info, Leaf, MapPin, Navigation, Route, Sparkles, X } from "lucide-react";
import { generateRoutes } from "@/app/actions/generate-routes";
import { getEventDetours } from "@/app/actions/get-events";
import { DEMO_START } from "@/lib/demo-data";
import type { Coordinates, DetourOption, WanderRoute } from "@/lib/types";
import RouteControls, { type Preferences } from "./route-controls";
import RouteResults from "./route-results";
import EventDetour from "./event-detour";

const WanderMap = dynamic(() => import("./map/wander-map"), { ssr: false, loading: () => <div className="map-loading"><Compass size={35} /><span>Unfolding the map…</span></div> });
const defaultPreferences: Preferences = { duration: 30, mood: "surprise", mode: "loop", includeEvents: false, demo: false };

export default function WallyApp({ hasRoutingKey }: { hasRoutingKey: boolean }) {
  const [preferences, setPreferences] = useState<Preferences>({ ...defaultPreferences, demo: !hasRoutingKey });
  const [start, setStart] = useState<Coordinates>(DEMO_START);
  const [routes, setRoutes] = useState<WanderRoute[]>([]);
  const [selected, setSelected] = useState<WanderRoute>();
  const [visited, setVisited] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [detours, setDetours] = useState<DetourOption[]>([]);
  const [detourLoading, setDetourLoading] = useState(false);
  const [detourError, setDetourError] = useState("");
  const [preview, setPreview] = useState<DetourOption | null>(null);
  const [acceptedDetour, setAcceptedDetour] = useState<DetourOption | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(true);
  const requestVersion = useRef(0);
  const detourVersion = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  /* Restore an optional browser-only external store after server hydration. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("wally:visited:v1") || "[]");
      if (Array.isArray(stored)) setVisited(stored.filter((id): id is string => typeof id === "string").slice(0, 500));
      const settings = JSON.parse(localStorage.getItem("wally:preferences:v1") || "null");
      if (settings && [15, 30, 45, 60, 90].includes(settings.duration) && ["surprise", "scenic", "green", "historic", "hidden"].includes(settings.mood) && ["loop", "explore"].includes(settings.mode)) setPreferences({ duration: settings.duration, mood: settings.mood, mode: settings.mode, includeEvents: settings.includeEvents === true, demo: !hasRoutingKey || settings.demo === true });
    } catch { /* Browsers may block local storage. The walk still works. */ }
  }, [hasRoutingKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function clearResults() { requestVersion.current++; detourVersion.current++; setDetourLoading(false); setRoutes([]); setSelected(undefined); setDetours([]); setPreview(null); setAcceptedDetour(null); setError(""); setMessage(""); setDetourError(""); }
  function changePreferences(value: Preferences) {
    clearResults(); setPreferences(value);
    if (value.demo) setStart(DEMO_START);
    try { localStorage.setItem("wally:preferences:v1", JSON.stringify(value)); } catch { /* Optional persistence. */ }
  }
  function changeStart(value: Coordinates) { if (loading || preferences.demo) return; clearResults(); setStart(value); }
  function visit(id: string) { const next = visited.includes(id) ? visited.filter(value => value !== id) : [...visited, id].slice(-500); setVisited(next); try { localStorage.setItem("wally:visited:v1", JSON.stringify(next)); } catch { /* Optional persistence. */ } }
  async function generate() {
    if (loading) return;
    clearResults(); const version = requestVersion.current; setLoading(true); setMobileExpanded(true);
    try {
      const result = await generateRoutes({ ...preferences, start: preferences.demo ? DEMO_START : start, visitedIds: visited });
      if (version !== requestVersion.current) return;
      if (result.ok) { setRoutes(result.data.routes); setSelected(result.data.routes[0]); setMessage(result.data.message || ""); setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100); }
      else setError(result.error);
    } catch { setError("We couldn’t reach the route service. Try again, or take a sample wander in Demo Mode."); }
    finally { setLoading(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setError("Your browser doesn’t support location. Tap the map to choose a start."); return; }
    const version = requestVersion.current; setLocating(true); navigator.geolocation.getCurrentPosition(position => { if (version !== requestVersion.current) { setLocating(false); return; } changeStart({ lat: position.coords.latitude, lng: position.coords.longitude }); setLocating(false); }, () => { setLocating(false); setError("We couldn’t find your location. Allow location access or tap the map to choose a start."); }, { timeout: 12000, maximumAge: 60000 });
  }
  function selectRoute(route: WanderRoute) { detourVersion.current++; setDetourLoading(false); setSelected(route); setDetours([]); setPreview(null); setAcceptedDetour(null); setDetourError(""); }
  async function findDetours() {
    if (!selected || detourLoading) return;
    const routeId = selected.id; const version = ++detourVersion.current; setDetourLoading(true); setDetourError(""); setDetours([]);
    try { const result = await getEventDetours({ routeId }); if (version !== detourVersion.current) return; if (result.ok) { setDetours(result.data); if (!result.data.length) setDetourError(selected.source === "demo" ? "No predefined sample event detours are configured for this demo walk. Switch to Live Mode to check real walking detours to fictional example events." : "No sample event detours fit this walk and its remaining time. Try a longer walk."); } else setDetourError(result.error); }
    catch { if (version === detourVersion.current) setDetourError("Couldn’t check detours just now. Your original walk is still ready."); }
    finally { if (version === detourVersion.current) setDetourLoading(false); }
  }
  function acceptDetour() { if (!preview) return; setRoutes(current => current.map(route => route.id === selected?.id ? preview.route : route)); setSelected(preview.route); setAcceptedDetour(preview); setPreview(null); setDetours([]); }
  const shownRoute = preview?.route || selected;
  const shownRoutes = preview && selected ? routes.map(route => route.id === selected.id ? preview.route : route) : routes;
  const locationLabel = preferences.demo || (Math.abs(start.lat - DEMO_START.lat) < .0001 && Math.abs(start.lng - DEMO_START.lng) < .0001) ? "Edinburgh, Scotland" : `${start.lat.toFixed(4)}°, ${start.lng.toFixed(4)}°`;

  return <main className="wally-shell">
    <div className="map-stage"><WanderMap start={start} routes={shownRoutes} selected={shownRoute} onStartChange={changeStart} canSetStart={!loading && !preferences.demo} event={preview?.event || selected?.event} /></div>
    <header className="app-header"><Link className="wordmark" href="/" aria-label="Wally home"><span className="brand-icon"><Route size={25} strokeWidth={2.1} /></span>wally<span className="brand-period">.</span></Link><span className="brand-tagline">Take the scenic route to nowhere.</span><div className="header-right"><span className="edinburgh-pill"><MapPin size={14} />{preferences.demo ? "EDINBURGH EDITION" : "A WALK LESS ORDINARY"}</span><a className="about-link" href="https://www.openstreetmap.org/about" target="_blank" rel="noreferrer">Made for wandering <ArrowUpRight size={14} /></a></div></header>
    <aside className={`adventure-panel ${mobileExpanded ? "expanded" : "collapsed"}`} aria-label="Plan your walk"><button className="sheet-handle" onClick={() => setMobileExpanded(value => !value)} aria-expanded={mobileExpanded} aria-label={mobileExpanded ? "Collapse walk planner" : "Expand walk planner"}><span /><strong>{mobileExpanded ? "Your next little adventure" : `${routes.length ? "Your walks are ready" : "Find your next wander"}`}</strong><ArrowDown size={15} /></button><div className="panel-scroll">
      <RouteControls preferences={preferences} onChange={changePreferences} onGenerate={generate} onLocate={locate} locating={locating} loading={loading} locationLabel={locationLabel} />
      {preferences.demo ? <div className="sample-notice"><Info size={16} /><p><strong>A little taste of Wally.</strong> Demo Mode uses sample Edinburgh paths and estimated times, unverified for navigation.{!hasRoutingKey ? " Live routing needs an OpenRouteService API key." : " Switch Demo Mode off for live walking routes."}</p></div> : null}
      {error ? <div className="error-notice" role="alert"><p>{error}</p>{!preferences.demo ? <button className="text-button" onClick={() => changePreferences({ ...preferences, demo: true })}>Try Edinburgh Demo Mode <ArrowUpRight size={14} /></button> : null}<button className="dismiss-error" onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div> : null}
      {message ? <p className="generation-message" role="status">{message}</p> : null}
      <div ref={resultsRef}><RouteResults routes={routes} selected={selected} onSelect={selectRoute} visited={visited} onVisit={visit} onRegenerate={generate} loading={loading} /></div>
      {preferences.includeEvents && selected && !selected.event ? <EventDetour options={detours} loading={detourLoading} error={detourError} onFind={findDetours} preview={preview} onPreview={setPreview} onAccept={acceptDetour} onCancel={() => setPreview(null)} /> : null}
      {acceptedDetour ? <p className="generation-message">Sample detour added: {acceptedDetour.event.name}. Total estimate includes the visit.</p> : null}
    </div></aside>
    {!routes.length && !loading ? <div className="map-welcome"><span className="welcome-icon"><Leaf size={20} /></span><div><strong>The best way home<br />might be the long way.</strong><p>Find a new favourite corner.</p></div><Sparkles className="welcome-spark" size={23} /></div> : null}
    <div className="map-caption"><span className="status-dot" />{preview ? "PREVIEWING YOUR SAMPLE EVENT DETOUR" : selected ? selected.source === "demo" ? "SAMPLE WALK · ESTIMATED, UNVERIFIED PATH" : "YOUR WALK, YOUR PACE" : preferences.demo ? "SAMPLE WALKS · REAL CURIOSITY" : "TAP THE MAP TO PICK YOUR START"}</div>
    <button className="map-location-button" onClick={locate} disabled={locating || preferences.demo || loading} aria-label="Find my location"><Navigation size={20} /></button>
    <div className="map-bottom-note"><Footprints size={14} /> A little less A to B. A little more let’s see.</div>
  </main>;
}
