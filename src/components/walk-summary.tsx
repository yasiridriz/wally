"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Footprints, Landmark, MapPin, Mountain, Navigation, Palette, Trees } from "lucide-react";
import { getWalkSummary } from "@/app/actions/get-walk-summary";
import { baseRouteId, googleMapsDirectionsUrl, summaryStops } from "@/lib/walk-summary";
import type { Place, SummaryPhoto, WanderRoute } from "@/lib/types";

type PhotoState = { photos: SummaryPhoto[]; error?: string };
const CATEGORY_ICONS: Record<Place["category"], typeof Trees> = { park: Trees, viewpoint: Mountain, historic: Landmark, art: Palette, attraction: MapPin, path: Footprints };

export default function WalkSummary({ route }: { route: WanderRoute }) {
  // Photo URLs stay in memory for this set of routes only; nothing is persisted.
  const [photoStates, setPhotoStates] = useState<Record<string, PhotoState>>({});
  const requested = useRef(new Set<string>());
  const id = baseRouteId(route.id);
  const stops = summaryStops(route.stops);
  const wantsPhotos = route.source === "live" && stops.some(stop => stop.photo);

  useEffect(() => {
    if (!wantsPhotos || requested.current.has(id)) return;
    requested.current.add(id);
    getWalkSummary({ routeId: id })
      .then(result => setPhotoStates(states => ({ ...states, [id]: result.ok ? { photos: result.data.photos } : { photos: [], error: result.error } })))
      .catch(() => setPhotoStates(states => ({ ...states, [id]: { photos: [], error: "Place photos are unavailable right now." } })));
  }, [id, wantsPhotos]);

  const state = photoStates[id];
  const mapsUrl = googleMapsDirectionsUrl(route);
  return <section className="walk-summary" aria-label="Walk preview">
    <div className="results-heading"><h2>Walk preview</h2></div>
    <SummaryDeck key={id} route={route} stops={stops} photos={state?.photos ?? []} loading={wantsPhotos && !state} />
    {state?.error ? <p className="summary-note" role="status">{state.error}</p> : null}
    {mapsUrl ? <a className="primary-button maps-button" href={mapsUrl} target="_blank" rel="noreferrer"><Navigation size={16} />Get me to Google Maps</a> : null}
  </section>;
}

function SummaryDeck({ route, stops, photos, loading }: { route: WanderRoute; stops: Place[]; photos: SummaryPhoto[]; loading: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = stops.length + 1;
  function cardWidth() {
    const element = track.current;
    const card = element?.firstElementChild as HTMLElement | null;
    return element && card ? card.offsetWidth + parseFloat(getComputedStyle(element).columnGap || "0") : 0;
  }
  function show(index: number) {
    const width = cardWidth();
    if (width) track.current?.scrollTo({ left: Math.max(0, Math.min(count - 1, index)) * width, behavior: "smooth" });
  }
  function trackScroll() {
    const width = cardWidth();
    if (width && track.current) setActive(Math.max(0, Math.min(count - 1, Math.round(track.current.scrollLeft / width))));
  }
  const stopNames = route.stops.map(stop => stop.name);
  if (route.event) stopNames.splice(Math.max(0, Math.min(stopNames.length, route.eventStopIndex ?? stopNames.length)), 0, route.event.name);
  const ending = route.isLoop ? "Returns to start" : route.destination ? "Finishes at your destination" : `Finishes at ${route.stops.at(-1)?.name ?? "the last stop"}`;

  return <div className="summary-deck">
    <div className="summary-track" ref={track} onScroll={trackScroll}>
      <article className="summary-card summary-cover" aria-label={`Summary card 1 of ${count}`}>
        <span className="summary-kicker">{route.source === "demo" ? "SAMPLE · " : ""}{route.destination ? "TARGETED" : route.isLoop ? "LOOP" : "EXPLORE"}</span>
        <h3>{route.name}</h3>
        <p className="summary-stats"><span><Clock3 size={13} />{route.totalMinutes} min</span><span><Footprints size={13} />{(route.distanceMeters / 1000).toFixed(1)} km</span><span><MapPin size={13} />{route.stops.length} stops</span></p>
        <ol className="summary-stops">{stopNames.map((name, index) => <li key={`${index}:${name}`}>{name}</li>)}</ol>
        <p className="summary-ending">{ending}</p>
      </article>
      {stops.map((stop, index) => <StopCard key={stop.id} stop={stop} number={route.stops.indexOf(stop) + 1} position={index + 2} count={count} photo={photos.find(photo => photo.stopId === stop.id)} loading={loading && Boolean(stop.photo)} />)}
    </div>
    {count > 1 ? <div className="summary-nav">
      <button className="icon-button" onClick={() => show(active - 1)} disabled={active === 0} aria-label="Previous card"><ChevronLeft size={16} /></button>
      <div className="summary-dots">{Array.from({ length: count }, (_, index) => <button key={index} className={index === active ? "active" : ""} onClick={() => show(index)} aria-label={`Show card ${index + 1}`} aria-current={index === active} />)}</div>
      <button className="icon-button" onClick={() => show(active + 1)} disabled={active === count - 1} aria-label="Next card"><ChevronRight size={16} /></button>
    </div> : null}
  </div>;
}

function StopCard({ stop, number, position, count, photo, loading }: { stop: Place; number: number; position: number; count: number; photo?: SummaryPhoto; loading: boolean }) {
  const [failedUrl, setFailedUrl] = useState("");
  const Icon = CATEGORY_ICONS[stop.category] ?? MapPin;
  const showPhoto = photo && photo.url !== failedUrl;
  return <article className="summary-card summary-stop" aria-label={`Summary card ${position} of ${count}`}>
    <div className={`summary-photo ${loading ? "loading" : ""}`}>
      {showPhoto
        // Google photo URLs are short-lived and must not go through the Next.js image cache.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photo.url} alt={stop.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(photo.url)} />
        : <Icon size={34} strokeWidth={1.5} aria-hidden="true" />}
      <span className="summary-stop-number">Stop {number}</span>
    </div>
    <div className="summary-stop-body">
      <span className="stop-category">{stop.category}</span>
      <h3>{stop.name}</h3>
      <p>{stop.suggestedActivity || stop.description || "A point of interest along this route."}</p>
      {showPhoto ? <p className="summary-credit">{photo.authorAttributions.length ? <>Photo: {photo.authorAttributions.map((author, index) => <span key={`${index}:${author.displayName}`}>{index ? ", " : ""}{author.uri && /^https?:\/\//.test(author.uri) ? <a href={author.uri} target="_blank" rel="noreferrer">{author.displayName}</a> : author.displayName}</span>)} · </> : null}<span className="google-text-attribution" translate="no">Google Maps</span></p> : null}
    </div>
  </article>;
}
