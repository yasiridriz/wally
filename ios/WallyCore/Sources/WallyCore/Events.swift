import Foundation

public typealias EventProvider = @Sendable (Date) async -> [SampleEvent]

// Every schedule below belongs to a fictional demo, never a live listing.
public let sampleEventProvider: EventProvider = { now in
  let start = now.addingTimeInterval(-60 * 60)
  let end = now.addingTimeInterval(3 * 60 * 60)
  return [
    SampleEvent(id: "sample-meadows-sketch", name: "Sample: sketching in the Meadows", location: Coordinates(lat: 55.9429, lng: -3.19045), startTime: start, endTime: end, visitMinutes: 8, category: "art", description: "Fictional outdoor sketching meetup for demonstrating a detour. This is not a real event."),
    SampleEvent(id: "sample-bristo-music", name: "Sample: Bristo Square acoustic set", location: Coordinates(lat: 55.9450, lng: -3.1885), startTime: start, endTime: end, visitMinutes: 10, category: "music", description: "Fictional acoustic performance with simulated times. No performance is confirmed."),
    SampleEvent(id: "sample-history", name: "Sample: Old Town stories", location: Coordinates(lat: 55.9469, lng: -3.1921), startTime: start, endTime: end, visitMinutes: 8, category: "history", description: "Fictional storytelling stop to demonstrate time-aware routing. Not a real listing."),
  ]
}

public struct EventTiming: Equatable, Sendable { public var arrivalTime: Date; public var waitMinutes: Int; public var totalMinutes: Int }

/// Pure timing check. Waiting, a complete visit and the route buffer must fit.
public func evaluateEventTiming(walkingMinutes: Int, stopMinutes: Int, bufferMinutes: Int, arrivalMinutes: Int, event: SampleEvent, departure: Date, budgetMinutes: Int) -> EventTiming? {
  guard [walkingMinutes, stopMinutes, bufferMinutes, arrivalMinutes, event.visitMinutes, budgetMinutes].allSatisfy({ $0 >= 0 }),
        event.endTime > event.startTime, event.visitMinutes > 0 else { return nil }
  let arrives = departure.addingTimeInterval(Double(arrivalMinutes) * 60)
  let waitMinutes = max(0, Int((event.startTime.timeIntervalSince(arrives) / 60).rounded(.up)))
  let finishes = arrives.addingTimeInterval(Double(waitMinutes + event.visitMinutes) * 60)
  let total = walkingMinutes + stopMinutes + bufferMinutes + waitMinutes + event.visitMinutes
  if finishes > event.endTime || total > budgetMinutes { return nil }
  return EventTiming(arrivalTime: arrives, waitMinutes: waitMinutes, totalMinutes: total)
}

private func squaredDistance(_ a: Coordinates, _ b: Coordinates) -> Double {
  pow(a.lat - b.lat, 2) + pow((a.lng - b.lng) * cos(a.lat * .pi / 180), 2)
}

public func calculateEventDetours(_ client: GoogleClient, request: GenerateRequest, route: WanderRoute, provider: EventProvider = sampleEventProvider) async -> [DetourOption] {
  guard request.includeEvents, route.source != .demo else { return [] }
  let departure = Date()
  let events = await provider(departure)
  let nearby = events.map { event in (event, route.geometry.map { squaredDistance(event.location, $0) }.min() ?? .infinity) }
    .filter { $0.1 < pow(0.0045, 2) }.sorted { $0.1 < $1.1 }.prefix(2).map(\.0)
  var options: [DetourOption] = []
  let budget = RoutingBudget(remaining: 2)
  for event in nearby {
    guard await budget.canContinue else { break }
    var waypoints = [request.start] + route.stops.map(\.coordinates)
    if route.isLoop { waypoints.append(request.start) }
    else if request.mode == .destination {
      guard let destination = route.destination ?? request.destination else { continue }
      waypoints.append(destination)
    }
    // Choose one inexpensive geometric insertion, then verify it on the network.
    var insertion = 1
    var cost = Double.infinity
    for index in 1..<waypoints.count {
      let extra = sqrt(squaredDistance(waypoints[index - 1], event.location)) + sqrt(squaredDistance(event.location, waypoints[index])) - sqrt(squaredDistance(waypoints[index - 1], waypoints[index]))
      if extra < cost { cost = extra; insertion = index }
    }
    waypoints.insert(event.location, at: insertion)
    // A failed detour must never invalidate the user's original walk.
    guard let result = try? await routeWalking(client, waypoints, budget: budget), result.segmentSeconds.count == waypoints.count - 1 else { continue }
    let speed = request.pace.speed
    let walkingMinutes = Int((result.durationSeconds / speed / 60).rounded(.up))
    let bufferMinutes = max(2, Int((Double(walkingMinutes) * 0.1).rounded(.up)))
    let arrivalMinutes = Int((result.segmentSeconds.prefix(insertion).reduce(0, +) / speed / 60).rounded(.up)) + estimateStopMinutes(Array(route.stops.prefix(insertion - 1)))
    guard let timing = evaluateEventTiming(walkingMinutes: walkingMinutes, stopMinutes: route.stopMinutes, bufferMinutes: bufferMinutes, arrivalMinutes: arrivalMinutes, event: event, departure: departure, budgetMinutes: request.minutes) else { continue }
    let relevance: Double = request.moods.isEmpty ? 80
      : (request.moods.contains(.historic) && event.category == "history") || (request.moods.contains(.hidden) && ["art", "music"].contains(event.category)) ? 100 : 60
    var modified = route
    modified.event = event
    modified.eventStopIndex = insertion - 1
    modified.id = "\(route.id):\(event.id)"
    modified.name = "\(route.name) + a sample event"
    modified.geometry = result.geometry
    modified.distanceMeters = result.distanceMeters
    modified.walkingMinutes = walkingMinutes
    modified.stopMinutes = route.stopMinutes + event.visitMinutes + timing.waitMinutes
    modified.bufferMinutes = bufferMinutes
    modified.totalMinutes = timing.totalMinutes
    modified.description = "\(route.description) Includes a fictional sample event (\(event.visitMinutes) minutes\(timing.waitMinutes > 0 ? ", plus \(timing.waitMinutes) minutes waiting" : ""))."
    modified.highlights = Array(route.highlights.prefix(2)) + ["Fictional sample event"]
    modified.score = max(0, scorePlaces(route.stops, moods: request.moods, visitedIds: request.visitedIds, eventRelevance: relevance) - repetitionPenalty(result.geometry))
    modified.routingWarnings = result.warnings
    options.append(DetourOption(id: modified.id, event: event, route: modified, additionalMinutes: max(0, modified.totalMinutes - route.totalMinutes),
      additionalDistanceMeters: max(0, modified.distanceMeters - route.distanceMeters), arrivalTime: timing.arrivalTime))
  }
  return options
}
