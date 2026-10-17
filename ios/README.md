# Wally for iOS

A SwiftUI version of the Wally web app. It has the same features, the same Google services, the same texts, and the same visual style. The style follows the mobile web layout. On an iPad wider than 768 points, the planner shows as a side panel, as in the desktop web layout.

## Requirements

- Xcode 26 or later.
- iOS 17 or later.
- Network access for the first build. Xcode downloads the Google Maps SDK for iOS (Swift Package `googlemaps/ios-maps-sdk`, version 11).

## Setup

1. Copy the keys from the web app:

   ```sh
   ios/scripts/sync-secrets.sh
   ```

   The script reads `../.env.local` and writes `ios/Config/Secrets.xcconfig`. It does not print the key values. Git ignores the file. To set the keys by hand, copy `Config/Secrets.example.xcconfig` to `Config/Secrets.xcconfig`.

2. Open `ios/Wally.xcodeproj`. Select the **Wally** scheme and a simulator, then run.

3. To run on a device, set your team in **Signing & Capabilities**. If necessary, change `PRODUCT_BUNDLE_IDENTIFIER` in `Config/Wally.xcconfig`.

| Setting | Copied from `.env.local` | Use |
| --- | --- | --- |
| `WALLY_GOOGLE_MAPS_SDK_KEY` | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | The map (Maps SDK for iOS). |
| `WALLY_GOOGLE_PLACES_ROUTES_KEY` | `GOOGLE_MAPS_API_KEY` | Place discovery, location search, walking routes, and place photos. |
| `WALLY_GOOGLE_MAPS_MAP_ID` | `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Optional map style. |

## Google Cloud changes that the app needs

The copied keys are restricted for the web app, so they can fail on iOS:

- The browser key is restricted to **Maps JavaScript API** and website referrers. The Maps SDK for iOS refuses it, and the map shows no tiles. Create a key for **Maps SDK for iOS**, restrict it to iOS apps with the bundle ID `com.jasir.wally`, and set it as `WALLY_GOOGLE_MAPS_SDK_KEY`.
- The server key works for Places API (New) and Routes API only if it has no IP restriction. If it has an IP restriction, create a key for **Places API (New)** and **Routes API** with an iOS app restriction. The app sends the `X-Ios-Bundle-Identifier` header with each REST request, so this restriction works.
- A map ID is specific to a platform. A JavaScript map ID does not style an iOS map. Create an iOS map ID, or leave the setting empty.

There is no Wally server in the iOS app, so the device calls Google directly. The keys are in the app bundle. Anyone with the app file can read them. Use iOS app restrictions, API restrictions, quotas, and budget alerts. Do not put an unrestricted server key in a release build.

## Features

The iOS app has all the web features:

- Loop, Explore, and Targeted route modes. All modes accept totals from 90% to 100% of the selected duration.
- Automatic current location as the start, with protection against a late location overwriting a start that you selected. You can also search, pick on the map, or use the location button.
- Google Places discovery (a maximum of six requests and 20 places), and Google Routes WALK routing (a maximum of eight attempts and two at the same time).
- Scoring, ranking, demo routes, fictional sample event detours, visited stops, and saved preferences.
- The walk preview flash cards, with a maximum of three Google place photos, and the **Get me to Google Maps** button.
- The terms and privacy pages, as sheets.
- The schematic sample preview when there is no map key.

The texts are the same as the web texts, but texts about the browser and the Wally server now refer to the device.

## Structure

- `WallyCore/` is a Swift package with all the logic. It is a port of `src/lib`. It has no UIKit dependency, so `swift test` runs it on macOS.
  - `Places.swift`, `Routing.swift`, `Search.swift`, and `Photos.swift` call Google through `GoogleClient`. Tests replace the network with a mock `HTTPTransport`.
  - `Candidates.swift`, `Scoring.swift`, `Generate.swift`, `Events.swift`, `DemoData.swift`, and `WalkSummary.swift` contain the same rules as the web app.
  - `WallyService.swift` does the work of the web Server Actions: input checks, user messages, and a route memory for 20 minutes (a maximum of 150 routes) for detours and photos.
- `Wally/` is the SwiftUI app.
  - `AppModel.swift` contains the state and actions of `wally-app.tsx`, with the same version counters for stale responses.
  - `Theme.swift` contains the colours and font sizes from `globals.css`. Arial at weight 600 or more shows as Arial Bold, as in the browser.
  - `WanderMapView.swift` wraps the Google Maps SDK. `SampleRoutePreview.swift` draws the schematic.

The project uses folder-synchronised groups. Add a Swift file to `Wally/` and Xcode includes it. Do not add file entries to `project.pbxproj`.

## Data storage

- Preferences and visited stop IDs are in `UserDefaults`, with the same keys as the web app (`wally:preferences:v1` and `wally:visited:v1`). Demo Mode is not saved.
- Google responses use an ephemeral URL session without a response cache. Photo images also use an ephemeral session. The app does not write Google content to disk.

## Checks

```sh
cd ios/WallyCore && swift test
cd ios && xcodebuild -project Wally.xcodeproj -scheme Wally -destination 'generic/platform=iOS Simulator' build
```

The core tests use mocks. They make no Google requests.

### Debug launch options

Debug builds accept these launch arguments for screenshot checks. Release builds ignore them.

| Argument | Effect |
| --- | --- |
| `-WallyAutoGenerate YES` | Runs one route search after the automatic location sets the start. This makes live Google requests. |
| `-WallyScrollTo summary` | After a search, scrolls to the walk preview instead of the results heading. |
| `-WallySummaryCard 1` | Opens the walk preview on the first stop card. |

Example: `xcrun simctl launch booted com.jasir.wally -WallyAutoGenerate YES -WallyScrollTo summary`.

## Path history and reviews

Tapped routes are kept in path history (`UserDefaults`, key `wally:history:v1`); the next search penalises routes similar to ones you opened (`WallyCore/Memory.swift`, the same weights as `src/lib/memory.ts`). The clock button in the header opens History, where routes can be rated 1–5 stars or favourited; the selected route has the same controls above its stops. The **Favourites** toggle in the planner adds favourite stops to discovery and strongly prefers favourite routes. Reviews of live routes are appended to `Application Support/Wally/reviews.jsonl` in the web store's version-1 format (`WallyCore/Reviews.swift`), ready to export or upload. The app has no server, so `GenerateRequest.ratings` (everyone's averages) stays empty until a review source is connected.

## Long walks, loops and far destinations

Durations are any whole minute from 5 to 480 (`WalkDuration`), set with the presets or the ±5 buttons; discovery grows with the time up to the 50 km Places limit. Loops that would come home over their own outbound path are routed once more through a pass-through return point (`returnViaPoint`). A destination that cannot be reached in the time returns the direct route marked `overBudget`, drawn with a red outline, with the extra minutes in red and a red notice above the results.
