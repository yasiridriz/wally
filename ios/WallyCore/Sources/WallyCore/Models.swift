import Foundation

public struct Coordinates: Codable, Hashable, Sendable {
  public var lat: Double
  public var lng: Double
  public init(lat: Double, lng: Double) { self.lat = lat; self.lng = lng }
}

public struct Attribution: Codable, Hashable, Sendable {
  public var displayName: String
  public var uri: String?
  public init(displayName: String, uri: String? = nil) { self.displayName = displayName; self.uri = uri }
  /// A link only for http(s) URIs, never for script or app schemes.
  public var safeURL: URL? {
    guard let uri, let url = URL(string: uri), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return nil }
    return url
  }
}

public struct LocationSearchResult: Identifiable, Hashable, Sendable {
  public var id: String
  public var name: String
  public var address: String
  public var coordinates: Coordinates
  public var attributions: [Attribution]
  public init(id: String, name: String, address: String, coordinates: Coordinates, attributions: [Attribution] = []) {
    self.id = id; self.name = name; self.address = address; self.coordinates = coordinates; self.attributions = attributions
  }
}

/// Total trip minutes: any whole minute from 5 to 480 (eight hours), like the web app.
public struct WalkDuration: RawRepresentable, Hashable, Codable, Sendable, Comparable {
  public static let minimum = 5
  public static let maximum = 480
  public let rawValue: Int
  public init?(rawValue: Int) {
    guard (WalkDuration.minimum...WalkDuration.maximum).contains(rawValue) else { return nil }
    self.rawValue = rawValue
  }
  public init(clamping minutes: Int) { rawValue = Swift.min(WalkDuration.maximum, Swift.max(WalkDuration.minimum, minutes)) }
  public static let m15 = WalkDuration(clamping: 15), m30 = WalkDuration(clamping: 30), m45 = WalkDuration(clamping: 45)
  public static let m60 = WalkDuration(clamping: 60), m90 = WalkDuration(clamping: 90)
  /// The quick-choice presets.
  public static let allCases: [WalkDuration] = [.m15, .m30, .m45, .m60, .m90]
  public static func < (a: WalkDuration, b: WalkDuration) -> Bool { a.rawValue < b.rawValue }
}
public enum Mood: String, CaseIterable, Codable, Sendable {
  case surprise, scenic, green, historic, hidden
  /// The selectable tags. An empty selection means Surprise me.
  public static let tags: [Mood] = [.scenic, .green, .historic, .hidden]
  /// Keeps known tags once each, in the canonical tag order.
  public static func normalized(_ moods: [Mood]) -> [Mood] { tags.filter { moods.contains($0) } }
}
/// Running covers ground 2.25x faster than walking (the middle of a 2–2.5x range).
/// Travel time divides by `speed`; planned stop visits do not, so a running
/// budget reaches further and plans longer routes.
public enum Pace: String, CaseIterable, Codable, Sendable {
  case walk, run
  public static let runSpeed = 2.25
  public var speed: Double { self == .run ? Pace.runSpeed : 1 }
}
/// The internal value for Targeted stays `destination`, like the web app.
public enum RouteMode: String, CaseIterable, Codable, Sendable { case destination, loop, explore }
public enum PlaceCategory: String, CaseIterable, Codable, Sendable { case park, viewpoint, historic, art, attraction, path }
public enum RouteSource: String, Codable, Sendable { case live, demo }

/// Google photo resource name; a short-lived image URL is fetched on demand.
public struct PlacePhotoRef: Hashable, Sendable {
  public var name: String
  public var authorAttributions: [Attribution]
  public init(name: String, authorAttributions: [Attribution] = []) { self.name = name; self.authorAttributions = authorAttributions }
}

public struct Place: Identifiable, Hashable, Sendable {
  public var id: String
  public var name: String
  public var lat: Double
  public var lng: Double
  public var category: PlaceCategory
  public var description: String?
  public var baseScenicScore: Double
  public var tags: [String: String]?
  public var attributions: [Attribution]
  public var visitMinutes: Double?
  public var suggestedActivity: String?
  public var photo: PlacePhotoRef?
  public init(id: String, name: String, lat: Double, lng: Double, category: PlaceCategory, description: String? = nil, baseScenicScore: Double, tags: [String: String]? = nil, attributions: [Attribution] = [], visitMinutes: Double? = nil, suggestedActivity: String? = nil, photo: PlacePhotoRef? = nil) {
    self.id = id; self.name = name; self.lat = lat; self.lng = lng; self.category = category; self.description = description
    self.baseScenicScore = baseScenicScore; self.tags = tags; self.attributions = attributions; self.visitMinutes = visitMinutes
    self.suggestedActivity = suggestedActivity; self.photo = photo
  }
  public var coordinates: Coordinates { Coordinates(lat: lat, lng: lng) }
}

