import Foundation

private func clamp(_ n: Double) -> Double { min(100, max(0, n)) }
private let matches: [Mood: [PlaceCategory]] = [
  .surprise: [.park, .viewpoint, .historic, .art, .attraction, .path],
  .scenic: [.viewpoint, .park, .path], .green: [.park, .path],
  .historic: [.historic], .hidden: [.art, .path],
]

public func preferenceScore(_ place: Place, _ mood: Mood) -> Double {
  mood == .surprise ? 75 : (matches[mood] ?? []).contains(place.category) ? 100 : 30
}

public func scorePlaces(_ stops: [Place], mood: Mood, visitedIds: [String], eventRelevance: Double? = nil) -> Double {
  guard !stops.isEmpty else { return 0 }
  func average(_ fn: (Place) -> Double) -> Double { stops.reduce(0) { $0 + fn($1) } / Double(stops.count) }
  let scenic = average { clamp($0.baseScenicScore) }
  let visited = Set(visitedIds)
  let novelty = average { visited.contains($0.id) ? 15 : ($0.category == .art || $0.category == .path) ? 95 : 80 }
  let variety = min(100, Double(Set(stops.map(\.category)).count) / Double(min(3, stops.count)) * 100)
  let preference = average { preferenceScore($0, mood) }
  let base = scenic * 0.30 + novelty * 0.25 + variety * 0.15 + preference * 0.20
  guard let eventRelevance else { return (base / 0.9).rounded() }
  return (base + clamp(eventRelevance) * 0.10).rounded()
}

public struct Timing: Equatable, Sendable {
  public var walkingMinutes: Int
  public var stopMinutes: Int
  public var bufferMinutes: Int
  public var totalMinutes: Int
}

public func estimateExperience(durationSeconds: Double, stopCount: Int, eventMinutes: Int = 0) -> Timing {
  let walking = Int((durationSeconds / 60).rounded(.up))
  let stops = stopCount * 2
  let buffer = max(2, Int((Double(walking) * 0.1).rounded(.up)))
  return Timing(walkingMinutes: walking, stopMinutes: stops, bufferMinutes: buffer, totalMinutes: walking + stops + buffer + eventMinutes)
}

/// Planned short visits, not claims about admission, opening hours or events.
public func plannedVisitMinutes(_ place: Place) -> Int {
  if let minutes = place.visitMinutes, minutes.isFinite, minutes >= 1, minutes <= 15 { return Int(minutes.rounded(.up)) }
  return 2
}

public func estimateStopMinutes(_ stops: [Place]) -> Int { stops.reduce(0) { $0 + plannedVisitMinutes($1) } }

public func estimateExperienceWithStops(durationSeconds: Double, stops: [Place]) -> Timing {
  var timing = estimateExperience(durationSeconds: durationSeconds, stopCount: 0)
  timing.stopMinutes = estimateStopMinutes(stops)
  timing.totalMinutes = timing.walkingMinutes + timing.stopMinutes + timing.bufferMinutes
  return timing
}

public func fitsTimeBudget(_ totalMinutes: Int, _ budget: Int) -> Bool { totalMinutes > 0 && totalMinutes <= budget }

/// All modes use the same conservative total-trip duration target: 90–100%.
public func durationTimeFit(_ totalMinutes: Int, _ budget: Int) -> Bool {
  fitsTimeBudget(totalMinutes, budget) && Double(totalMinutes) >= (Double(budget) * 0.9).rounded(.up)
}

public func stopOverlap(_ a: [Place], _ b: [Place]) -> Double {
  guard !a.isEmpty, !b.isEmpty else { return 0 }
  let ids = Set(a.map(\.id))
  return Double(b.filter { ids.contains($0.id) }.count) / Double(min(a.count, b.count))
}

public func rankTimeMatchedRoutes(_ routes: [WanderRoute], budget: Int) -> [WanderRoute] {
  let ranked = routes.filter { durationTimeFit($0.totalMinutes, budget) }.sorted { a, b in
    let da = abs(budget - a.totalMinutes), db = abs(budget - b.totalMinutes)
    if da != db { return da < db }
    if a.score != b.score { return a.score > b.score }
    return a.name.localizedCompare(b.name) == .orderedAscending
  }
  var selected: [WanderRoute] = []
  for route in ranked {
    if selected.allSatisfy({ stopOverlap(route.stops, $0.stops) <= 0.5 }) { selected.append(route) }
    if selected.count == 3 { break }
  }
  return selected
}

/// Reversed edges count as repeated too, penalising out-and-back paths.
public func repetitionPenalty(_ geometry: [Coordinates]) -> Double {
  guard geometry.count > 1 else { return 0 }
  var edges = Set<String>()
  var repeated = 0
  func key(_ p: Coordinates) -> String { "\(fixed(p.lng, 4)),\(fixed(p.lat, 4))" }
  for index in 1..<geometry.count {
    let edge = [key(geometry[index - 1]), key(geometry[index])].sorted().joined(separator: ":")
    if edges.contains(edge) { repeated += 1 }
    edges.insert(edge)
  }
  return (20 * Double(repeated) / Double(max(1, geometry.count - 1))).rounded()
}
