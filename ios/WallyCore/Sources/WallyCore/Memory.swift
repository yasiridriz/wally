import Foundation

/// `src/lib/memory.ts`: path memory, favourites and reviews in route scoring.

/// One remembered route: its stops and how the user felt about it.
public struct MemoryHint: Hashable, Sendable {
  public var stopIds: [String]
  public var favourite: Bool
  /// 1–5 stars, when reviewed.
  public var rating: Int?
  public init(stopIds: [String], favourite: Bool = false, rating: Int? = nil) { self.stopIds = stopIds; self.favourite = favourite; self.rating = rating }
}

/// Average stars for a place across reviews.
public struct PlaceRating: Hashable, Sendable {
  public var average: Double
  public var count: Int
  public init(average: Double, count: Int) { self.average = average; self.count = count }
}

/// A stop as remembered in path history: enough to score and re-offer it, no photos.
public struct PlaceSummary: Codable, Hashable, Sendable {
  public var id: String
  public var name: String
  public var category: PlaceCategory
  public var lat: Double
  public var lng: Double
  public var baseScenicScore: Double
  public init(_ place: Place) {
    id = place.id; name = place.name; category = place.category; lat = place.lat; lng = place.lng; baseScenicScore = place.baseScenicScore
  }
  public var place: Place { Place(id: id, name: name, lat: lat, lng: lng, category: category, baseScenicScore: baseScenicScore) }
}

/// A route the user opened. Stored only on this device.
public struct HistoryEntry: Codable, Identifiable, Hashable, Sendable {
  /// Stable id for this entry; also the review id when it is rated.
  public var id: String
  public var name: String
  public var stops: [PlaceSummary]
  public var mode: RouteMode
  public var pace: Pace
  public var moods: [Mood]
  public var duration: Int
  public var totalMinutes: Int
  public var distanceMeters: Int
  public var source: RouteSource
  public var selectedAt: Date
  public var rating: Int?
  public var favourite: Bool
  public init(id: String = UUID().uuidString, route: WanderRoute, mode: RouteMode, pace: Pace, moods: [Mood], duration: Int, selectedAt: Date = Date(), rating: Int? = nil, favourite: Bool = false) {
    self.id = id; name = route.name; stops = route.stops.map { PlaceSummary($0) }; self.mode = mode; self.pace = pace; self.moods = moods
    self.duration = duration; totalMinutes = route.totalMinutes; distanceMeters = route.distanceMeters; source = route.source
    self.selectedAt = selectedAt; self.rating = rating; self.favourite = favourite
  }
  /// The same stops in the same order, for the same route shape.
  public func matches(_ route: WanderRoute, mode: RouteMode) -> Bool {
    self.mode == mode && stops.map(\.id) == route.stops.map(\.id)
  }
}

public let historyLimit = 100
/// How many recent history entries a route request carries.
public let memoryLimit = 50
public let favouritePlacesLimit = 40

private let repeatPenalty = 30.0
private let favouriteRouteBonus = 60.0
private let favouritePlaceBonus = 25.0
private let personalRatingWeight = 5.0
private let communityRatingWeight = 4.0
/// Community averages count fully from this many reviews of a place.
private let communityConfidentCount = 5.0

/// The compact form of history a route request carries: most recent first.
public func memoryHints(_ history: [HistoryEntry]) -> [MemoryHint] {
  history.prefix(memoryLimit).map { MemoryHint(stopIds: $0.stops.map(\.id), favourite: $0.favourite, rating: $0.rating) }
}

/// Stops of favourite routes, once each, for the planner to offer again.
public func favouritePlaces(_ history: [HistoryEntry]) -> [Place] {
  var seen = Set<String>()
  var places: [Place] = []
  for stop in history.filter(\.favourite).flatMap(\.stops) where !seen.contains(stop.id) {
    seen.insert(stop.id); places.append(stop.place)
  }
  return Array(places.prefix(favouritePlacesLimit))
}

/// Share of two stop sets that is shared (Jaccard): 1 means the same set of stops.
private func similarity(_ ids: Set<String>, _ other: [String]) -> Double {
  let shared = other.filter { ids.contains($0) }.count
  return Double(shared) / Double(ids.union(other).count)
}

/// Points added to a candidate's score from what this user did before and from
/// reviews. Repeating a route the user already opened costs points in proportion
/// to how similar it is, so new places and ways come first. With the Favourites
/// tag, favourite routes and their places gain points instead. Rated routes pull
/// their places up (4–5 stars) or down (1–2 stars) in new combinations.
public func memoryScore(_ stops: [Place], _ request: GenerateRequest) -> Double {
  guard !stops.isEmpty else { return 0 }
  let ids = Set(stops.map(\.id))
  var repeated = 0.0, favourite = 0.0
  var favouriteIds = Set<String>()
  var personal: [String: (sum: Double, count: Double)] = [:]
  for hint in request.memory {
    let same = similarity(ids, hint.stopIds)
    if hint.favourite && request.favourites {
      favourite = max(favourite, same)
      favouriteIds.formUnion(hint.stopIds)
    } else { repeated = max(repeated, same) }
    if let rating = hint.rating {
      for id in hint.stopIds {
        let total = personal[id] ?? (0, 0)
        personal[id] = (total.sum + Double(rating), total.count + 1)
      }
    }
  }
  func perStop(_ fn: (String) -> Double) -> Double { stops.reduce(0) { $0 + fn($1.id) } / Double(stops.count) }
  let favouriteShare = perStop { favouriteIds.contains($0) ? 1 : 0 }
  let personalRating = perStop { id in personal[id].map { $0.sum / $0.count - 3 } ?? 0 }
  let communityRating = perStop { id in request.ratings[id].map { ($0.average - 3) * min(1, Double($0.count) / communityConfidentCount) } ?? 0 }
  return (-repeatPenalty * repeated + favouriteRouteBonus * favourite + favouritePlaceBonus * favouriteShare
    + personalRatingWeight * personalRating + communityRatingWeight * communityRating).rounded()
}

/// With the Favourites tag, favourite stops that the walk can reach join the
/// discovered places, first, so they survive the candidate shortlist.
public func withFavouritePlaces(_ places: [Place], _ request: GenerateRequest, reachable: (Place) -> Bool) -> [Place] {
  guard request.favourites, !request.favouritePlaces.isEmpty else { return places }
  let favourites = request.favouritePlaces.filter(reachable)
  let ids = Set(favourites.map(\.id))
  return favourites.map { favourite in places.first { $0.id == favourite.id } ?? favourite } + places.filter { !ids.contains($0.id) }
}

/// The Wander score with path memory folded in, kept within 0–100.
public func scoreWithMemory(_ stops: [Place], _ request: GenerateRequest, penalty: Double = 0) -> (score: Double, memory: Double) {
  let memory = memoryScore(stops, request)
  return (min(100, max(0, scorePlaces(stops, moods: request.moods, visitedIds: request.visitedIds) - penalty + memory)), memory)
}
