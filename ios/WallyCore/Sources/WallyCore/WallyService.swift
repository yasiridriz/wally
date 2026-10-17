import Foundation

/// The iOS equivalent of the web Server Actions. It validates input, returns
/// user-facing messages, and keeps generated routes in memory for detours and photos.
public actor WallyService {
  private struct Context {
    var request: GenerateRequest
    var route: WanderRoute
    var createdAt: Date
    var detours: Task<[DetourOption], Never>?
    var photos: Task<[SummaryPhoto], Error>?
  }
  private static let ttl: TimeInterval = 20 * 60
  private let client: GoogleClient
  private let eventProvider: EventProvider
  private var contexts: [String: Context] = [:]
  private var order: [String] = []

  public init(client: GoogleClient, eventProvider: @escaping EventProvider = sampleEventProvider) {
    self.client = client
    self.eventProvider = eventProvider
  }

  public func generateRoutes(_ raw: GenerateRequest) async -> Result<GenerateResponse, WallyError> {
    let ids = raw.visitedIds
    guard isCoordinates(raw.start), raw.mode != .destination || isCoordinates(raw.destination), ids.count <= 500,
          ids.allSatisfy({ !$0.isEmpty && $0.count <= 120 }) else {
      return .failure(WallyError("INVALID_INPUT", "Choose a valid starting point, duration and preferences, then try again."))
    }
    var request = raw
    request.visitedIds = Array(NSOrderedSet(array: ids)) as? [String] ?? ids
    if request.mode != .destination { request.destination = nil }
    if !request.demo, let destination = request.destination {
      let separation = distanceMeters(request.start, destination)
      if separation < 50 { return .failure(WallyError("INVALID_DESTINATION", "Choose a destination at least 50 metres from your start, or try a loop.")) }
      // A generous lower-bound screen prevents requests over implausibly large areas.
      // Any destination is planned: one out of reach in the time gets the direct
      // route, marked over budget, so the user sees how long it really takes.
    }
    if !request.demo && !client.hasKey {
      return .failure(WallyError("MISSING_KEY", "Live walks need a Google Maps API key with Places API (New) and Routes API enabled. Select Demo Mode to try sample Edinburgh walks."))
    }
    do {
      var canonical = request
      if request.demo { canonical.start = demoStart; canonical.destination = request.mode == .destination ? demoDestination : nil }
      let result = request.demo ? generateDemoRoutes(canonical) : try await generateLiveRoutes(client, canonical)
      let routes = result.map { route -> WanderRoute in var copy = route; copy.id = UUID().uuidString; copy.start = canonical.start; return copy }
      register(canonical, routes)
      let ending = request.mode == .destination ? " and finish at the National Museum of Scotland" : ""
      var message: String? = request.demo ? "Sample Edinburgh routes: paths are hand-drawn illustrations and times are unverified estimates. Demo walks use a fixed start at the Meadows\(ending)." : nil
      if request.demo && routes.isEmpty {
        let label = request.mode == .loop ? "loops" : request.mode == .explore ? "Explore routes" : "Targeted routes"
        message = "The fixed demo \(label) do not match a \(request.minutes)-minute trip. Demo routes use a fixed start at the Meadows\(ending). Switch off Demo Mode for a live route near your selected duration."
      } else if routes.first?.overBudget == true {
        message = nil
      } else if routes.count < 3 {
        let found = routes.isEmpty ? "No suitable walks fit this duration. Try another duration or starting point." : "Found \(routes.count) distinct walk\(routes.count == 1 ? "" : "s") near your selected total duration."
        message = [message, found].compactMap { $0 }.joined(separator: " ")
      }
      return .success(GenerateResponse(routes: routes, message: message))
    } catch {
      let message = (error as? LocalizedError)?.errorDescription ?? "The walking or place provider could not complete this request. Try again, choose another start, or select Demo Mode for sample Edinburgh walks."
      return .failure(WallyError("PROVIDER_ERROR", message))
    }
  }

  public func eventDetours(routeId: String) async -> Result<[DetourOption], WallyError> {
    guard !routeId.isEmpty, routeId.count <= 100 else { return .failure(WallyError("INVALID_INPUT", "Select a route before discovering events.")) }
    guard var context = context(routeId) else { return .failure(WallyError("EXPIRED_ROUTE", "This walk has expired. Regenerate routes before checking detours.")) }
    if context.detours == nil {
      let (client, provider, request, route) = (client, eventProvider, context.request, context.route)
      context.detours = Task { await calculateEventDetours(client, request: request, route: route, provider: provider) }
      contexts[routeId] = context
    }
    return .success(await context.detours!.value)
  }

  public func walkSummary(routeId: String) async -> Result<[SummaryPhoto], WallyError> {
    guard !routeId.isEmpty, routeId.count <= 200 else { return .failure(WallyError("INVALID_INPUT", "Select a route before loading its preview.")) }
    let id = baseRouteId(routeId)
    // Only stops of a route this app generated can trigger photo requests.
    guard var context = context(id) else { return .failure(WallyError("EXPIRED_ROUTE", "This walk has expired. Regenerate routes to load photos.")) }
    if context.route.source == .demo { return .success([]) }
    // One shared request per route; a failed attempt is not kept, so a retry can succeed.
    if context.photos == nil {
      let (client, stops) = (client, context.route.stops)
      context.photos = Task { try await summaryPhotos(client, stops: stops) }
      contexts[id] = context
    }
    do { return .success(try await context.photos!.value) }
    catch {
      contexts[id]?.photos = nil
      return .failure(error as? WallyError ?? WallyError("PHOTO_ERROR", "Place photos are unavailable right now."))
    }
  }

  public func searchLocations(query: String, near: Coordinates?) async -> Result<[LocationSearchResult], WallyError> {
    guard normaliseSearchQuery(query) != nil, near == nil || isCoordinates(near) else { return .failure(WallyError("INVALID_INPUT", "Enter a valid place name or address and search again.")) }
    do { return .success(try await searchLocationPlaces(client, query: query, near: near)) }
    catch { return .failure(error as? WallyError ?? WallyError("PROVIDER_ERROR", "Location search is unavailable. Try again or choose a point on the map.")) }
  }

  private func register(_ request: GenerateRequest, _ routes: [WanderRoute]) {
    let now = Date()
    for (id, context) in contexts where now.timeIntervalSince(context.createdAt) > Self.ttl { contexts[id] = nil }
    order.removeAll { contexts[$0] == nil }
    for route in routes { contexts[route.id] = Context(request: request, route: route, createdAt: now); order.append(route.id) }
    while order.count > 150 { contexts[order.removeFirst()] = nil }
  }

  private func context(_ id: String) -> Context? {
    guard let context = contexts[id] else { return nil }
    if Date().timeIntervalSince(context.createdAt) > Self.ttl { contexts[id] = nil; return nil }
    return context
  }
}
