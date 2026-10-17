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

Restrict the browser key to **Maps JavaScript API** and website HTTP referrers, including `http://localhost:3000/*` for local development and your deployed origin. The browser key is intentionally public. Restrict the private server key to **Places API (New)** and **Routes API**; apply IP restrictions when deployment has stable outbound addresses. Never put the server key in a `NEXT_PUBLIC_` variable. Restart development after changing environment variables; public variables are embedded during builds, so rebuild deployment when they change.

Google Maps Platform usage may incur charges; configure project quotas and budget alerts. Each explicit location search makes one Places Text Search request, returning at most five options. Loop generation uses up to six Places requests; other modes use up to three. All modes cap Routes attempts at eight, including retries. Event discovery adds up to two Routes attempts. There are no automatic place requests when controls change or while typing. See [Google setup](https://developers.google.com/maps/documentation/javascript/get-api-key) and [key restrictions](https://developers.google.com/maps/api-security-best-practices).

OpenRouteService, Overpass, OpenStreetMap tiles, and Leaflet are no longer used. Existing OpenRouteService keys are unnecessary.

## Try it

With both keys configured, Wally starts in Live Mode even if an older browser preference saved Demo Mode, and asks the browser to use your current location as the default start. Allow location access to centre the map on yourself. If access is denied, unavailable, or times out, search or pick a start manually. Location access requires HTTPS or localhost. Search for an address or landmark in **Starting from** and **Where are you heading?**, press Search, and select a Google result. You can also use the map picker for either point or retry geolocation with the location button. Choose a duration and mood, then press **Find routes**. Wally finds interesting stops en route and finishes at your selected destination. Event detours preserve that endpoint. A destination must be at least 50 metres from the start and reachable within the chosen budget.

Loop is the default and returns to the start. Its selected duration means the total trip: walking to and between stops, walking back, planned visits, and a safety buffer. Accepted loops must use 90–100% of the requested time (81–90 minutes for a 90-minute selection), prioritising the closest verified total. When none qualify, Wally explains instead of returning a much shorter trip or padding time. Destination and Explore modes retain an upper budget; Explore finishes at the final interesting stop. Live generation requires a located or selected start; the initial Edinburgh map centre is not treated as your chosen starting point. A pending location request never overwrites a start you select manually. Demo Mode remains available as an explicit session choice and never overwrites your live locations. Visited IDs and walking preferences persist only in browser localStorage; Demo Mode is not persisted.

## Live and sample data

- **Live map:** Google Maps JavaScript API, with native Google branding and attribution visible. The browser key must be configured even if server credentials are present.
- **Live places:** Google Places Nearby Search (New), making targeted searches for viewpoints, scenic spots, trails, gardens, galleries, museums, and markets. Stop activities are suggestions with short planned visits; access, admission, and opening hours are not confirmed. Returned types serve as rough scenic proxies, not objective beauty assessments. Third-party attribution is preserved.
- **Live routing:** Google Routes `computeRoutes` with `WALK` travel mode, intermediate stops, real network geometry, distance, duration, and individual leg timings. WALK is beta; walking directions may not include all sidewalks or pedestrian paths. Provider warnings are shown.
- **Demo routes:** checked-in, hand-drawn Edinburgh GeoJSON illustrations and known example places. Paths and times are **unverified sample estimates**, not live directions. Fixed Meadows start; destination samples finish at the National Museum of Scotland. Sample geometry is shown schematically only when a Google map is unavailable; live Google route geometry is never rendered on that schematic.
- **Events:** fictional Edinburgh examples with clearly simulated schedules. Live-route detours are rerouted through Google and checked against arrival, waiting, visit duration, safety buffer, and budget before acceptance. No predefined event detours exist for demo walks.
- **Failures:** show actionable errors; never silently replace live routing with invented or straight-line paths.

## Route selection

1. Discover up to 20 named, deduplicated places within a time-dependent radius (maximum 3.5 km). Loop combines nearby discovery, three outer areas for longer walks, and separate viewpoint/activity queries, preserving geographic variety. Destination mode samples up to three corridor locations. Queries run sequentially, without a general POI response cache.
2. Loop builds a bounded pool of two/three-stop circuits, routes four initial candidates, and adapts up to two more using measured network walking times. Destination routes may use one interesting stop when time is tight. Geographic distances are shortlist heuristics only.
3. Route at most two candidates concurrently and make at most eight HTTP attempts including limited transient retries. Routing timeout 12 seconds; place timeout 10 seconds.
4. Count rounded-up walking time, planned visits (typically 3–5 minutes based on activity; two minutes for legacy samples), and a buffer of at least two minutes or 10% of walking time. Reject over-budget routes. Loop also rejects totals below 90% of the selected duration. Short fixed demo loops are not offered as long trips.
5. Score scenic proxies 30%, novelty 25%, variety 15%, preference 20%, event relevance 10%; redistribute event weight when absent. Penalise repetitive paths and keep up to three sufficiently distinct stop sets. Loop ranks closeness to the selected total before scenic score.

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

`src/app/actions` validates inputs and returns serialisable results. `src/lib/geo` contains server-side provider calls, candidate generation, and pure scoring helpers. `src/lib/events.ts` exposes a replaceable event-provider function and verified detours. `src/components/map` loads Google Maps and manages markers/polylines. Public `/terms` and `/privacy` explain Google-backed features and local data use.

No accounts, database, separate backend, ORM, AI, or global state library. Only the public map key reaches the browser. Generated route context is temporary process memory, capped at 150 routes and 20 minutes, used only for the active detour flow. It may expire on restart or a different serverless instance; regenerate the walk when needed. Google names, geometry, and photos are not persisted in localStorage; only visited IDs and preferences are saved.

Provider coverage, quotas, steep hills, disconnected paths, opening hours, and walking speed affect results. Fewer than three routes may qualify. This MVP uses interesting waypoints rather than continuously assessing scenery on every street. Request caps are per generation, not distributed abuse protection. Review quotas and the provider terms before a public deployment.
