import { isCoordinates } from "./geo/coordinates";
import type { Coordinates, Place, WanderRoute } from "./types";

export const MAX_SUMMARY_STOPS = 3;
// Google Maps URLs accept up to nine waypoints (three in mobile browsers).
const MAX_WAYPOINTS = 9;
const PLACE_ID = /^[A-Za-z0-9_-]{1,300}$/;

/** Detour routes reuse the stops, photos and server context of their base route. */
export function baseRouteId(id: string): string {
  return id.split(":")[0];
}

/** The highest-scoring stops, photos first, returned in walking order. */
export function summaryStops(stops: Place[], limit = MAX_SUMMARY_STOPS): Place[] {
  return stops.map((stop, order) => ({ stop, order }))
    .sort((a, b) => Number(Boolean(b.stop.photo)) - Number(Boolean(a.stop.photo)) || b.stop.baseScenicScore - a.stop.baseScenicScore || a.order - b.order)
    .slice(0, limit)
    .sort((a, b) => a.order - b.order)
    .map(({ stop }) => stop);
}

type MapsStop = { point: Coordinates; placeId?: string };

function googlePlaceId(place: Place): string | undefined {
  const id = place.id.startsWith("google-") ? place.id.slice(7) : "";
  return PLACE_ID.test(id) ? id : undefined;
}

function latLng(point: Coordinates): string {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

/**
 * Google Maps walking directions through the route stops, in route order.
 * Loops end at the start, Targeted walks at the chosen destination, and
 * Explore walks at the final stop. An accepted event detour stays in place.
 */
export function googleMapsDirectionsUrl(route: WanderRoute): string | null {
  const first = route.geometry.coordinates[0];
  const start = route.start ?? (first ? { lat: first[1], lng: first[0] } : undefined);
  if (!isCoordinates(start)) return null;
  const stops: MapsStop[] = route.stops.map(stop => ({ point: { lat: stop.lat, lng: stop.lng }, placeId: googlePlaceId(stop) }));
  if (route.event) stops.splice(Math.max(0, Math.min(stops.length, route.eventStopIndex ?? stops.length)), 0, { point: route.event.location });
  const destination: MapsStop | undefined = route.isLoop ? { point: start } : route.destination ? { point: route.destination } : stops.pop();
  if (!destination || ![...stops, destination].every(stop => isCoordinates(stop.point)) || stops.length > MAX_WAYPOINTS) return null;
  const params = new URLSearchParams({ api: "1", origin: latLng(start), destination: latLng(destination.point), travelmode: "walking" });
  if (destination.placeId) params.set("destination_place_id", destination.placeId);
  if (stops.length) {
    params.set("waypoints", stops.map(stop => latLng(stop.point)).join("|"));
    // Place IDs show stop names in Google Maps, but the list must match every waypoint.
    if (stops.every(stop => stop.placeId)) params.set("waypoint_place_ids", stops.map(stop => stop.placeId).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params}`;
}
