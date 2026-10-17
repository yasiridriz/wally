"use client";

import { Compass, Flag } from "lucide-react";
import type { Coordinates, WanderRoute } from "@/lib/types";
import { ROUTE_COLORS, OVER_BUDGET_COLOR } from "../route-card";

export default function SampleRoutePreview({ start, routes, selected }: { start: Coordinates; routes: WanderRoute[]; selected?: WanderRoute }) {
  const samples = routes.filter(route => route.source === "demo");
  const shown = selected?.source === "demo" ? selected : undefined;
  const coordinates = samples.flatMap(route => route.geometry.coordinates);
  const minLng = Math.min(start.lng, ...coordinates.map(point => point[0]));
  const maxLng = Math.max(start.lng, ...coordinates.map(point => point[0]));
  const minLat = Math.min(start.lat, ...coordinates.map(point => point[1]));
  const maxLat = Math.max(start.lat, ...coordinates.map(point => point[1]));
  const width = Math.max(.002, maxLng - minLng), height = Math.max(.002, maxLat - minLat);
  const point = (lng: number, lat: number) => [80 + (lng - minLng) / width * 640, 450 - (lat - minLat) / height * 340];
  const [startX, startY] = point(start.lng, start.lat);
  return <section className="sample-route-preview" aria-label="Sample route schematic, not a navigable map">
    <div className="schematic-heading"><Compass size={20} /><div><strong>Sample route preview</strong><p>Sample route schematic · not a map or navigation</p></div></div>
    <svg viewBox="0 0 800 560" role="img" aria-label={shown ? `Illustrative path for ${shown.name}, with numbered sample stops` : "Generate a demo route to see its illustrative path"}>
      <defs><pattern id="schematic-grid" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#c5cdb7" /></pattern></defs>
      <rect width="800" height="560" fill="url(#schematic-grid)" />
      {samples.length ? <>{samples.map((route, index) => <polyline key={route.id} points={route.geometry.coordinates.map(([lng, lat]) => point(lng, lat).join(",")).join(" ")} fill="none" stroke={route.exceedsBudget ? OVER_BUDGET_COLOR : ROUTE_COLORS[index % ROUTE_COLORS.length]} strokeWidth={route.id === shown?.id ? 6 : 3} strokeOpacity={route.id === shown?.id ? 1 : .3} strokeLinecap="round" strokeLinejoin="round" />)}<circle cx={startX} cy={startY} r="9" fill="#214d3c" stroke="#fbfaf5" strokeWidth="4" /><text x={startX} y={startY + 28} textAnchor="middle" className="schematic-label">START</text>{shown?.stops.map((stop, index) => { const [x, y] = point(stop.lng, stop.lat); return <g key={stop.id}><circle cx={x} cy={y} r="13" fill="#214d3c" stroke="#fbfaf5" strokeWidth="3" /><text x={x} y={y + 4} textAnchor="middle" fill="#fffdf8" fontSize="11">{index + 1}</text><text x={x} y={y - 23} textAnchor="middle" className="schematic-label">{stop.name}</text></g>; })}{shown?.destination ? <g transform={`translate(${point(shown.destination.lng, shown.destination.lat).join(" ")})`}><circle r="15" fill={shown.exceedsBudget ? OVER_BUDGET_COLOR : "#bf8050"} stroke="#fbfaf5" strokeWidth="3" /><Flag x={-7} y={-8} width={15} height={15} stroke="#fffdf8" /><text y="32" textAnchor="middle" className="schematic-label">FINISH</text></g> : null}</> : <><path d="M140 400C190 280 310 440 350 300S530 170 650 220" stroke="#9cab83" strokeWidth="4" strokeDasharray="7 10" strokeLinecap="round" fill="none" /><circle cx="140" cy="400" r="10" fill="#214d3c" /><text x="400" y="490" textAnchor="middle" className="schematic-empty">Choose your preferences and generate a sample walk.</text></>}
    </svg>
    <p className="schematic-disclaimer">Illustrative Edinburgh sample geometry. Locations and travel times are unverified. Live map selection requires a Google Maps browser key.</p>
  </section>;
}
