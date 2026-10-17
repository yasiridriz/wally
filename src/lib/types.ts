export type Coordinates = { lat: number; lng: number };
export type LocationSearchResult = {
  id: string; name: string; address: string; coordinates: Coordinates;
  attributions?: { displayName: string; uri?: string }[];
};
/** Any whole minute from 5 to 180; see `src/lib/duration.ts`. */
export type Duration = number;
export type Mood = 'surprise' | 'scenic' | 'green' | 'historic' | 'hidden';
export type RouteMode = 'destination' | 'loop' | 'explore';
export type PlaceCategory = 'park' | 'viewpoint' | 'historic' | 'art' | 'attraction' | 'path';
export type Attribution = { displayName: string; uri?: string };
/** Google photo resource name; a short-lived image URL is fetched on demand. */
export type PlacePhotoRef = { name: string; authorAttributions: Attribution[] };
export type Place = Coordinates & {
  id: string; name: string; category: PlaceCategory; description?: string;
  baseScenicScore: number; tags?: Record<string, string>;
  attributions?: { displayName: string; uri?: string }[];
  visitMinutes?: number;
  suggestedActivity?: string;
  photo?: PlacePhotoRef;
};
export type Event = {
  id: string; name: string; location: Coordinates; startTime: string; endTime: string;
  visitMinutes: number; category: string; description: string; isSample: true;
};
export type WanderRoute = {
  id: string; name: string; description: string; geometry: GeoJSON.LineString;
  stops: Place[]; distanceMeters: number; walkingMinutes: number; stopMinutes: number;
  bufferMinutes: number; totalMinutes: number; score: number; highlights: string[];
  isLoop: boolean; source: 'live' | 'demo'; event?: Event; destination?: Coordinates;
  routingWarnings?: string[];
  /** Validated start of the walk. */
  start?: Coordinates;
  /** Count of stops visited before the event on a detour route. */
  eventStopIndex?: number;
};
export type GenerateRequest = {
  start: Coordinates; duration: Duration; mood: Mood; mode: RouteMode;
  visitedIds: string[]; includeEvents: boolean; demo: boolean; destination?: Coordinates;
};
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };
export type GenerateResponse = { routes: WanderRoute[]; message?: string };
export type DetourOption = {
  id: string; event: Event; route: WanderRoute; additionalMinutes: number;
  additionalDistanceMeters: number; arrivalTime: string;
};
export type SummaryPhoto = { stopId: string; placeName: string; url: string; authorAttributions: Attribution[] };
export type WalkSummary = { photos: SummaryPhoto[] };
