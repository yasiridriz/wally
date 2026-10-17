export type Coordinates = { lat: number; lng: number };
export type LocationSearchResult = {
  id: string; name: string; address: string; coordinates: Coordinates;
  attributions?: { displayName: string; uri?: string }[];
};
export type Duration = 15 | 30 | 45 | 60 | 90;
export type Mood = 'surprise' | 'scenic' | 'green' | 'historic' | 'hidden';
export type RouteMode = 'destination' | 'loop' | 'explore';
export type PlaceCategory = 'park' | 'viewpoint' | 'historic' | 'art' | 'attraction' | 'path';
export type Place = Coordinates & {
  id: string; name: string; category: PlaceCategory; description?: string;
  baseScenicScore: number; tags?: Record<string, string>;
  attributions?: { displayName: string; uri?: string }[];
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
  exceedsBudget?: boolean;
  budgetMinutes?: number;
  overBudgetMinutes?: number;
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
