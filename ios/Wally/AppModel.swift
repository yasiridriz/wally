import Foundation
import Observation
import WallyCore

enum PickTarget { case start, destination }
struct PhotoState { var photos: [SummaryPhoto]; var error: String? }

/// State and actions from `src/components/wally-app.tsx`. Version counters stop
/// stale responses and location callbacks from overwriting newer choices.
@MainActor @Observable
final class AppModel {
  static let edinburghCenter = Coordinates(lat: 55.9533, lng: -3.1883)
  let hasLiveSetup = AppConfig.hasLiveSetup
  let hasMapKey = AppConfig.mapsSDKKey != nil
  private let service = WallyService(client: GoogleClient(apiKey: AppConfig.placesRoutesKey, bundleIdentifier: AppConfig.bundleIdentifier))
  private let locationProvider = LocationProvider()
  private let defaults = UserDefaults.standard

  var preferences: Preferences
  var start = AppModel.edinburghCenter
  var startSelected = false
  var startName = ""
  var startAddress = ""
  var destination: Coordinates?
  var destinationName = ""
  var destinationAddress = ""
  var pickingTarget: PickTarget = .start
  var routes: [WanderRoute] = []
  var selected: WanderRoute?
  var visited: [String] = []
  /// Path history: routes the user opened, with their reviews. Device-only.
  var history: [HistoryEntry] = []
  var favouriteCount: Int { history.filter(\.favourite).count }
  /// Reviews of live routes, as JSON Lines in Application Support, ready to export or upload.
  private let reviewStore = ReviewStore(file: (FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory)
    .appendingPathComponent("Wally", isDirectory: true).appendingPathComponent("reviews.jsonl"))
  var loading = false
  var locating = false
  var error = ""
  var message = ""
  var detours: [DetourOption] = []
  var detourLoading = false
  var detourError = ""
  var preview: DetourOption?
  var acceptedDetour: DetourOption?
  var mobileExpanded = true
  var scrollToResults = 0
  /// Scroll anchor after a search. Debug screenshots can pass `-WallyScrollTo summary`.
  var scrollTarget: String {
    #if DEBUG
    if let target = UserDefaults.standard.string(forKey: "WallyScrollTo") { return target }
    #endif
    return "results"
  }
  var photoStates: [String: PhotoState] = [:]
  private var requestedPhotos = Set<String>()
  private var requestVersion = 0
  private var detourVersion = 0
  private var startSelectionVersion = 0
  private var autoLocationRequested = false

  init() {
    preferences = Preferences.restore(UserDefaults.standard.data(forKey: "wally:preferences:v1"), hasLiveSetup: AppConfig.hasLiveSetup)
    if let data = defaults.data(forKey: "wally:visited:v1"), let stored = try? JSONDecoder().decode([String].self, from: data) { visited = Array(stored.prefix(500)) }
    if let data = defaults.data(forKey: "wally:history:v1"), let stored = try? JSONDecoder().decode([HistoryEntry].self, from: data) { history = Array(stored.prefix(historyLimit)) }
  }

  var effectiveStart: Coordinates { preferences.demo ? demoStart : start }
  var effectiveDestination: Coordinates? { preferences.demo ? demoDestination : destination }
  var effectiveStartSelected: Bool { preferences.demo || startSelected }
  var shownRoute: WanderRoute? { preview?.route ?? selected }
  var shownRoutes: [WanderRoute] {
    guard let preview, let selected else { return routes }
    return routes.map { $0.id == selected.id ? preview.route : $0 }
  }
  var locationLabel: String { preferences.demo ? "Edinburgh · sample starting point" : startSelected ? (startName.isEmpty ? coordinateLabel(start) : startName) : locating ? "Finding your current location…" : "Choose a starting point" }
  var destinationLabel: String { preferences.demo ? "National Museum of Scotland · sample" : destination.map { destinationName.isEmpty ? coordinateLabel($0) : destinationName } ?? "Choose your destination" }
  var canGenerate: Bool { !loading && effectiveStartSelected && (preferences.mode != .destination || effectiveDestination != nil) }
  var mapCaption: String? {
    if preview != nil { return "DETOUR PREVIEW" }
    if selected?.source == .demo { return "SAMPLE ROUTE · UNVERIFIED PATH" }
    if selected == nil && !preferences.demo { return pickingTarget == .destination && preferences.mode == .destination ? "TAP TO SET DESTINATION" : "TAP TO SET START" }
    return nil
  }

  func coordinateLabel(_ value: Coordinates) -> String { String(format: "%.4f°, %.4f°", value.lat, value.lng) }

  // MARK: Location

