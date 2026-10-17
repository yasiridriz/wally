"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { generateRoutes } from "@/app/actions/generate-routes";
import { getEventDetours } from "@/app/actions/get-events";
import { DEMO_DESTINATION, DEMO_START } from "@/lib/demo-data";
import { clampDuration } from "@/lib/duration";
import { DEFAULT_PREFERENCES, persistablePreferences, restorePreferences, type Preferences } from "@/lib/preferences";
import type { Coordinates, DetourOption, LocationSearchResult, Mood, RouteMode, WanderRoute } from "@/lib/types";

export type PlaceChoice = { coordinates: Coordinates; label: string; address?: string };
export type PickTarget = "start" | "destination";
export type GenerationError = { code: string; message: string };

const EDINBURGH_CENTER: Coordinates = { lat: 55.9533, lng: -3.1883 };
const CURRENT_LOCATION = "Your current location";
const DROPPED_PIN = "Dropped pin";

function locationError(error?: GeolocationPositionError): string {
  if (!error) return "This browser doesn’t share location. Type a starting place or pick one on the map.";
  if (error.code === error.PERMISSION_DENIED) return "Location access is off. Allow it in your browser settings, or type a starting place.";
  return "We couldn’t find your location. Type a starting place or pick one on the map.";
}

/** One planner state for the desktop panel and the phone layout. */
export function usePlanner(hasLiveSetup: boolean) {
  const [preferences, setPreferencesState] = useState<Preferences>({ ...DEFAULT_PREFERENCES, demo: !hasLiveSetup });
  const [start, setStartState] = useState<PlaceChoice | null>(null);
  const [destination, setDestinationState] = useState<PlaceChoice | null>(null);
  const [startText, setStartTextState] = useState("");
  const [destinationText, setDestinationTextState] = useState("");
  const [picking, setPicking] = useState<PickTarget | null>(null);
  const [mapCenter, setMapCenter] = useState<Coordinates>(EDINBURGH_CENTER);
  const [routes, setRoutes] = useState<WanderRoute[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [visited, setVisited] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<GenerationError | null>(null);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [detours, setDetours] = useState<DetourOption[]>([]);
  const [detourLoading, setDetourLoading] = useState(false);
  const [detourError, setDetourError] = useState("");
  const [preview, setPreview] = useState<DetourOption | null>(null);
  const [acceptedDetour, setAcceptedDetour] = useState<DetourOption | null>(null);
  const requestVersion = useRef(0);
  const detourVersion = useRef(0);
  // Increments on every start choice, so a late location result never overwrites it.
  const startVersion = useRef(0);

  /* Restore an optional browser-only external store after server hydration. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("wally:visited:v1") || "[]");
      if (Array.isArray(stored)) setVisited(stored.filter((id): id is string => typeof id === "string").slice(0, 500));
      setPreferencesState(restorePreferences(JSON.parse(localStorage.getItem("wally:preferences:v1") || "null"), hasLiveSetup));
    } catch { /* Browsers may block local storage. The walk still works. */ }
  }, [hasLiveSetup]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const demo = preferences.demo;
  const loop = preferences.shape === "loop";
  const effectiveStart = demo ? DEMO_START : start?.coordinates;
  const effectiveDestination = loop ? undefined : demo ? DEMO_DESTINATION : destination?.coordinates;
  // Finish elsewhere becomes Targeted with a destination and Explore without one.
  const mode: RouteMode = loop ? "loop" : effectiveDestination ? "destination" : "explore";
  const selected = routes.find(route => route.id === selectedId);
  const shownRoute = preview?.route || selected;
  const shownRoutes = preview && selected ? routes.map(route => route.id === selected.id ? preview.route : route) : routes;
  const tagCount = (preferences.mood !== "surprise" ? 1 : 0) + (preferences.includeEvents ? 1 : 0);

  function clearResults() {
    requestVersion.current++; detourVersion.current++;
    setLoading(false); setDetourLoading(false); setGenerated(false);
    setRoutes([]); setSelectedId(undefined); setDetours([]); setPreview(null); setAcceptedDetour(null);
    setError(null); setFormError(""); setMessage(""); setDetourError("");
  }

  function setPreferences(change: Partial<Preferences>) {
    const next = { ...preferences, ...change, duration: clampDuration(change.duration ?? preferences.duration) };
    clearResults();
    if (next.demo !== preferences.demo) { startVersion.current++; setLocating(false); setPicking(null); }
    setPreferencesState(next);
    try { localStorage.setItem("wally:preferences:v1", JSON.stringify(persistablePreferences(next))); } catch { /* Optional persistence. */ }
  }

  const setDuration = (duration: number) => setPreferences({ duration });
  const setShape = (shape: Preferences["shape"]) => setPreferences({ shape });
  // Moods are single-choice: tapping the selected mood returns to Surprise me.
  const toggleMood = (mood: Exclude<Mood, "surprise">) => setPreferences({ mood: preferences.mood === mood ? "surprise" : mood });
  const surpriseMe = () => setPreferences({ mood: "surprise" });
  const toggleEvents = () => setPreferences({ includeEvents: !preferences.includeEvents });
  const resetTags = () => setPreferences({ mood: "surprise", includeEvents: false });
  const toggleDemo = () => setPreferences({ demo: !demo });

  function chooseStart(choice: PlaceChoice | null) {
    startVersion.current++; setLocating(false); clearResults();
    setStartState(choice); setStartTextState(choice?.label ?? "");
  }
  function chooseDestination(choice: PlaceChoice | null) {
    clearResults(); setDestinationState(choice); setDestinationTextState(choice?.label ?? "");
  }
  /** Typing replaces a chosen place; generate then asks for a suggestion instead of guessing. */
  function setStartText(text: string) {
    setStartTextState(text);
    if (start) { startVersion.current++; clearResults(); setStartState(null); }
  }
  function setDestinationText(text: string) {
    setDestinationTextState(text);
    if (destination) { clearResults(); setDestinationState(null); }
  }
  const selectSearchResult = (target: PickTarget, result: LocationSearchResult) =>
    (target === "start" ? chooseStart : chooseDestination)({ coordinates: result.coordinates, label: result.name, address: result.address });

  function pickOnMap(target: PickTarget) { if (!demo) setPicking(current => current === target ? null : target); }
  /** Outside pick mode, map taps do nothing. */
  function dropPin(coordinates: Coordinates) {
    if (!picking || loading || demo) return;
    (picking === "start" ? chooseStart : chooseDestination)({ coordinates, label: DROPPED_PIN });
    setPicking(null);
  }

  function requestLocation(onFound: (coordinates: Coordinates) => void, onFail?: (message: string) => void) {
    const version = ++startVersion.current;
    if (!navigator.geolocation) { onFail?.(locationError()); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (version !== startVersion.current) return;
      const coordinates = { lat: position.coords.latitude, lng: position.coords.longitude };
      chooseStart({ coordinates, label: CURRENT_LOCATION });
      onFound(coordinates);
    }, failure => {
      if (version !== startVersion.current) return;
      setLocating(false);
      onFail?.(locationError(failure));
    }, { timeout: 12000, maximumAge: 60000 });
  }
  function locateMe() {
    if (demo || loading) return;
    setFormError("");
    requestLocation(() => undefined, setFormError);
  }

  async function run(startPoint: Coordinates, onStart?: () => void, onFail?: () => void) {
    clearResults();
    const version = requestVersion.current;
    setLoading(true); setGenerated(true); onStart?.();
    try {
      const result = await generateRoutes({
        duration: preferences.duration, mood: preferences.mood, mode, includeEvents: preferences.includeEvents, demo,
        start: startPoint, ...(mode === "destination" ? { destination: effectiveDestination } : {}), visitedIds: visited,
      });
      if (version !== requestVersion.current) return;
      if (result.ok) {
        setRoutes(result.data.routes); setSelectedId(result.data.routes[0]?.id); setMessage(result.data.message || "");
        if (!result.data.routes.length) onFail?.();
      } else { setError({ code: result.code, message: result.error }); onFail?.(); }
    } catch {
      if (version !== requestVersion.current) return;
      setError({ code: "NETWORK", message: "We couldn’t reach the route service. Try again, or take a sample wander in Demo Mode." });
      onFail?.();
    } finally { if (version === requestVersion.current) setLoading(false); }
  }

  /** One tap with the defaults works: without a start, the current location is requested first. */
  function generate(onStart?: () => void, onFail?: () => void) {
    if (loading || locating) return;
    setFormError(""); setPicking(null);
    if (!demo && startText.trim() && !start) { setFormError("Choose a starting place from the suggestions, or clear the field to use your location."); onFail?.(); return; }
    if (!demo && !loop && destinationText.trim() && !destination) { setFormError("Choose a destination from the suggestions, or clear the field to finish anywhere."); onFail?.(); return; }
    if (effectiveStart) { void run(effectiveStart, onStart, onFail); return; }
    requestLocation(coordinates => void run(coordinates, onStart, onFail), message => { setFormError(message); onFail?.(); });
  }

  function selectRoute(id: string) {
    if (id === selectedId) return;
    detourVersion.current++; setDetourLoading(false);
    setSelectedId(id); setDetours([]); setPreview(null); setAcceptedDetour(null); setDetourError("");
  }
  function visit(id: string) {
    const next = visited.includes(id) ? visited.filter(value => value !== id) : [...visited, id].slice(-500);
    setVisited(next);
    try { localStorage.setItem("wally:visited:v1", JSON.stringify(next)); } catch { /* Optional persistence. */ }
  }
  async function findDetours() {
    if (!selected || detourLoading) return;
    const version = ++detourVersion.current;
    setDetourLoading(true); setDetourError(""); setDetours([]);
    try {
      const result = await getEventDetours({ routeId: selected.id });
      if (version !== detourVersion.current) return;
      if (result.ok) {
        setDetours(result.data);
        if (!result.data.length) setDetourError(selected.source === "demo" ? "No predefined sample event detours are configured for this demo walk. Switch to Live Mode to check real walking detours to fictional example events." : "No sample event detours fit this walk and its remaining time. Try a longer walk.");
      } else setDetourError(result.error);
    } catch { if (version === detourVersion.current) setDetourError("Couldn’t check detours just now. Your original walk is still ready."); }
    finally { if (version === detourVersion.current) setDetourLoading(false); }
  }
  function acceptDetour() {
    if (!preview || !selected) return;
    setRoutes(current => current.map(route => route.id === selected.id ? preview.route : route));
    setSelectedId(preview.route.id); setAcceptedDetour(preview); setPreview(null); setDetours([]);
  }

  return {
    hasLiveSetup, preferences, demo, loop, mode, tagCount,
    setDuration, setShape, toggleMood, surpriseMe, toggleEvents, resetTags, toggleDemo,
    start, destination, startText, destinationText, setStartText, setDestinationText, chooseStart, chooseDestination, selectSearchResult,
    effectiveStart, effectiveDestination, searchBias: effectiveStart ?? mapCenter, setMapCenter,
    picking, pickOnMap, cancelPicking: () => setPicking(null), dropPin, locateMe, locating,
    routes, shownRoutes, selected, shownRoute, selectRoute, visited, visit,
    loading, generated, error, formError, message, generate,
    detours, detourLoading, detourError, preview, setPreview, acceptedDetour, findDetours, acceptDetour,
  };
}

export type Planner = ReturnType<typeof usePlanner>;

const desktopQuery = "(min-width: 1024px)";
/** The phone layout renders on the server; the desktop layout takes over after hydration. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    notify => { const query = window.matchMedia(desktopQuery); query.addEventListener("change", notify); return () => query.removeEventListener("change", notify); },
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
}
