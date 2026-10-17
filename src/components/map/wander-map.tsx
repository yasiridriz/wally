"use client";

import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { divIcon, DomEvent, latLngBounds } from "leaflet";
import type { Coordinates, Event, WanderRoute } from "@/lib/types";
import { ROUTE_COLORS } from "../route-card";

function MapInteraction({ start, routes, selected, onStartChange, canSetStart }: { start: Coordinates; routes: WanderRoute[]; selected?: WanderRoute; onStartChange: (coordinates: Coordinates) => void; canSetStart: boolean }) {
  const map = useMap();
  useMapEvents({ click: event => { if (canSetStart) onStartChange({ lat: event.latlng.lat, lng: event.latlng.lng }); } });
  useEffect(() => {
    if (selected) {
      const bounds = latLngBounds(selected.geometry.coordinates.map(coordinate => [coordinate[1], coordinate[0]] as [number, number]));
      const desktop = window.innerWidth >= 768;
      map.fitBounds(bounds, { paddingTopLeft: desktop ? [440, 110] : [30, 100], paddingBottomRight: desktop ? [75, 80] : [30, Math.min(window.innerHeight * .55, 440)], maxZoom: 16, animate: true });
    } else map.setView([start.lat, start.lng], map.getZoom(), { animate: true });
  }, [map, selected, start]);
  useEffect(() => { const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(map.getContainer()); return () => observer.disconnect(); }, [map]);
  return <>{routes.map((route, index) => <Polyline key={route.id} positions={route.geometry.coordinates.map(coordinate => [coordinate[1], coordinate[0]] as [number, number])} pathOptions={{ color: ROUTE_COLORS[index % ROUTE_COLORS.length], weight: selected?.id === route.id ? 6 : 3, opacity: selected?.id === route.id ? .95 : .35, lineCap: "round", lineJoin: "round" }} />)}</>;
}

export default function WanderMap({ start, routes, selected, onStartChange, canSetStart, event }: { start: Coordinates; routes: WanderRoute[]; selected?: WanderRoute; onStartChange: (coordinates: Coordinates) => void; canSetStart: boolean; event?: Event }) {
  const [tilesFailed, setTilesFailed] = useState(false);
  return <MapContainer center={[start.lat, start.lng]} zoom={14} zoomControl={false} className="wander-map" scrollWheelZoom aria-label="Interactive walking route map">
    <TileLayer attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} eventHandlers={{ tileerror: () => setTilesFailed(true) }} />
    {tilesFailed ? <div className="tile-error-notice" role="status">Map tiles couldn’t load. Check your connection; route planning remains available.</div> : null}
    <MapInteraction start={start} routes={routes} selected={selected} onStartChange={onStartChange} canSetStart={canSetStart} />
    <CircleMarker center={[start.lat, start.lng]} radius={9} pathOptions={{ color: "#fffdf8", fillColor: "#173e32", fillOpacity: 1, weight: 4 }}><Tooltip>Start your wander here</Tooltip></CircleMarker>
    {selected?.stops.map((stop, index) => <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={divIcon({ className: "numbered-map-marker", html: `<span>${index + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] })}><Tooltip direction="top">{stop.name}</Tooltip></Marker>)}
    {event ? <CircleMarker center={[event.location.lat, event.location.lng]} radius={10} pathOptions={{ color: "white", fillColor: "#c77c45", fillOpacity: 1, weight: 3 }}><Tooltip>Sample event: {event.name}</Tooltip></CircleMarker> : null}
    <MapButtons />
  </MapContainer>;
}

function MapButtons() {
  const map = useMap();
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => { if (controls.current) { DomEvent.disableClickPropagation(controls.current); DomEvent.disableScrollPropagation(controls.current); } }, []);
  return <div ref={controls} className="map-zoom" aria-label="Map zoom controls"><button onClick={event => { event.stopPropagation(); map.zoomIn(); }} aria-label="Zoom in">+</button><button onClick={event => { event.stopPropagation(); map.zoomOut(); }} aria-label="Zoom out">−</button></div>;
}