/// Every event in Wally is a fictional sample, never a live listing.
public struct SampleEvent: Identifiable, Hashable, Sendable {
  public var id: String
  public var name: String
  public var location: Coordinates
  public var startTime: Date
  public var endTime: Date
  public var visitMinutes: Int
  public var category: String
  public var description: String
  public init(id: String, name: String, location: Coordinates, startTime: Date, endTime: Date, visitMinutes: Int, category: String, description: String) {
    self.id = id; self.name = name; self.location = location; self.startTime = startTime; self.endTime = endTime
    self.visitMinutes = visitMinutes; self.category = category; self.description = description
  }
}

public struct WanderRoute: Identifiable, Hashable, Sendable {
  public var id: String
  public var name: String
  public var description: String
  /// Route geometry in walking order.
  public var geometry: [Coordinates]
  public var stops: [Place]
  public var distanceMeters: Int
  public var walkingMinutes: Int
  public var stopMinutes: Int
  public var bufferMinutes: Int
  public var totalMinutes: Int
  public var score: Double
  public var highlights: [String]
  public var isLoop: Bool
  public var source: RouteSource
  public var event: SampleEvent?
  public var destination: Coordinates?
  public var routingWarnings: [String]
  /// Validated start of the walk.
  public var start: Coordinates?
  /// Count of stops visited before the event on a detour route.
  public var eventStopIndex: Int?
  /// Points from path memory, favourites and reviews; also used in ranking.
  public var memoryScore: Double = 0
  /// The destination cannot be reached within the chosen time: this is the direct way there.
  public var overBudget = false
  public init(id: String, name: String, description: String, geometry: [Coordinates], stops: [Place], distanceMeters: Int, walkingMinutes: Int, stopMinutes: Int, bufferMinutes: Int, totalMinutes: Int, score: Double, highlights: [String], isLoop: Bool, source: RouteSource, event: SampleEvent? = nil, destination: Coordinates? = nil, routingWarnings: [String] = [], start: Coordinates? = nil, eventStopIndex: Int? = nil) {
    self.id = id; self.name = name; self.description = description; self.geometry = geometry; self.stops = stops
    self.distanceMeters = distanceMeters; self.walkingMinutes = walkingMinutes; self.stopMinutes = stopMinutes
    self.bufferMinutes = bufferMinutes; self.totalMinutes = totalMinutes; self.score = score; self.highlights = highlights
    self.isLoop = isLoop; self.source = source; self.event = event; self.destination = destination
    self.routingWarnings = routingWarnings; self.start = start; self.eventStopIndex = eventStopIndex
  }
}

public struct GenerateRequest: Hashable, Sendable {
  public var start: Coordinates
  public var duration: WalkDuration
  /// Selected mood tags; empty means Surprise me.
  public var moods: [Mood]
  public var mode: RouteMode
  public var pace: Pace
  /// Routes this user opened before, most recent first. See `Memory.swift`.
  public var memory: [MemoryHint] = []
  /// The Favourites tag: favourite routes and their places are strongly preferred.
  public var favourites = false
  /// Stops of favourite routes, offered to the planner with the Favourites tag.
  public var favouritePlaces: [Place] = []
  /// Average review per place, when a review source is available.
  public var ratings: [String: PlaceRating] = [:]
  public var visitedIds: [String]
  public var includeEvents: Bool
  public var demo: Bool
  public var destination: Coordinates?
  public init(start: Coordinates, duration: WalkDuration, moods: [Mood] = [], mode: RouteMode, pace: Pace = .walk, visitedIds: [String] = [], includeEvents: Bool = false, demo: Bool = false, destination: Coordinates? = nil) {
    self.start = start; self.duration = duration; self.moods = Mood.normalized(moods); self.mode = mode; self.pace = pace; self.visitedIds = visitedIds
    self.includeEvents = includeEvents; self.demo = demo; self.destination = destination
  }
  public var minutes: Int { duration.rawValue }
}

public struct GenerateResponse: Sendable {
  public var routes: [WanderRoute]
  public var message: String?
  public init(routes: [WanderRoute], message: String? = nil) { self.routes = routes; self.message = message }
}

public struct DetourOption: Identifiable, Hashable, Sendable {
  public var id: String
  public var event: SampleEvent
  public var route: WanderRoute
  public var additionalMinutes: Int
  public var additionalDistanceMeters: Int
  public var arrivalTime: Date
}

public struct SummaryPhoto: Hashable, Sendable {
  public var stopId: String
  public var placeName: String
  public var url: URL
  public var authorAttributions: [Attribution]
  public init(stopId: String, placeName: String, url: URL, authorAttributions: [Attribution]) {
    self.stopId = stopId; self.placeName = placeName; self.url = url; self.authorAttributions = authorAttributions
  }
}

/// A user-facing failure with a stable code, like the web `ActionResult` error.
public struct WallyError: Error, Equatable, Sendable, LocalizedError {
  public var code: String
  public var message: String
  public init(_ code: String, _ message: String) { self.code = code; self.message = message }
  public var errorDescription: String? { message }
}
