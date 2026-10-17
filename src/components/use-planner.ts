"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { generateRoutes } from "@/app/actions/generate-routes";
import { getEventDetours } from "@/app/actions/get-events";
import { submitReview } from "@/app/actions/submit-review";
import { HISTORY_LIMIT, favouritePlaces, memoryHints, restoreHistory, summarizePlace, type HistoryEntry } from "@/lib/memory";
import { DEMO_DESTINATION, DEMO_START } from "@/lib/demo-data";
import { clampDuration } from "@/lib/duration";
import { DEFAULT_PREFERENCES, normalizeMoods, persistablePreferences, restorePreferences, type Preferences } from "@/lib/preferences";
import type { Coordinates, DetourOption, LocationSearchResult, MoodTag, RouteMode, WanderRoute } from "@/lib/types";

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
  // Path history: routes the user opened, with their reviews. Browser-only.
  const [history, setHistory] = useState<HistoryEntry[]>([]);
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
      setHistory(restoreHistory(JSON.parse(localStorage.getItem("wally:history:v1") || "[]")));
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
  const tagCount = preferences.moods.length + (preferences.includeEvents ? 1 : 0) + (preferences.favourites ? 1 : 0);
  const favouriteCount = history.filter(entry => entry.favourite).length;

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
  // Moods combine freely; clearing every one returns to Surprise me.
  const toggleMood = (mood: MoodTag) => setPreferences({ moods: preferences.moods.includes(mood) ? preferences.moods.filter(value => value !== mood) : normalizeMoods([...preferences.moods, mood]) });
  const surpriseMe = () => setPreferences({ moods: [] });
  const toggleEvents = () => setPreferences({ includeEvents: !preferences.includeEvents });
  const toggleFavourites = () => setPreferences({ favourites: !preferences.favourites });
  const resetTags = () => setPreferences({ moods: [], includeEvents: false, favourites: false });
  const toggleDemo = () => setPreferences({ demo: !demo });
  // Running plans travel 2.25x faster, so the same time budget reaches further.
  const togglePace = () => setPreferences({ pace: preferences.pace === "run" ? "walk" : "run" });

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
        duration: preferences.duration, moods: preferences.moods, mode, pace: preferences.pace, includeEvents: preferences.includeEvents, demo,
        memory: memoryHints(history), favourites: preferences.favourites, ...(preferences.favourites ? { favouritePlaces: favouritePlaces(history) } : {}),
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

  function saveHistory(next: HistoryEntry[]) {
    setHistory(next);
    try { localStorage.setItem("wally:history:v1", JSON.stringify(next)); } catch { /* Optional persistence. */ }
  }
  const sameStops = (entry: HistoryEntry, route: WanderRoute) => entry.mode === mode && entry.stops.length === route.stops.length && entry.stops.every((stop, index) => stop.id === route.stops[index].id);
  /** A clicked route joins the top of history. Opening the same stops again refreshes that entry and keeps its review. */
  function remember(route: WanderRoute): HistoryEntry {
    const existing = history.find(entry => sameStops(entry, route));
    const entry: HistoryEntry = {
      id: existing?.id ?? crypto.randomUUID(), routeId: route.id, name: route.name, stops: route.stops.map(summarizePlace),
      mode, pace: route.pace ?? preferences.pace, moods: preferences.moods, duration: preferences.duration,
      totalMinutes: route.totalMinutes, distanceMeters: route.distanceMeters, source: route.source, selectedAt: new Date().toISOString(),
      favourite: existing?.favourite ?? false, ...(existing?.rating ? { rating: existing.rating } : {}),
    };
    saveHistory([entry, ...history.filter(other => other.id !== entry.id)].slice(0, HISTORY_LIMIT));
    return entry;
  }
  type Review = { rating?: number; favourite?: boolean; clearRating?: boolean };
  /** Applies a review to an entry. Live reviews go to the server for future ranking; demo routes stay local. */
  function review(entry: HistoryEntry, change: Review, base = history) {
    const { rating, ...rest } = entry;
    const next: HistoryEntry = { ...rest, favourite: change.favourite ?? entry.favourite,
      ...(change.clearRating ? {} : change.rating ?? rating ? { rating: change.rating ?? rating } : {}) };
    saveHistory(base.some(value => value.id === next.id) ? base.map(value => value.id === next.id ? next : value) : [next, ...base].slice(0, HISTORY_LIMIT));
    if (next.source !== "live" || (!next.rating && !next.favourite)) return;
    void submitReview({ reviewId: next.id, rating: next.rating ?? null, favourite: next.favourite, routeName: next.name, mode: next.mode, pace: next.pace,
      moods: next.moods, duration: next.duration, totalMinutes: next.totalMinutes, distanceMeters: next.distanceMeters, stops: next.stops }).catch(() => undefined);
  }
  /** Tapping the current star again clears the rating. */
  const ratingChange = (entry: HistoryEntry | undefined, rating: number): Review => entry?.rating === rating ? { clearRating: true } : { rating };
  function rateHistory(id: string, rating: number) {
    const entry = history.find(value => value.id === id);
    if (entry) review(entry, ratingChange(entry, rating));
  }
  function toggleHistoryFavourite(id: string) {
    const entry = history.find(value => value.id === id);
    if (entry) review(entry, { favourite: !entry.favourite });
  }
  /** Reviews a route on screen, adding it to history first if it was never clicked. */
  function reviewRoute(route: WanderRoute, change: { rating?: number; favourite?: boolean }) {
    if (!route.stops.length || route.overBudget) return;
    const existing = history.find(entry => sameStops(entry, route));
    const entry = existing ?? remember(route);
    const base = existing ? history : [entry, ...history];
    review(entry, change.rating !== undefined ? ratingChange(existing, change.rating) : { favourite: change.favourite }, base);
  }
  const removeHistory = (id: string) => saveHistory(history.filter(entry => entry.id !== id));
  const clearHistory = () => saveHistory([]);
  /** The history entry for a route on screen, if it was opened. */
  const historyFor = (route: WanderRoute) => history.find(entry => sameStops(entry, route));

  function selectRoute(id: string) {
    const route = routes.find(value => value.id === id);
    // Every click counts, including the route that was preselected. A direct
    // over-budget route has no stops to remember.
    if (route && !preview && route.stops.length && !route.overBudget) remember(route);
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
    setDuration, setShape, toggleMood, surpriseMe, toggleEvents, toggleFavourites, resetTags, toggleDemo, togglePace,
    history, favouriteCount, historyFor, reviewRoute, rateHistory, toggleHistoryFavourite, removeHistory, clearHistory,
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
