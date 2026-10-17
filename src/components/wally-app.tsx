"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Compass, Footprints, Info, Leaf, MapPin, Navigation, Route, Sparkles, X } from "lucide-react";
import { generateRoutes } from "@/app/actions/generate-routes";
import { getEventDetours } from "@/app/actions/get-events";
import { DEMO_START, DEMO_DESTINATION } from "@/lib/demo-data";
import type { Coordinates, DetourOption, LocationSearchResult, WanderRoute } from "@/lib/types";
import { DEFAULT_PREFERENCES, persistablePreferences, restorePreferences } from "@/lib/preferences";
import RouteControls, { type Preferences } from "./route-controls";
import RouteResults from "./route-results";
import EventDetour from "./event-detour";

const WanderMap = dynamic(() => import("./map/wander-map"), { ssr: false, loading: () => <div className="map-loading"><Compass size={35} /><span>Unfolding the map…</span></div> });
const EDINBURGH_CENTER: Coordinates = { lat: 55.9533, lng: -3.1883 };

export default function WallyApp({ hasRoutingKey }: { hasRoutingKey: boolean }) {
  const hasLiveSetup = hasRoutingKey && Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const [preferences, setPreferences] = useState<Preferences>({ ...DEFAULT_PREFERENCES, demo: !hasLiveSetup });
  const [start, setStart] = useState<Coordinates>(EDINBURGH_CENTER);
  const [startSelected, setStartSelected] = useState(false);
  const [startName, setStartName] = useState("");
  const [startAddress, setStartAddress] = useState("");
  const [destinationName, setDestinationName] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destination, setDestination] = useState<Coordinates | undefined>();
  const effectiveDestination = preferences.demo ? DEMO_DESTINATION : destination;
  const effectiveStart = preferences.demo ? DEMO_START : start;
  const effectiveStartSelected = preferences.demo || startSelected;
  const [pickingTarget, setPickingTarget] = useState<"start" | "destination">("start");
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
  const autoLocationRequested = useRef(false);
  const startSelectionVersion = useRef(0);
  const mounted = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const receiveAutomaticLocation = useEffectEvent((coordinates: Coordinates, version: number) => {
    if (!mounted.current || version !== startSelectionVersion.current) return;
    setLocating(false);
    if (preferences.demo || startSelected) return;
    changeStart(coordinates, "Your current location");
  });
  const failAutomaticLocation = useEffectEvent((version: number, supported: boolean) => {
    if (!mounted.current || version !== startSelectionVersion.current) return;
    setLocating(false);
    if (preferences.demo || startSelected) return;
    setError(supported ? "We couldn’t use your current location. Search for a starting place, pick one on the map, or allow location access and try the location button." : "This browser doesn’t support location. Search for a starting place or choose one on the map.");
  });
  useEffect(() => {
    if (!hasLiveSetup || preferences.demo || autoLocationRequested.current) return;
    autoLocationRequested.current = true;
    const version = startSelectionVersion.current;
    if (!navigator.geolocation) { failAutomaticLocation(version, false); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => receiveAutomaticLocation({ lat: position.coords.latitude, lng: position.coords.longitude }, version), () => failAutomaticLocation(version, true), { timeout: 12000, maximumAge: 60000 });
  }, [hasLiveSetup, preferences.demo]);

  /* Restore an optional browser-only external store after server hydration. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("wally:visited:v1") || "[]");
      if (Array.isArray(stored)) setVisited(stored.filter((id): id is string => typeof id === "string").slice(0, 500));
      const settings = JSON.parse(localStorage.getItem("wally:preferences:v1") || "null");
      setPreferences(restorePreferences(settings, hasLiveSetup));
    } catch { /* Browsers may block local storage. The walk still works. */ }
  }, [hasLiveSetup]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function clearResults() { requestVersion.current++; detourVersion.current++; setDetourLoading(false); setRoutes([]); setSelected(undefined); setDetours([]); setPreview(null); setAcceptedDetour(null); setError(""); setMessage(""); setDetourError(""); }
  function changePreferences(value: Preferences) {
    clearResults(); setPreferences(value);
    if (value.demo && !preferences.demo) { startSelectionVersion.current++; setLocating(false); }
    if (value.mode !== "destination") setPickingTarget("start"); else if (preferences.mode !== "destination") setPickingTarget(startSelected ? "destination" : "start");
    try { localStorage.setItem("wally:preferences:v1", JSON.stringify(persistablePreferences(value))); } catch { /* Optional persistence. */ }
  }
  function revealPlanner() { if (window.innerWidth < 768) setMobileExpanded(true); }
  function coordinateLabel(value: Coordinates) { return `${value.lat.toFixed(4)}°, ${value.lng.toFixed(4)}°`; }
  function changeMapLocation(value: Coordinates) {
    if (loading || preferences.demo) return;
    if (pickingTarget === "destination" && preferences.mode === "destination") { clearResults(); setDestination(value); setDestinationName(coordinateLabel(value)); setDestinationAddress(""); }
    else changeStart(value, coordinateLabel(value));
    revealPlanner();
  }
  function changeStart(value: Coordinates, name: string, address = "") {
    if (loading || preferences.demo) return;
    startSelectionVersion.current++; setLocating(false);
    clearResults(); setStart(value); setStartSelected(true); setStartName(name); setStartAddress(address);
    if (preferences.mode === "destination" && !destination) setPickingTarget("destination");
  }
  function chooseSearchLocation(target: "start" | "destination", result: LocationSearchResult) {
    if (loading || preferences.demo) return;
    if (target === "start") changeStart(result.coordinates, result.name, result.address);
    else { clearResults(); setDestination(result.coordinates); setDestinationName(result.name); setDestinationAddress(result.address); }
  }
  function clearLocation(target: "start" | "destination") {
    clearResults();
    if (target === "start") { startSelectionVersion.current++; setLocating(false); setStartSelected(false); setStartName(""); setStartAddress(""); setPickingTarget("start"); }
    else { setDestination(undefined); setDestinationName(""); setDestinationAddress(""); setPickingTarget("destination"); }
  }
  function visit(id: string) { const next = visited.includes(id) ? visited.filter(value => value !== id) : [...visited, id].slice(-500); setVisited(next); try { localStorage.setItem("wally:visited:v1", JSON.stringify(next)); } catch { /* Optional persistence. */ } }
  async function generate() {
    if (loading || !effectiveStartSelected || (preferences.mode === "destination" && !effectiveDestination)) return;
    clearResults(); const version = requestVersion.current; setLoading(true); setMobileExpanded(true);
    try {
      const result = await generateRoutes({ ...preferences, start: effectiveStart, ...(preferences.mode === "destination" ? { destination: effectiveDestination } : {}), visitedIds: visited });
      if (version !== requestVersion.current) return;
      if (result.ok) { setRoutes(result.data.routes); setSelected(result.data.routes[0]); setMessage(result.data.message || ""); setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100); }
      else setError(result.error);
    } catch { setError("We couldn’t reach the route service. Try again, or take a sample wander in Demo Mode."); }
    finally { setLoading(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setError("Your browser doesn’t support location. Tap the map to choose a start."); return; }
    const version = ++startSelectionVersion.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (!mounted.current || version !== startSelectionVersion.current) return;
      changeStart({ lat: position.coords.latitude, lng: position.coords.longitude }, "Your current location");
    }, () => {
      if (!mounted.current || version !== startSelectionVersion.current) return;
      setLocating(false); setError("We couldn’t find your location. Allow location access, search for a place, or tap the map to choose a start.");
    }, { timeout: 12000, maximumAge: 60000 });
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
  const locationLabel = preferences.demo ? "Edinburgh · sample starting point" : startSelected ? startName || coordinateLabel(start) : locating ? "Finding your current location…" : "Choose a starting point";
  const destinationLabel = preferences.demo ? "National Museum of Scotland · sample" : destination ? destinationName || coordinateLabel(destination) : "Choose your destination";
  const startSearchKey = `${start.lat},${start.lng}:${startSelected}`;
  const destinationSearchKey = `${destination?.lat},${destination?.lng}`;

  return <main className={`wally-shell ${mobileExpanded ? "planner-expanded" : "planner-collapsed"}`}>
    <div className="map-stage"><WanderMap start={effectiveStart} hasStart={effectiveStartSelected} routes={shownRoutes} selected={shownRoute} destination={preferences.mode === "destination" ? effectiveDestination : undefined} onStartChange={changeMapLocation} canSetStart={!loading && !preferences.demo} event={preview?.event || selected?.event} /></div>
    <header className="app-header"><Link className="wordmark" href="/" aria-label="Wally home"><span className="brand-icon"><Route size={25} strokeWidth={2.1} /></span>wally<span className="brand-period">.</span></Link><span className="brand-tagline">Take the scenic route to nowhere.</span><div className="header-right"><span className="edinburgh-pill"><MapPin size={14} />{preferences.demo ? "EDINBURGH EDITION" : "A WALK LESS ORDINARY"}</span><a className="about-link" href="https://www.google.com/maps/about/" target="_blank" rel="noreferrer">Made for wandering <ArrowUpRight size={14} /></a></div></header>
    <aside className={`adventure-panel ${mobileExpanded ? "expanded" : "collapsed"}`} aria-label="Plan your walk"><button className="sheet-handle" onClick={() => setMobileExpanded(value => !value)} aria-expanded={mobileExpanded} aria-label={mobileExpanded ? "Collapse walk planner" : "Expand walk planner"}><span /><strong>{mobileExpanded ? "Your next little adventure" : `${routes.length ? "Your walks are ready" : "Find your next wander"}`}</strong><ArrowDown size={15} /></button><div className="panel-scroll">
      <RouteControls preferences={preferences} onChange={changePreferences} onGenerate={generate} onLocate={locate} locating={locating} loading={loading} locationLabel={locationLabel} destinationLabel={destinationLabel} pickingTarget={pickingTarget} onPickTarget={target => { setPickingTarget(target); if (window.innerWidth < 768) setMobileExpanded(false); }} hasDestination={Boolean(effectiveDestination)} hasStart={effectiveStartSelected} startAddress={startAddress} destinationAddress={destinationAddress} near={start} startSearchKey={startSearchKey} destinationSearchKey={destinationSearchKey} onSearchSelect={chooseSearchLocation} onClearLocation={clearLocation} />
      {preferences.demo ? <div className="sample-notice"><Info size={16} /><p><strong>A little taste of Wally.</strong> Demo Mode uses sample Edinburgh paths and estimated times, unverified for navigation.{!hasLiveSetup ? " Live maps and walking routes need Google Maps browser and server API keys." : " Switch Demo Mode off for live Google Maps walking routes."}</p></div> : null}
      {error ? <div className="error-notice" role="alert"><p>{error}</p>{!preferences.demo ? <button className="text-button" onClick={() => changePreferences({ ...preferences, demo: true })}>Try Edinburgh Demo Mode <ArrowUpRight size={14} /></button> : null}<button className="dismiss-error" onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div> : null}
      {message ? <p className="generation-message" role="status">{message}</p> : null}
      <div ref={resultsRef}><RouteResults routes={routes} selected={selected} onSelect={selectRoute} visited={visited} onVisit={visit} onRegenerate={generate} loading={loading} /></div>
      {preferences.includeEvents && selected && !selected.event ? <EventDetour options={detours} loading={detourLoading} error={detourError} onFind={findDetours} preview={preview} onPreview={setPreview} onAccept={acceptDetour} onCancel={() => setPreview(null)} /> : null}
      {acceptedDetour ? <p className="generation-message">Sample detour added: {acceptedDetour.event.name}. Total estimate includes the visit.</p> : null}
    </div></aside>
    {!routes.length && !loading ? <div className="map-welcome"><span className="welcome-icon"><Leaf size={20} /></span><div><strong>The best way home<br />might be the long way.</strong><p>Find a new favourite corner.</p></div><Sparkles className="welcome-spark" size={23} /></div> : null}
    <div className="map-caption"><span className="status-dot" />{preview ? "PREVIEWING YOUR SAMPLE EVENT DETOUR" : selected ? selected.source === "demo" ? "SAMPLE WALK · ESTIMATED, UNVERIFIED PATH" : "YOUR WALK, YOUR PACE" : preferences.demo ? "SAMPLE WALKS · REAL CURIOSITY" : pickingTarget === "destination" && preferences.mode === "destination" ? "TAP THE MAP TO PICK YOUR DESTINATION" : "TAP THE MAP TO PICK YOUR START"}</div>
    <button className="map-location-button" onClick={locate} disabled={locating || preferences.demo || loading} aria-label="Find my location"><Navigation size={20} /></button>
    <div className="map-bottom-note"><Footprints size={14} /> A little less A to B. A little more let’s see.</div>
  </main>;
}