  func requestAutomaticLocation() {
    guard hasLiveSetup, !preferences.demo, !autoLocationRequested else { return }
    autoLocationRequested = true
    let version = startSelectionVersion
    locating = true
    Task {
      do {
        let coordinate = try await locationProvider.currentLocation()
        guard version == startSelectionVersion else { return }
        locating = false
        if preferences.demo || startSelected { return }
        changeStart(Coordinates(lat: coordinate.latitude, lng: coordinate.longitude), name: "Your current location")
        #if DEBUG
        // Screenshot checks only: `-WallyAutoGenerate YES` runs one search after the automatic start.
        if UserDefaults.standard.bool(forKey: "WallyAutoGenerate") { generate() }
        #endif
      } catch {
        guard version == startSelectionVersion else { return }
        locating = false
        if preferences.demo || startSelected { return }
        self.error = "We couldn’t use your current location. Search for a starting place, pick one on the map, or allow location access and try the location button."
      }
    }
  }

  func locate() {
    startSelectionVersion += 1
    let version = startSelectionVersion
    locating = true
    Task {
      do {
        let coordinate = try await locationProvider.currentLocation()
        guard version == startSelectionVersion else { return }
        changeStart(Coordinates(lat: coordinate.latitude, lng: coordinate.longitude), name: "Your current location")
      } catch {
        guard version == startSelectionVersion else { return }
        locating = false
        self.error = "We couldn’t find your location. Allow location access, search for a place, or tap the map to choose a start."
      }
    }
  }

  // MARK: Choices

  func clearResults() {
    requestVersion += 1; detourVersion += 1; detourLoading = false
    routes = []; selected = nil; detours = []; preview = nil; acceptedDetour = nil
    error = ""; message = ""; detourError = ""
    photoStates = [:]; requestedPhotos = []
  }

  func changePreferences(_ value: Preferences) {
    clearResults()
    let previous = preferences
    preferences = value
    if value.demo && !previous.demo { startSelectionVersion += 1; locating = false }
    if value.mode != .destination { pickingTarget = .start }
    else if previous.mode != .destination { pickingTarget = startSelected ? .destination : .start }
    defaults.set(value.persistable(), forKey: "wally:preferences:v1")
  }

  func changeMapLocation(_ value: Coordinates) {
    guard !loading, !preferences.demo else { return }
    if pickingTarget == .destination && preferences.mode == .destination {
      clearResults(); destination = value; destinationName = coordinateLabel(value); destinationAddress = ""
    } else { changeStart(value, name: coordinateLabel(value)) }
    mobileExpanded = true
  }

  func changeStart(_ value: Coordinates, name: String, address: String = "") {
    guard !loading, !preferences.demo else { return }
    startSelectionVersion += 1; locating = false
    clearResults(); start = value; startSelected = true; startName = name; startAddress = address
    if preferences.mode == .destination && destination == nil { pickingTarget = .destination }
  }

  func chooseSearchLocation(_ target: PickTarget, _ result: LocationSearchResult) {
    guard !loading, !preferences.demo else { return }
    if target == .start { changeStart(result.coordinates, name: result.name, address: result.address) }
    else { clearResults(); destination = result.coordinates; destinationName = result.name; destinationAddress = result.address }
  }

  func clearLocation(_ target: PickTarget) {
    clearResults()
    if target == .start { startSelectionVersion += 1; locating = false; startSelected = false; startName = ""; startAddress = ""; pickingTarget = .start }
    else { destination = nil; destinationName = ""; destinationAddress = ""; pickingTarget = .destination }
  }

  func pick(_ target: PickTarget) { pickingTarget = target; mobileExpanded = false }

  func visit(_ id: String) {
    visited = visited.contains(id) ? visited.filter { $0 != id } : Array((visited + [id]).suffix(500))
    if let data = try? JSONEncoder().encode(visited) { defaults.set(data, forKey: "wally:visited:v1") }
  }

  func search(_ query: String) async -> Result<[LocationSearchResult], WallyError> {
    await service.searchLocations(query: query, near: start)
  }

  // MARK: Routes

  func generate() {
    guard canGenerate else { return }
    clearResults()
    let version = requestVersion
    loading = true; mobileExpanded = true
    var request = GenerateRequest(start: effectiveStart, duration: preferences.duration, moods: preferences.moods, mode: preferences.mode, pace: preferences.pace, visitedIds: visited,
      includeEvents: preferences.includeEvents, demo: preferences.demo, destination: preferences.mode == .destination ? effectiveDestination : nil)
    request.memory = memoryHints(history)
    request.favourites = preferences.favourites
    if preferences.favourites && !preferences.demo { request.favouritePlaces = favouritePlaces(history) }
    Task {
      let result = await service.generateRoutes(request)
      guard version == requestVersion else { return }
      loading = false
      switch result {
      case .success(let response):
        routes = response.routes; selected = response.routes.first; message = response.message ?? ""
        if let first = response.routes.first { loadPhotos(first) }
        scrollToResults += 1
      case .failure(let failure): error = failure.message
      }
    }
  }

