"use client";

import { useEffect, useRef, useState } from "react";
import { Compass, Info, Minus, Plus, X } from "lucide-react";
import type { Coordinates, Event, WanderRoute } from "@/lib/types";
import { routeColor } from "../route-card";
import type { PickTarget } from "../use-planner";
import { loadGoogleMaps } from "./google-maps-loader";
import SampleRoutePreview from "./sample-route-preview";

type Props = {
  initialCenter: Coordinates; start?: Coordinates; startLabel?: string; destination?: Coordinates;
  routes: WanderRoute[]; selected?: WanderRoute; event?: Event; compact: boolean; layoutKey: string;
  picking: PickTarget | null; onPick: (coordinates: Coordinates) => void; onCancelPick: () => void;
  onSelectRoute: (id: string) => void; onCenterChange: (coordinates: Coordinates) => void;
};
const SURFACE = "#fffdf8";
const FLAG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22V3m0 0c6-5 10 5 16 0v11c-6 5-10-5-16 0"/></svg>';

function cssPixels(name: string): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
}

/** Sample routes are dotted; live routes are solid. */
function lineOptions(route: WanderRoute, color: string, weight: number, opacity: number): google.maps.PolylineOptions {
  if (route.source !== "demo") return { strokeColor: color, strokeWeight: weight, strokeOpacity: opacity };
  return { strokeOpacity: 0, icons: [{ icon: { path: google.maps.SymbolPath.CIRCLE, scale: weight / 2.2, fillColor: color, fillOpacity: opacity, strokeOpacity: 0 }, offset: "0", repeat: `${weight * 2.4}px` }] };
}

