# Wally

**Take the scenic route to nowhere.** A walking discovery MVP using Next.js App Router, TypeScript, Tailwind, Google Maps JavaScript API, Google Places API (New), and Google Routes API.

## Run

Requires Node.js 20.19+ or 22.12+ (Node 22 recommended).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Demo route generation works without credentials. A Google map requires a browser key; without one, demo routes have a clearly labelled local schematic preview instead of a map.

## iOS app

`ios/` contains a SwiftUI version of Wally with the same features and texts as the web app before the planner restyle. It does not have the new layout or the 5–180 minute range yet: its durations are the five presets. It uses the Google Maps SDK for iOS and calls Places API (New) and Routes API directly from the device. `ios/WallyCore` is a Swift port of `src/lib`. When you change a rule in `src/lib` (budgets, scoring, candidates, demo data, events, or the walk preview), make the same change in `ios/WallyCore` and its tests. Read `ios/README.md` for setup, key restrictions, and checks.

## Google Maps setup

Create a project and enable billing in [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/overview). Enable these APIs:

- Maps JavaScript API for the browser map.
- Places API (New) for start/destination search and nearby interesting places.
- Routes API for pedestrian routes and detours.

Create two separately restricted API keys and set:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_browser_key
GOOGLE_MAPS_API_KEY=your_server_key
# Optional map ID from Google Cloud; local development falls back to DEMO_MAP_ID.
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=
```

Restrict the browser key to **Maps JavaScript API** and website HTTP referrers, including `http://localhost:3000/*` for local development and your deployed origin. The browser key is intentionally public. Restrict the private server key to **Places API (New)** and **Routes API**. Places API (New) also supplies the place photos; apply IP restrictions when deployment has stable outbound addresses. Never put the server key in a `NEXT_PUBLIC_` variable. Restart development after changing environment variables; public variables are embedded during builds, so rebuild deployment when they change.

