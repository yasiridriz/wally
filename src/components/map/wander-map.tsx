"use client";

import { useEffect, useRef, useState } from "react";
import { Compass, Info } from "lucide-react";
import type { Coordinates, Event, WanderRoute } from "@/lib/types";
import { ROUTE_COLORS } from "../route-card";
import { loadGoogleMaps } from "./google-maps-loader";
import SampleRoutePreview from "./sample-route-preview";

type Props = { start: Coordinates; hasStart?: boolean; destination?: Coordinates; routes: WanderRoute[]; selected?: WanderRoute; onStartChange: (coordinates: Coordinates) => void; canSetStart: boolean; event?: Event };
const FLAG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22V3m0 0c6-5 10 5 16 0v11c-6 5-10-5-16 0"/></svg>';

export default function WanderMap(props: Props) {
  const { canSetStart, onStartChange } = props;
  const container = useRef<HTMLDivElement>(null);
  const initialStart = useRef(props.start);
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
        center: initialStart.current, zoom: 14,
        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        clickableIcons: false, gestureHandling: "greedy", zoomControl: true,
        zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
      });
      setReady(true);
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Google Maps couldn’t load. Refresh to try again."); });
    return () => { cancelled = true; window.removeEventListener("wally:maps-auth-error", handleAuthError); if (map.current) google.maps.event.clearInstanceListeners(map.current); map.current = null; };
  }, [hasBrowserKey]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const listener = map.current.addListener("click", (event: google.maps.MapMouseEvent) => { if (canSetStart && event.latLng) onStartChange(event.latLng.toJSON()); });
    return () => listener.remove();
  }, [ready, canSetStart, onStartChange]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const currentMap = map.current;
    const polylines = props.routes.map((route, index) => new google.maps.Polyline({
      map: currentMap, path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      strokeColor: ROUTE_COLORS[index % ROUTE_COLORS.length], strokeWeight: route.id === props.selected?.id ? 6 : 3,
      strokeOpacity: route.id === props.selected?.id ? .95 : .35, zIndex: route.id === props.selected?.id ? 2 : 1,
    }));
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    function addMarker(position: Coordinates, className: string, title: string, content?: string, html = false) {
      const element = document.createElement("div"); element.className = className;
      if (content) { if (html) element.innerHTML = content; else element.textContent = content; }
      element.setAttribute("aria-label", title);
      markers.push(new google.maps.marker.AdvancedMarkerElement({ map: currentMap, position, title, content: element }));
    }
    if (props.hasStart !== false) addMarker(props.start, "start-map-marker", "Start your wander here");
    const endpoint = props.selected?.destination || props.destination;
    if (endpoint) addMarker(endpoint, "endpoint-map-marker", "Your destination · finish here", FLAG, true);
    props.selected?.stops.forEach((stop, index) => addMarker(stop, "numbered-map-marker", stop.name, String(index + 1)));
    if (props.event) addMarker(props.event.location, "event-map-marker", `Fictional sample event: ${props.event.name}`, "E");
    return () => { polylines.forEach(line => line.setMap(null)); markers.forEach(marker => { marker.map = null; }); };
  }, [ready, props.start, props.hasStart, props.destination, props.routes, props.selected, props.event]);

  useEffect(() => {
    if (!ready || !map.current || !container.current) return;
    const currentMap = map.current;
    function fit() {
      const bounds = new google.maps.LatLngBounds();
      if (props.selected) props.selected.geometry.coordinates.forEach(([lng, lat]) => bounds.extend({ lat, lng }));
      else { bounds.extend(props.start); if (props.destination) bounds.extend(props.destination); }
      const desktop = window.innerWidth >= 768;
      currentMap.fitBounds(bounds, { top: desktop ? 85 : 55, right: 55, bottom: 50, left: 45 });
      const listener = google.maps.event.addListenerOnce(currentMap, "idle", () => { if ((currentMap.getZoom() || 0) > 16) currentMap.setZoom(16); });
      return listener;
    }
    let idleListener = fit();
    const observer = new ResizeObserver(() => { idleListener.remove(); google.maps.event.trigger(currentMap, "resize"); idleListener = fit(); });
    observer.observe(container.current);
    return () => { observer.disconnect(); idleListener.remove(); };
  }, [ready, props.start, props.destination, props.selected]);

  if (!hasBrowserKey) return <SampleRoutePreview start={props.start} routes={props.routes} selected={props.selected} />;
  const showSampleFallback = Boolean(error) && (!props.selected || props.selected.source === "demo");
  return <div className="google-map-frame"><div ref={container} className={`wander-map ${showSampleFallback ? "failed-map" : ""}`} aria-label="Interactive Google Maps walking route map" />{showSampleFallback ? <div className="schematic-fallback"><SampleRoutePreview start={props.start} routes={props.routes} selected={props.selected} /></div> : null}{!ready && !error ? <div className="google-map-loading"><Compass size={30} /><span>Loading Google Maps…</span></div> : null}{error ? <div className={`google-map-error ${showSampleFallback ? "has-schematic" : ""}`} role="alert"><Info size={19} /><div><strong>Map unavailable</strong><p>{error}</p><small>Demo routes remain available from the planner. Refresh after updating your Google Maps setup.</small></div></div> : null}</div>;
}