export default function WanderMap(props: Props) {
  const { picking, onPick, onCenterChange } = props;
  const container = useRef<HTMLDivElement>(null);
  const initialCenter = useRef(props.initialCenter);
  const map = useRef<google.maps.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const hasBrowserKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  useEffect(() => {
    if (!hasBrowserKey) return;
    let cancelled = false;
    const handleAuthError = (event: globalThis.Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener("wally:maps-auth-error", handleAuthError);
    loadGoogleMaps().then(maps => {
      if (cancelled || !container.current) return;
      map.current = new maps.Map(container.current, {
        center: initialCenter.current, zoom: 14,
        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
        disableDefaultUI: true, clickableIcons: false, gestureHandling: "greedy",
      });
      setReady(true);
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Google Maps couldn’t load. Refresh to try again."); });
    return () => { cancelled = true; window.removeEventListener("wally:maps-auth-error", handleAuthError); if (map.current) google.maps.event.clearInstanceListeners(map.current); map.current = null; };
  }, [hasBrowserKey]);

  // Map taps only drop a pin in pick mode; the cursor shows it.
  useEffect(() => {
    if (!ready || !map.current) return;
    const currentMap = map.current;
    currentMap.setOptions({ draggableCursor: picking ? "crosshair" : null });
    const click = currentMap.addListener("click", (event: google.maps.MapMouseEvent) => { if (picking && event.latLng) onPick(event.latLng.toJSON()); });
    const idle = currentMap.addListener("idle", () => { const center = currentMap.getCenter(); if (center) onCenterChange(center.toJSON()); });
    return () => { click.remove(); idle.remove(); };
  }, [ready, picking, onPick, onCenterChange]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const currentMap = map.current;
    const lines: google.maps.Polyline[] = [];
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    const selectedIndex = props.routes.findIndex(route => route.id === props.selected?.id);
    props.routes.forEach((route, index) => {
      if (index === selectedIndex) return;
      const line = new google.maps.Polyline({ map: currentMap, path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), zIndex: 1, clickable: true, ...lineOptions(route, routeColor(index), 3, .4) });
      line.addListener("click", () => props.onSelectRoute(route.id));
      lines.push(line);
    });
    const selected = props.selected;
    const color = routeColor(Math.max(0, selectedIndex));
    if (selected) {
      const path = selected.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
      // A light outline under the selected line keeps it readable on any base map.
      lines.push(new google.maps.Polyline({ map: currentMap, path, zIndex: 3, clickable: false, ...lineOptions(selected, SURFACE, selected.source === "demo" ? 8 : 9, .95) }));
      lines.push(new google.maps.Polyline({ map: currentMap, path, zIndex: 4, clickable: false, ...lineOptions(selected, color, 5, 1) }));
    }
    function addMarker(position: Coordinates, className: string, title: string, content?: string, html = false, style?: Partial<CSSStyleDeclaration>) {
      const element = document.createElement("div");
      element.className = className;
      if (content) { if (html) element.innerHTML = content; else element.textContent = content; }
      if (style) Object.assign(element.style, style);
      markers.push(new google.maps.marker.AdvancedMarkerElement({ map: currentMap, position, title, content: element }));
    }
    if (props.start) addMarker(props.start, "marker-start", props.startLabel || "Start");
    const endpoint = selected?.destination || props.destination;
    if (endpoint) addMarker(endpoint, "marker-finish", "Finish", FLAG, true);
    selected?.stops.forEach((stop, index) => {
      const finish = !selected.isLoop && !selected.destination && index === selected.stops.length - 1;
      addMarker(stop, `marker-stop ${finish ? "finish" : ""}`, finish ? `${stop.name} · finish` : stop.name, String(index + 1), false, finish ? undefined : { borderColor: color, color });
    });
    if (props.event) addMarker(props.event.location, "marker-event", `Fictional sample event: ${props.event.name}`, "E");
    return () => { lines.forEach(line => line.setMap(null)); markers.forEach(marker => { marker.map = null; }); };
    // onSelectRoute is stable in intent; redrawing for each new function would flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.start, props.startLabel, props.destination, props.routes, props.selected, props.event]);

  // Fit after a short delay so panels finish resizing. On phones, frame the strip between the panels.
  useEffect(() => {
    if (!ready || !map.current || !container.current) return;
    const currentMap = map.current;
    let idleListener: google.maps.MapsEventListener | undefined;
    let timer: number | undefined;
    function fit() {
      const bounds = new google.maps.LatLngBounds();
      if (props.selected) props.selected.geometry.coordinates.forEach(([lng, lat]) => bounds.extend({ lat, lng }));
      else if (props.start) { bounds.extend(props.start); if (props.destination) bounds.extend(props.destination); }
      else return;
      if (!props.selected && !props.destination) { currentMap.panTo(bounds.getCenter()); return; }
      const padding = props.compact ? { top: cssPixels("--wally-top") + 18, right: 64, bottom: 28, left: 24 } : { top: 90, right: 76, bottom: 44, left: 44 };
      currentMap.fitBounds(bounds, padding);
      idleListener?.remove();
      idleListener = google.maps.event.addListenerOnce(currentMap, "idle", () => { if ((currentMap.getZoom() || 0) > 16) currentMap.setZoom(16); });
    }
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(fit, 220); };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(container.current);
    return () => { observer.disconnect(); window.clearTimeout(timer); idleListener?.remove(); };
  }, [ready, props.start, props.destination, props.selected, props.compact, props.layoutKey]);

  const zoom = (change: number) => { const current = map.current; if (current) current.setZoom((current.getZoom() || 14) + change); };
  const hint = picking ? <div className="pick-hint" role="status">Tap the map to set your {picking === "start" ? "starting point" : "destination"}<button type="button" onClick={props.onCancelPick} aria-label="Stop picking on the map"><X size={14} /></button></div> : null;

  if (!hasBrowserKey) return <SampleRoutePreview start={props.start ?? props.initialCenter} routes={props.routes} selected={props.selected} />;
  const showSampleFallback = Boolean(error) && (!props.selected || props.selected.source === "demo");
  const selectedIndex = props.routes.findIndex(route => route.id === props.selected?.id);
  return <div className={`google-map-frame ${picking ? "picking" : ""}`}>
    <div ref={container} className={`wander-map ${showSampleFallback ? "failed-map" : ""}`} aria-label="Interactive Google Maps walking route map" />
    {showSampleFallback ? <div className="schematic-fallback"><SampleRoutePreview start={props.start ?? props.initialCenter} routes={props.routes} selected={props.selected} /></div> : null}
    {!ready && !error ? <div className="map-state"><Compass size={28} /><span>Loading Google Maps…</span></div> : null}
    {error ? <div className={`map-error ${showSampleFallback ? "has-schematic" : ""}`} role="alert"><Info size={18} /><div><strong>Map unavailable</strong><p>{error}</p><small>Demo routes remain available from the planner. Refresh after updating your Google Maps setup.</small></div></div> : null}
    {hint}
    {!props.compact && props.selected ? <div className="map-legend">
      <span className="legend-row"><span className={`legend-swatch ${props.selected.source === "demo" ? "dotted" : ""}`} style={{ "--route-color": routeColor(Math.max(0, selectedIndex)) } as React.CSSProperties} />{props.selected.name}</span>
      {props.routes.length > 1 ? <span className="legend-row muted"><span className="legend-swatch faded" />Other options</span> : null}
      {props.selected.source === "demo" ? <span className="legend-note">Sample data · paths are illustrative</span> : null}
    </div> : null}
    {ready ? <div className="zoom-buttons"><button type="button" onClick={() => zoom(1)} aria-label="Zoom in"><Plus size={18} /></button><button type="button" onClick={() => zoom(-1)} aria-label="Zoom out"><Minus size={18} /></button></div> : null}
  </div>;
}