Google Maps Platform usage may incur charges; configure project quotas and budget alerts. Place fields search while you type: after 3 or more characters and a 400 ms pause, each new query makes one Places Text Search request, returning at most five options. A repeated query in the same session uses the in-memory result and makes no new request. All route modes use at most six Places requests, including targeted viewpoint and activity searches. All modes cap Routes attempts at eight, including retries. Event discovery adds up to two Routes attempts. The walk preview makes at most three Place Photo requests for each live route that you select. The server keeps the result with the route, so a second selection of the same route makes no new request. Other controls make no place requests. See [Google setup](https://developers.google.com/maps/documentation/javascript/get-api-key) and [key restrictions](https://developers.google.com/maps/api-security-best-practices).

OpenRouteService, Overpass, OpenStreetMap tiles, and Leaflet are no longer used. Existing OpenRouteService keys are unnecessary.

## Try it

The default walk is 30 minutes, finishing anywhere, with Surprise me. With both keys configured, press **Find me a little adventure →** once: if you did not choose a start, Wally asks the browser for your current location first, then finds walks. Location access requires HTTPS or localhost. If access is denied, unavailable, or times out, Wally explains and you can type a start or pick one on the map. A location result that arrives late never overwrites a start you chose.

- **Time:** the main control. Choose any whole minute from 5 to 180 with the slider, the −/+ buttons (5 minutes), or the 15/30/45/60/90 presets. All three stay in sync.
- **Start and finish:** type 3 or more characters and choose a suggestion (↑ ↓ and Enter work), use your location, or press the crosshair and tap the map to drop a pin. Outside pick mode, map taps do nothing. If you type text but choose no suggestion, Wally asks you to choose one instead of guessing.
- **Route shape:** **Loop back** returns to the start (`loop`). **Finish elsewhere** finishes at your destination (`destination`, Targeted) when you chose one, and otherwise at the last interesting stop (`explore`). Event detours preserve the endpoint. A destination must be at least 50 metres from the start and reachable within the chosen time.
- **Tags:** one mood at a time (Scenic, Green & peaceful, Historic, Hidden gems). Tapping the selected mood returns to Surprise me. Sample event detours toggle on their own.

All modes use the selected duration as the total trip: walking, planned visits, and a safety buffer. Accepted routes must use 90–100% of that duration (81–90 minutes for a 90-minute choice), prioritising the closest verified total. When none qualify, Wally explains instead of returning a much shorter trip or padding time. Very short or very long choices often have no route: for example, 5 minutes cannot fit two stops, and a 180-minute walk needs stops far enough apart within the 3.5 km discovery limit. Demo Mode is a pill in the brand row; it uses fixed sample start and destination fields and never overwrites your live locations. Visited IDs and walking preferences persist only in browser localStorage; Demo Mode is not persisted. Saved preferences from earlier versions keep their duration, mood, and loop choice.

## Interface

- **One planner state:** `src/components/use-planner.ts` holds all state, defaults, validation, and `generate(onStart, onFail)`. It feeds two layouts. `useIsDesktop()` chooses the layout at 1024 px; the server renders the phone layout and the desktop layout takes over after hydration.
- **Desktop (1024 px and wider):** `desktop-panel.tsx` is a 400 px left panel: brand, time selector, start and finish fields, tag chips, results, and a sticky generate button. The map fills the rest and shows a legend and zoom buttons.
- **Phone:** `mobile-planner.tsx` is a floating top card over the full-screen map: time selector, a From | loop toggle | To row, and a Tags dropdown with the generate button. After generate, the card folds into a summary bar and a results sheet (at most 48% of the screen) slides up. The planner publishes `--wally-top` (bottom edge of the top card) and `--wally-sheet` (sheet height) on the root element. The map container ends at the sheet, so the zoom buttons and Google attribution move with it, and the map frames routes below `--wally-top`.
- **Style:** colours keep the original tokens in `globals.css`; new values are only tints of those hues. Fraunces (display) and DM Sans (text) are self-hosted from Fontsource. Focus rings use the accent colour, and `prefers-reduced-motion` turns off all animation.
- **Map:** sample routes are dotted; unselected options are thin and faded, and you can click them to select them. The selected route has a light outline under its colour.

## Walk preview

When you select a route, Wally shows a walk preview below the route cards. The preview is a set of flash cards. Swipe the cards, or use the arrows and dots.

- **Summary card:** the route name, mode, total time, distance, stops, and finish.
- **Stop cards:** a maximum of three stops. Wally selects the stops that have a Google photo and the highest scenic score. The cards show in walk order. Each photo shows the photo author and the "Google Maps" attribution.
- **Get me to Google Maps:** this button opens Google Maps walking directions in a new tab. The link adds the start, the stops in route order, and the finish. A loop finishes at the start. Explore finishes at the last stop. Targeted finishes at your destination. An accepted event detour keeps its position.

How the photos work:

1. Nearby Search also requests `places.photos`. This field is in the same Nearby Search Pro tier as `displayName`, so it adds no cost to discovery. Wally keeps only the first valid photo name for each place.
2. The browser sends only the route ID to the `getWalkSummary` Server Action. The action loads photos only for a route that this server generated in the last 20 minutes. A detour ID (`routeId:eventId`) uses its base route.
3. The server calls Place Photo (New) with `skipHttpRedirect=true` and the server key in a header. Google returns a short-lived image URL that contains no key. The browser loads that URL directly with a plain `<img>`, not through the Next.js image cache.
4. If one photo fails, the other photos show. If all photos fail, or the route expired, the cards show a category icon and a short note. The Google Maps button still works.

Demo routes make no photo requests. Their stop cards show a category icon. The Google Maps link for a demo route gives live Google directions through the sample stops, not the hand-drawn sample path.

Google Maps can calculate a path that is different from the Wally path between the same stops. Google Maps URLs accept a maximum of nine waypoints, and mobile browsers accept a maximum of three. Wally routes have a maximum of three stops, plus one event on a detour. Google place IDs show the stop names in Google Maps. Wally adds the place IDs only if every waypoint has one, because Google needs the same count of IDs and waypoints.

## Live and sample data

- **Live map:** Google Maps JavaScript API, with native Google branding and attribution visible. The browser key must be configured even if server credentials are present.
- **Place photos:** Google Place Photo (New), loaded on demand for the selected route only. Photo names and image URLs stay in process memory and in the page state. Wally does not keep them in localStorage.
- **Live places:** Google Places Nearby Search (New), making targeted searches for viewpoints, scenic spots, trails, gardens, galleries, museums, and markets. Stop activities are suggestions with short planned visits; access, admission, and opening hours are not confirmed. Returned types serve as rough scenic proxies, not objective beauty assessments. Third-party attribution is preserved.
- **Live routing:** Google Routes `computeRoutes` with `WALK` travel mode, intermediate stops, real network geometry, distance, duration, and individual leg timings. WALK is beta; walking directions may not include all sidewalks or pedestrian paths. Provider warnings are shown.
- **Demo routes:** checked-in, hand-drawn Edinburgh GeoJSON illustrations and known example places. Paths and times are **unverified sample estimates**, not live directions. Fixed Meadows start; destination samples finish at the National Museum of Scotland. Sample geometry is shown schematically only when a Google map is unavailable; live Google route geometry is never rendered on that schematic.
- **Events:** fictional Edinburgh examples with clearly simulated schedules. Live-route detours are rerouted through Google and checked against arrival, waiting, visit duration, safety buffer, and budget before acceptance. No predefined event detours exist for demo walks.
- **Failures:** show actionable errors; never silently replace live routing with invented or straight-line paths.

## Route selection

1. Discover up to 20 named, deduplicated places within a time-dependent radius (maximum 3.5 km). Loop and Explore combine broad discovery, three outer areas for longer walks, and separate viewpoint/activity queries. Targeted searches start/end areas and both sides of the corridor, widening with spare walking time so a nearby destination can still support a longer scenic trip. Queries run sequentially, without a general POI response cache.
2. All modes build bounded candidate pools, route four initial candidates, and adapt up to two more using measured network walking times. Loop and Explore use two/three stops; Targeted may use one when the endpoint consumes most of the trip. Targeted candidate distance always includes the selected endpoint. Geographic distances are shortlist heuristics only.
3. Route at most two candidates concurrently and make at most eight HTTP attempts including limited transient retries. Routing timeout 12 seconds; place timeout 10 seconds.
4. Count rounded-up walking time, planned visits (typically 3–5 minutes based on activity; two minutes for legacy samples), and a buffer of at least two minutes or 10% of walking time. Reject totals above the selection or below 90% in every mode. Short fixed samples are never offered as long trips, including in Demo Mode.
5. Score scenic proxies 30%, novelty 25%, variety 15%, preference 20%, event relevance 10%; redistribute event weight when absent. Penalise repetitive paths and keep up to three sufficiently distinct stop sets. Every mode ranks actual closeness to the selected total before scenic score.

## Checks

```sh
npm run test
npm run typecheck
npm run lint
npm run build
npm start
```

Tests mock Google providers and cover budgets, scoring, ranking diversity, destination preservation, event timing, provider payloads, rate limits, and public-action input validation. Live testing requires configured Google credentials, billing, enabled APIs, and network access. Production uses the supported Webpack build because restricted sandboxes can block local sockets needed by Turbopack workers.

## Structure and limitations

`src/app/actions` validates inputs and returns serialisable results. `src/lib/geo` contains server-side provider calls, candidate generation, and pure scoring helpers. `src/lib/events.ts` exposes a replaceable event-provider function and verified detours. `src/components/map` loads Google Maps and manages markers/polylines. `src/lib/walk-summary.ts` selects the preview stops and builds the Google Maps link; it has no server dependency. `src/lib/geo/photos.ts` resolves photo names on the server. `src/components/walk-summary.tsx` shows the flash cards. Public `/terms` and `/privacy` explain Google-backed features and local data use.

No accounts, database, separate backend, ORM, AI, or global state library. Only the public map key reaches the browser. Generated route context is temporary process memory, capped at 150 routes and 20 minutes, used only for the active detour flow and the walk preview photos. It may expire on restart or a different serverless instance; regenerate the walk when needed. Google names, geometry, and photos are not persisted in localStorage; only visited IDs and preferences are saved.

Provider coverage, quotas, steep hills, disconnected paths, opening hours, and walking speed affect results. Fewer than three routes may qualify. This MVP uses interesting waypoints rather than continuously assessing scenery on every street. Request caps are per generation, not distributed abuse protection. Review quotas and the provider terms before a public deployment.