  func selectRoute(_ route: WanderRoute) {
    // Every tap counts, including the route that was preselected. A direct
    // over-budget route has no stops to remember.
    if preview == nil && !route.stops.isEmpty && !route.overBudget { remember(route) }
    detourVersion += 1; detourLoading = false
    selected = route; detours = []; preview = nil; acceptedDetour = nil; detourError = ""
    loadPhotos(route)
  }

  /// Photos load only for a selected live route, once per base route.
  func loadPhotos(_ route: WanderRoute) {
    let id = baseRouteId(route.id)
    guard route.source == .live, summaryStops(route.stops).contains(where: { $0.photo != nil }), !requestedPhotos.contains(id) else { return }
    requestedPhotos.insert(id)
    Task {
      let result = await service.walkSummary(routeId: id)
      guard requestedPhotos.contains(id) else { return }
      switch result {
      case .success(let photos): photoStates[id] = PhotoState(photos: photos)
      case .failure(let failure): photoStates[id] = PhotoState(photos: [], error: failure.message)
      }
    }
  }

  func findDetours() {
    guard let selected, !detourLoading else { return }
    detourVersion += 1
    let version = detourVersion
    detourLoading = true; detourError = ""; detours = []
    Task {
      let result = await service.eventDetours(routeId: selected.id)
      guard version == detourVersion else { return }
      detourLoading = false
      switch result {
      case .success(let options):
        detours = options
        if options.isEmpty { detourError = selected.source == .demo ? "No predefined sample event detours are configured for this demo walk. Switch to Live Mode to check real walking detours to fictional example events." : "No sample event detours fit this walk and its remaining time. Try a longer walk." }
      case .failure(let failure): detourError = failure.message
      }
    }
  }

  // MARK: Path history

  private func saveHistory(_ next: [HistoryEntry]) {
    history = Array(next.prefix(historyLimit))
    if let data = try? JSONEncoder().encode(history) { defaults.set(data, forKey: "wally:history:v1") }
  }

  func historyEntry(for route: WanderRoute) -> HistoryEntry? { history.first { $0.matches(route, mode: preferences.mode) } }

  /// A tapped route joins the top of history. Opening the same stops again refreshes that entry and keeps its review.
  @discardableResult func remember(_ route: WanderRoute) -> HistoryEntry {
    let existing = historyEntry(for: route)
    let entry = HistoryEntry(id: existing?.id ?? UUID().uuidString, route: route, mode: preferences.mode, pace: preferences.pace, moods: preferences.moods,
      duration: preferences.duration.rawValue, rating: existing?.rating, favourite: existing?.favourite ?? false)
    saveHistory([entry] + history.filter { $0.id != entry.id })
    return entry
  }

  /// Saves a review; live reviews are also appended to the review store for future ranking.
  private func review(_ entry: HistoryEntry) {
    saveHistory(history.contains { $0.id == entry.id } ? history.map { $0.id == entry.id ? entry : $0 } : [entry] + history)
    guard let record = ReviewRecord(entry) else { return }
    let store = reviewStore
    Task.detached { try? await store.append(record) }
  }

  /// Tapping the current star again clears the rating.
  func rate(_ id: String, _ rating: Int) {
    guard var entry = history.first(where: { $0.id == id }) else { return }
    entry.rating = entry.rating == rating ? nil : rating
    review(entry)
  }

  func toggleFavourite(_ id: String) {
    guard var entry = history.first(where: { $0.id == id }) else { return }
    entry.favourite.toggle()
    review(entry)
  }

  /// Reviews a route on screen, adding it to history first if it was never tapped.
  func rateRoute(_ route: WanderRoute, _ rating: Int) {
    guard !route.stops.isEmpty, !route.overBudget else { return }
    rate((historyEntry(for: route) ?? remember(route)).id, rating)
  }
  func toggleRouteFavourite(_ route: WanderRoute) {
    guard !route.stops.isEmpty, !route.overBudget else { return }
    toggleFavourite((historyEntry(for: route) ?? remember(route)).id)
  }

  func removeHistory(_ id: String) { saveHistory(history.filter { $0.id != id }) }
  func clearHistory() { saveHistory([]) }

  func acceptDetour() {
    guard let preview, let selected else { return }
    routes = routes.map { $0.id == selected.id ? preview.route : $0 }
    self.selected = preview.route; acceptedDetour = preview; self.preview = nil; detours = []
  }
}
