import Foundation

func routeWaypoints(_ stops: [Place], _ request: GenerateRequest) throws -> [Coordinates] {
  let points = stops.map(\.coordinates)
  switch request.mode {
  case .destination:
    guard let destination = request.destination, isCoordinates(destination) else { throw ProviderError("Choose a destination before finding a scenic route.") }
    return [request.start] + points + [destination]
  case .loop: return [request.start] + points + [request.start]
  case .explore: return [request.start] + points
  }
}

/// Favourite stops the walk could reach, by the same areas discovery searches.
private func reachable(_ request: GenerateRequest) -> (Place) -> Bool {
  let speed = request.pace.speed
  if request.mode == .destination, let destination = request.destination {
    let envelope = max(350, Double(request.minutes - 5) * 80 * speed)
    return { distanceMeters(request.start, $0.coordinates) + distanceMeters($0.coordinates, destination) <= envelope }
  }
  let radius = searchRadius(request.minutes, isLoop: request.mode == .loop, speed: speed)
  return { distanceMeters(request.start, $0.coordinates) <= radius }
}

private func discoverRoutePlaces(_ client: GoogleClient, _ request: GenerateRequest) async throws -> [Place] {
  withFavouritePlaces(try await discoverNearbyPlaces(client, request), request, reachable: reachable(request))
}

private func discoverNearbyPlaces(_ client: GoogleClient, _ request: GenerateRequest) async throws -> [Place] {
  switch request.mode {
  case .loop: return try await discoverLoopPlaces(client, request)
  case .explore: return try await discoverExplorePlaces(client, request)
  case .destination:
    guard let destination = request.destination, isCoordinates(destination) else { throw ProviderError("Choose a destination before finding a scenic route.") }
    // An optimistic straight-line lower bound prevents wasting provider requests
    // when the fixed endpoint cannot fit even before network detours and stops.
    if !fitsTimeBudget(estimateExperience(durationSeconds: distanceMeters(request.start, destination) / 1.5 / request.pace.speed, stopCount: 1).totalMinutes, request.minutes) {
      throw ProviderError("Your destination is too far away for this time budget. Choose a closer destination or a longer walk.")
    }
    return try await discoverTargetedPlaces(client, request)
  }
}

private struct Observation { var seconds: Double; var meters: Double; var totalMinutes: Int }
private struct Outcome { var observation: Observation?; var route: WanderRoute?; var error: Error? }

/// Hands each initial candidate to exactly one of the two workers.
private actor CandidateQueue {
  private var items: [ScenicCandidate]
  init(_ items: [ScenicCandidate]) { self.items = items }
  func next() -> ScenicCandidate? { items.isEmpty ? nil : items.removeFirst() }
}

/// A loop that walks back over more than this share of its own path gets a different way home.
public let loopRetraceLimit = 0.12

