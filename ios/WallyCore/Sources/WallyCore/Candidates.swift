import Foundation

public struct ScenicCandidate: Hashable, Sendable {
  public var stops: [Place]
  public var geographicMeters: Double
  public var key: String
  public var spread: Double
}

private func candidateKey(_ stops: [Place]) -> String { stops.map(\.id).sorted().joined(separator: "|") }
private func tooClose(_ stops: [Place]) -> Bool {
  for (index, place) in stops.enumerated() where stops[(index + 1)...].contains(where: { distanceMeters(place.coordinates, $0.coordinates) < 80 }) { return true }
  return false
}

private func loopBearing(_ point: Place, _ start: Coordinates) -> Double {
  atan2((point.lng - start.lng) * cos(start.lat * .pi / 180), point.lat - start.lat)
}

private func orderLoop(_ stops: [Place], _ start: Coordinates) -> [Place] {
  let angular = stops.sorted { loopBearing($0, start) < loopBearing($1, start) }
  // Compare only cyclic rotations of one angular ordering, never all permutations.
  let rotations = angular.indices.map { Array(angular[$0...] + angular[..<$0]) }
  func length(_ order: [Place]) -> Double { pathDistance([start] + order.map(\.coordinates) + [start]) }
  return rotations.min { length($0) < length($1) } ?? angular
}

public func loopCandidatePool(_ places: [Place], _ request: GenerateRequest) -> [ScenicCandidate] {
  let available = shortlistForMoods(places.filter { distanceMeters(request.start, $0.coordinates) > 50 }, request.moods)
  var pool: [ScenicCandidate] = []
  var seen = Set<String>()
  func add(_ stops: [Place]) {
    if tooClose(stops) { return }
    let key = candidateKey(stops)
    if seen.contains(key) { return }
    seen.insert(key)
    let ordered = orderLoop(stops, request.start)
    let geographicMeters = pathDistance([request.start] + ordered.map(\.coordinates) + [request.start])
    // Initial walking model: network factor 1.25 / walking speed 1.25 m/s.
    // Leave 25% headroom because the actual provider decides feasibility.
    // Running covers the same ground `pace.speed` times faster.
    let estimate = estimateExperienceWithStops(durationSeconds: geographicMeters / request.pace.speed, stops: ordered)
    if geographicMeters < 180 || Double(estimate.totalMinutes) > Double(request.minutes) * 1.25 { return }
    let outward = stops.map { distanceMeters(request.start, $0.coordinates) }.max() ?? 0
    let connecting = pathDistance(ordered.map(\.coordinates))
    // More connecting distance relative to the outward leg favours a real circuit.
    pool.append(ScenicCandidate(stops: ordered, geographicMeters: geographicMeters, key: key, spread: min(1, connecting / max(1, outward))))
  }
  for a in available.indices {
    for b in available.indices where b > a {
      let pair = [available[a], available[b]]
      add(pair)
      // At most one broad third stop per pair keeps the pool at most 380 combinations.
      func cross(_ p: Place) -> Double { abs((pair[1].lng - pair[0].lng) * (p.lat - pair[0].lat) - (pair[1].lat - pair[0].lat) * (p.lng - pair[0].lng)) }
      let third = available.filter { place in !pair.contains(where: { $0.id == place.id }) }
        .sorted { cross($0) != cross($1) ? cross($0) > cross($1) : $0.id < $1.id }.first
      if let third { add(pair + [third]) }
    }
  }
  return pool
}

private func orderStops(_ stops: [Place], _ request: GenerateRequest) -> [Place] {
  var remaining = stops
  var ordered: [Place] = []
  var current = request.start
  while !remaining.isEmpty {
    let from = current
    remaining.sort { let da = distanceMeters(from, $0.coordinates), db = distanceMeters(from, $1.coordinates); return da != db ? da < db : $0.id < $1.id }
    let next = remaining.removeFirst()
    ordered.append(next)
    current = next.coordinates
  }
  guard request.mode == .destination, let destination = request.destination else { return ordered }
  func length(_ points: [Place]) -> Double { pathDistance([request.start] + points.map(\.coordinates) + [destination]) }
  let reverse = Array(ordered.reversed())
  return length(reverse) < length(ordered) ? reverse : ordered
}

