# Wally

**Take the scenic route to nowhere.** A map-first walking discovery MVP built with Next.js App Router, TypeScript, Tailwind, React Leaflet, and OpenStreetMap.

## Run

Requires Node.js 20.19+ or 22.12+ (Node 22 recommended).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. No credentials are needed for **Demo Mode**, which is selected by default when a routing key is missing. To generate live pedestrian routes, put your OpenRouteService key in `.env.local`:

```dotenv
OPENROUTESERVICE_API_KEY=your_key_here
```

The key stays on the server. There are no `NEXT_PUBLIC_` secrets, database, accounts, or separate backend.

## Try it

Choose a duration, mood, and Loop or Explore, then press **Take me somewhere**. Select a route to inspect its stops, estimated timing, and map path. Mark discoveries as visited to influence future novelty scores. Preferences and visited IDs are stored only in your browser.

For live walks, disable Demo Mode and click the map or use geolocation to set a start anywhere the providers support. A loop returns to its starting point; Explore finishes at its last stop. Increasing the budget permits longer routes but does not guarantee the walk uses every available minute.

## Live and sample data

- **Live:** OpenStreetMap tiles, Overpass named nearby places, and OpenRouteService `foot-walking` geometry, distance, and duration. HTTP requests for places and routing run in server-only modules through Server Actions.
- **Demo routes:** checked-in Edinburgh GeoJSON illustrations following approximate streets and park paths, with known example places. Their paths and times are **unverified sample estimates**, not live directions. Demo Mode explicitly uses a fixed Meadows starting point. It requires no routing/POI service, but map tiles still need internet.
- **Events:** every event is fictional, with simulated schedules relative to discovery time. None is advertised as a real happening. Event discovery is an optional explicit action after route generation. On live routes, up to two nearby sample-event insertions are routed through the pedestrian network and checked against arrival, waiting, visit duration, and total budget. The preview displays the modified geometry and time before acceptance. Demo routes do not currently include event detours.
- **Provider failure:** live errors are displayed and offer a switch to Demo Mode. Live routes are never replaced silently with straight-line paths.

## How routes work

1. Discover up to 20 named, deduplicated OSM places in a time-dependent radius (maximum 3.5 km).
2. Use geographic distance and preferences to shortlist at most six combinations. Straight-line distances are only shortlist heuristics.
3. Route candidates with at most two concurrent calls and eight total routing attempts, including limited transient retries. A routing call times out after 12 seconds; place discovery after 18 seconds.
4. Count rounded-up walking time, two minutes at each stop, and a safety buffer of at least two minutes or 10% of walking time. Reject routes over budget.
5. Rank scenic proxies (30%), novelty (25%), variety (15%), mood match (20%), and event relevance (10%). With no included event, redistribute that weight proportionally. Penalise repeated path segments and return up to three sufficiently distinct walks.

Scenic scores describe rough OSM category proxies, not an objective beauty assessment. Visited places receive lower novelty. Accepted sample-event variants include a category-based event relevance score; base routes redistribute this weight.

## Checks

```sh
npm run test
npm run typecheck
npm run lint
npm run build
npm start
```

Unit and mocked-provider tests cover timing, scoring, route diversity, event feasibility, coordinate ordering, API failures, and input validation. A real end-to-end routing check requires your key and network access.

The production build uses Next.js's supported Webpack option so it also works in sandboxes that prohibit the local sockets used by Turbopack's build worker. Development uses the default Next.js bundler.

## Project layout

`src/app/actions` validates public inputs and returns serialisable results. `src/lib/geo` contains coordinate helpers, provider calls, scoring, and generation. `src/lib/events.ts` provides sample events and server-verified detours; replace its `EventProvider` function to integrate real listings. `src/lib/demo-data.ts` holds sample fixtures. `src/components` owns the map and local UI state.

## MVP limitations

OSM coverage, provider quotas, disconnected paths, steep hills, opening hours, and walking speed can affect results. Timing is an estimate, not a guarantee of access or terrain suitability. Fewer than three walks can be returned when the budget, mapped places, or diversity rules limit candidates. Mood influences selection and scoring; this MVP does not score every street or optimise scenic value continuously along a route.

POI caching and canonical route context use bounded process memory. Context expires after 20 minutes and may disappear on restart or on a different serverless instance; regenerate a walk if a detour context expires. Request caps apply per generation, not as distributed account-level rate limits. Deploy behind suitable abuse controls before opening a shared API key to a large public audience.

Map tiles use the standard OpenStreetMap tile endpoint, visible attribution, and normal browser caching. No bulk download or offline tile prefetching is performed. Data © OpenStreetMap contributors, ODbL; see https://www.openstreetmap.org/copyright. Walking routes are provided by https://openrouteservice.org/.