/// A pass-through point that pulls the way home off the outbound path: beside
/// the straight line from the last stop to the start, on the side away from the
/// other stops (where the outbound path runs).
public func returnViaPoint(_ stops: [Place], _ start: Coordinates) -> Coordinates? {
  guard let last = stops.last else { return nil }
  let leg = distanceMeters(last.coordinates, start)
  guard leg >= 150 else { return nil }
  let scale = cos(start.lat * .pi / 180)
  func xy(_ p: Coordinates) -> (x: Double, y: Double) { ((p.lng - start.lng) * scale, p.lat - start.lat) }
  let a = xy(last.coordinates)
  let outbound = stops.count > 1 ? Array(stops.dropLast()) : [last]
  let points = outbound.map { xy($0.coordinates) }
  let centroid = (x: points.reduce(0) { $0 + $1.x } / Double(points.count), y: points.reduce(0) { $0 + $1.y } / Double(points.count))
  // Normal to the return leg; flip it away from the outbound stops.
  var normal = (x: -a.y, y: a.x)
  if normal.x * (centroid.x - a.x / 2) + normal.y * (centroid.y - a.y / 2) > 0 { normal = (-normal.x, -normal.y) }
  let bearing = (atan2(normal.x, normal.y) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
  let midpoint = Coordinates(lat: (last.lat + start.lat) / 2, lng: (last.lng + start.lng) / 2)
  return offset(midpoint, meters: min(600, max(120, leg * 0.35)), degrees: bearing)
}

/// The direct way to the destination with no stops. Used only when no walk fits
/// the time, so the user can still see the path and how much longer it takes.
public func directRoute(_ client: GoogleClient, _ request: GenerateRequest) async throws -> WanderRoute {
  guard request.mode == .destination, let destination = request.destination, isCoordinates(destination) else { throw ProviderError("Choose a destination before finding a route.") }
  // A separate, small allowance: the planner's own attempts may already be spent.
  let routed = try await routeWalking(client, [request.start, destination], budget: RoutingBudget(remaining: 2))
  let timing = estimateExperienceWithStops(durationSeconds: routed.durationSeconds / request.pace.speed, stops: [])
  var route = WanderRoute(id: UUID().uuidString, name: "Direct route to your destination",
    description: "The most direct \(request.pace == .run ? "run" : "walk") to your destination takes about \(timing.totalMinutes) minutes, more than your \(request.minutes)-minute budget.",
    geometry: routed.geometry, stops: [], distanceMeters: routed.distanceMeters, walkingMinutes: timing.walkingMinutes, stopMinutes: timing.stopMinutes,
    bufferMinutes: timing.bufferMinutes, totalMinutes: timing.totalMinutes, score: 0, highlights: [], isLoop: false, source: .live,
    destination: destination, routingWarnings: routed.warnings)
  route.overBudget = true
  return route
}

/// Plans walks. When a destination cannot be reached in the chosen time, the
/// direct route comes back marked `overBudget` instead of an error.
public func generateLiveRoutes(_ client: GoogleClient, _ request: GenerateRequest) async throws -> [WanderRoute] {
  guard request.mode == .destination else { return try await planRoutes(client, request) }
  do {
    return try await planRoutes(client, request)
  } catch {
    // A direct route within budget means the failure was something else; keep its explanation.
    if let direct = try? await directRoute(client, request), direct.totalMinutes > request.minutes { return [direct] }
    throw error
  }
}

private func planRoutes(_ client: GoogleClient, _ request: GenerateRequest) async throws -> [WanderRoute] {
  let places = try await discoverRoutePlaces(client, request)
  if places.count < (request.mode == .destination ? 1 : 2) {
    throw ProviderError(request.mode == .destination ? "No interesting mapped stops were found toward your destination. Try a different destination or a longer walk." : "Not enough mapped places nearby. Try a different start, a longer walk, or Demo Mode.")
  }
  let pool = candidatePool(places, request)
  let modeName = request.mode == .loop ? "loop" : request.mode == .explore ? "Explore walk" : "Targeted walk"
  if pool.isEmpty { throw ProviderError("No \(modeName) close to \(request.minutes) minutes could be planned from nearby scenic stops. Try another start or duration.") }
  let budget = RoutingBudget(remaining: 8)
  var attempted: [ScenicCandidate] = []
  var routes: [WanderRoute] = []
  var observed: [Observation] = []
  var lastError: Error?

  /// Loops that come home the way they went out are routed again through a return via point.
  @Sendable func loopAwareRoute(_ stops: [Place]) async throws -> WalkingResult {
    let waypoints = try routeWaypoints(stops, request)
    let routed = try await routeWalking(client, waypoints, budget: budget)
    guard request.mode == .loop, retraceShare(routed.geometry) > loopRetraceLimit, await budget.canContinue,
          let via = returnViaPoint(stops, request.start) else { return routed }
    guard let alternative = try? await routeWalking(client, Array(waypoints.dropLast()) + [via, request.start], via: [waypoints.count - 1], budget: budget) else { return routed }
    func fits(_ result: WalkingResult) -> Bool {
      durationTimeFit(estimateExperienceWithStops(durationSeconds: result.durationSeconds / request.pace.speed, stops: stops).totalMinutes, request.minutes)
    }
    // Prefer the different way home unless it breaks a time fit the original had.
    return retraceShare(alternative.geometry) < retraceShare(routed.geometry) && (fits(alternative) || !fits(routed)) ? alternative : routed
  }

  @Sendable func calculate(_ candidate: ScenicCandidate) async -> Outcome {
    do {
      // Endpoint rules apply to every initial and adaptive request. Provider
      // duration includes the full return leg or selected destination leg.
      let routed = try await loopAwareRoute(candidate.stops)
      // The provider times a walk; running covers the same path faster.
      let timing = estimateExperienceWithStops(durationSeconds: routed.durationSeconds / request.pace.speed, stops: candidate.stops)
      let observation = Observation(seconds: routed.durationSeconds, meters: candidate.geographicMeters, totalMinutes: timing.totalMinutes)
      guard durationTimeFit(timing.totalMinutes, request.minutes) else { return Outcome(observation: observation) }
      let stops = candidate.stops
      let dominant = stops.sorted { a, b in
        let pa = preferenceScore(a, request.moods), pb = preferenceScore(b, request.moods)
        return pa != pb ? pa > pb : a.baseScenicScore > b.baseScenicScore
      }[0]
      let suffix = request.mode == .loop ? "loop" : request.mode == .explore ? "wander" : "scenic route"
      let ending = request.mode == .loop ? ", then walk back to where you started." : request.mode == .explore ? ", finishing somewhere new." : ", then arrive at your chosen destination."
      let scored = scoreWithMemory(stops, request, penalty: repetitionPenalty(routed.geometry))
      var route = WanderRoute(id: UUID().uuidString, name: "\(dominant.name) \(suffix)", description: "Discover \(stops.map(\.name).joined(separator: " and "))\(ending)",
        geometry: routed.geometry, stops: stops, distanceMeters: routed.distanceMeters, walkingMinutes: timing.walkingMinutes, stopMinutes: timing.stopMinutes,
        bufferMinutes: timing.bufferMinutes, totalMinutes: timing.totalMinutes,
        score: scored.score,
        highlights: stops.prefix(3).map(\.name), isLoop: request.mode == .loop, source: .live,
        destination: request.mode == .destination ? request.destination : nil, routingWarnings: routed.warnings)
      route.memoryScore = scored.memory
      return Outcome(observation: observation, route: route)
    } catch { return Outcome(error: error) }
  }
  func apply(_ outcome: Outcome) {
    if let observation = outcome.observation { observed.append(observation) }
    if let route = outcome.route { routes.append(route) }
    if let error = outcome.error { lastError = error }
  }

  var initial: [ScenicCandidate] = []
  for target in [0.97, 0.90, 1.04, 0.97] {
    if let candidate = chooseCandidate(pool, request, selected: initial, targetFraction: target) { initial.append(candidate) }
  }
  // Two workers: at most two routing requests run at the same time.
  let queue = CandidateQueue(initial)
  let results = await withTaskGroup(of: [(ScenicCandidate, Outcome)].self) { group in
    for _ in 0..<2 {
      group.addTask {
        var done: [(ScenicCandidate, Outcome)] = []
        while await budget.canContinue, let candidate = await queue.next() { done.append((candidate, await calculate(candidate))) }
        return done
      }
    }
    var all: [(ScenicCandidate, Outcome)] = []
    for await batch in group { all += batch }
    return all
  }
  for (candidate, outcome) in results { attempted.append(candidate); apply(outcome) }

  // Measured network timing selects two untried combinations. The same bounded
  // calibration applies to all modes; no waiting time is invented to fill a budget.
  for _ in 0..<2 {
    guard await budget.canContinue else { break }
    let ratios = observed.map { $0.seconds / $0.meters }.filter { $0.isFinite && $0 > 0 }.sorted()
    let secondsPerMeter = ratios.isEmpty ? 1 : ratios[ratios.count / 2]
    guard let candidate = chooseCandidate(pool, request, selected: attempted, secondsPerMeter: secondsPerMeter) else { break }
    attempted.append(candidate)
    apply(await calculate(candidate))
  }
  if routes.isEmpty {
    if observed.isEmpty, let lastError { throw lastError }
    let totals = observed.map(\.totalMinutes).sorted()
    let verifiedLabel = request.mode == .loop ? "loops" : "\(request.mode == .explore ? "Explore" : "Targeted") walks"
    let detail = totals.isEmpty ? "" : " Verified \(verifiedLabel) ranged from \(totals[0]) to \(totals[totals.count - 1]) minutes."
    throw ProviderError("No \(modeName) close to \(request.minutes) minutes fits your budget.\(detail) Try another start or duration.")
  }
  return rankTimeMatchedRoutes(routes, budget: request.minutes)
}