public func openCandidatePool(_ places: [Place], _ request: GenerateRequest) -> [ScenicCandidate] {
  let available = shortlistForMoods(places.filter { place in
    distanceMeters(request.start, place.coordinates) > 50 && (request.mode != .destination || request.destination.map { distanceMeters($0, place.coordinates) > 50 } ?? true)
  }, request.moods)
  var pool: [ScenicCandidate] = []
  var seen = Set<String>()
  func candidate(_ stops: [Place]) -> ScenicCandidate? {
    if tooClose(stops) { return nil }
    let ordered = orderStops(stops, request)
    var points = [request.start] + ordered.map(\.coordinates)
    if request.mode == .destination, let destination = request.destination { points.append(destination) }
    let geographicMeters = pathDistance(points)
    if geographicMeters < 180 || Double(estimateExperienceWithStops(durationSeconds: geographicMeters / request.pace.speed, stops: ordered).totalMinutes) > Double(request.minutes) * 1.25 { return nil }
    let outward = stops.map { distanceMeters(request.start, $0.coordinates) }.max() ?? 0
    return ScenicCandidate(stops: ordered, geographicMeters: geographicMeters, key: candidateKey(stops), spread: min(1, pathDistance(ordered.map(\.coordinates)) / max(1, outward)))
  }
  func add(_ value: ScenicCandidate?) {
    guard let value, !seen.contains(value.key) else { return }
    seen.insert(value.key)
    pool.append(value)
  }
  // Targeted walks may use a single worthwhile stop when the endpoint consumes
  // most of the budget. Longer budgets still shortlist genuine side detours.
  if request.mode == .destination { available.forEach { add(candidate([$0])) } }
  func difference(_ value: ScenicCandidate) -> Double {
    abs(Double(estimateExperienceWithStops(durationSeconds: value.geographicMeters / request.pace.speed, stops: value.stops).totalMinutes) - Double(request.minutes) * 0.97)
  }
  for a in available.indices {
    for b in available.indices where b > a {
      let pair = [available[a], available[b]]
      add(candidate(pair))
      // One third stop per pair bounds the pool at 380 Explore / 400 Targeted.
      let thirds = available.filter { place in !pair.contains(where: { $0.id == place.id }) }.compactMap { candidate(pair + [$0]) }
        .sorted { x, y in
          let dx = difference(x), dy = difference(y)
          if dx != dy { return dx < dy }
          if x.spread != y.spread { return x.spread > y.spread }
          return x.key < y.key
        }
      add(thirds.first)
    }
  }
  return pool
}

public func candidatePool(_ places: [Place], _ request: GenerateRequest) -> [ScenicCandidate] {
  request.mode == .loop ? loopCandidatePool(places, request) : openCandidatePool(places, request)
}

public func chooseCandidate(_ pool: [ScenicCandidate], _ request: GenerateRequest, selected: [ScenicCandidate], secondsPerMeter: Double = 1, targetFraction: Double = 0.97) -> ScenicCandidate? {
  let used = Set(selected.map(\.key))
  let duration = Double(request.minutes)
  func merit(_ candidate: ScenicCandidate) -> Double {
    // secondsPerMeter is calibrated on walking times; running divides the travel part.
    let estimated = Double(estimateExperienceWithStops(durationSeconds: candidate.geographicMeters * secondsPerMeter / request.pace.speed, stops: candidate.stops).totalMinutes)
    let closeness = abs(estimated - duration * targetFraction) / duration
    let overlap = selected.map { stopOverlap(candidate.stops, $0.stops) }.max() ?? 0
    let distanceFit = 250 * closeness + (estimated > duration ? 20 : 0)
    // Several tags: prefer combinations that visit a stop for each of them.
    let coverage = request.moods.count > 1 ? moodCoverage(candidate.stops, request.moods) * 0.1 : 0
    return -distanceFit + scorePlaces(candidate.stops, moods: request.moods, visitedIds: request.visitedIds) * 0.12 + candidate.spread * 8 + coverage - overlap * 12
  }
  return pool.filter { !used.contains($0.key) }
    .map { ($0, merit($0)) }
    .sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0.key < $1.0.key }
    .first?.0
}

/// Up to six distinct shortlisted stop sets, before any provider request.
public func shortlistCandidates(_ places: [Place], _ request: GenerateRequest) -> [[Place]] {
  let pool = candidatePool(places, request)
  var selected: [ScenicCandidate] = []
  for _ in 0..<6 {
    guard let candidate = chooseCandidate(pool, request, selected: selected) else { break }
    selected.append(candidate)
  }
  return selected.map(\.stops)
}
