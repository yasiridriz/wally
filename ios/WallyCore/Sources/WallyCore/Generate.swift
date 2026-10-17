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

private func discoverRoutePlaces(_ client: GoogleClient, _ request: GenerateRequest) async throws -> [Place] {
  switch request.mode {
  case .loop: return try await discoverLoopPlaces(client, request)
  case .explore: return try await discoverExplorePlaces(client, request)
  case .destination:
    guard let destination = request.destination, isCoordinates(destination) else { throw ProviderError("Choose a destination before finding a scenic route.") }
    // An optimistic straight-line lower bound prevents wasting provider requests
    // when the fixed endpoint cannot fit even before network detours and stops.
    if !fitsTimeBudget(estimateExperience(durationSeconds: distanceMeters(request.start, destination) / 1.5, stopCount: 1).totalMinutes, request.minutes) {
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

public func generateLiveRoutes(_ client: GoogleClient, _ request: GenerateRequest) async throws -> [WanderRoute] {
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

  @Sendable func calculate(_ candidate: ScenicCandidate) async -> Outcome {
    do {
      // Endpoint rules apply to every initial and adaptive request. Provider
      // duration includes the full return leg or selected destination leg.
      let routed = try await routeWalking(client, try routeWaypoints(candidate.stops, request), budget: budget)
      let timing = estimateExperienceWithStops(durationSeconds: routed.durationSeconds, stops: candidate.stops)
      let observation = Observation(seconds: routed.durationSeconds, meters: candidate.geographicMeters, totalMinutes: timing.totalMinutes)
      guard durationTimeFit(timing.totalMinutes, request.minutes) else { return Outcome(observation: observation) }
      let stops = candidate.stops
      let dominant = stops.sorted { a, b in
        let pa = preferenceScore(a, request.mood), pb = preferenceScore(b, request.mood)
        return pa != pb ? pa > pb : a.baseScenicScore > b.baseScenicScore
      }[0]
      let suffix = request.mode == .loop ? "loop" : request.mode == .explore ? "wander" : "scenic route"
      let ending = request.mode == .loop ? ", then walk back to where you started." : request.mode == .explore ? ", finishing somewhere new." : ", then arrive at your chosen destination."
      let route = WanderRoute(id: UUID().uuidString, name: "\(dominant.name) \(suffix)", description: "Discover \(stops.map(\.name).joined(separator: " and "))\(ending)",
        geometry: routed.geometry, stops: stops, distanceMeters: routed.distanceMeters, walkingMinutes: timing.walkingMinutes, stopMinutes: timing.stopMinutes,
        bufferMinutes: timing.bufferMinutes, totalMinutes: timing.totalMinutes,
        score: max(0, scorePlaces(stops, mood: request.mood, visitedIds: request.visitedIds) - repetitionPenalty(routed.geometry)),
        highlights: stops.prefix(3).map(\.name), isLoop: request.mode == .loop, source: .live,
        destination: request.mode == .destination ? request.destination : nil, routingWarnings: routed.warnings)
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
