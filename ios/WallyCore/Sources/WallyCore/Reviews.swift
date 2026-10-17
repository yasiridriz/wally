import Foundation

/// `src/lib/reviews.ts`: one route review as stored for later analysis, in the
/// same version-1 JSON Lines format as the web server. A re-rated route appends
/// a newer record with the same `reviewId`, and only the newest counts. No
/// coordinates or user identity are kept.
public struct ReviewRecord: Codable, Hashable, Sendable {
  public struct Stop: Codable, Hashable, Sendable { public var id: String; public var name: String; public var category: PlaceCategory }
  public var v = 1
  public var reviewId: String
  public var at: String
  /// 1–5 stars, or nil when the route was only favourited.
  public var rating: Int?
  public var favourite: Bool
  public var routeName: String
  public var mode: RouteMode
  public var pace: Pace
  public var moods: [Mood]
  public var duration: Int
  public var totalMinutes: Int
  public var distanceMeters: Int
  public var stops: [Stop]

  /// Nil for demo routes and for entries with neither stars nor a favourite.
  public init?(_ entry: HistoryEntry, at date: Date = Date()) {
    guard entry.source == .live, entry.rating != nil || entry.favourite else { return nil }
    reviewId = entry.id; at = ISO8601DateFormatter().string(from: date); rating = entry.rating; favourite = entry.favourite
    routeName = entry.name; mode = entry.mode; pace = entry.pace; moods = entry.moods; duration = entry.duration
    totalMinutes = entry.totalMinutes; distanceMeters = entry.distanceMeters
    stops = entry.stops.map { Stop(id: $0.id, name: $0.name, category: $0.category) }
  }

  enum CodingKeys: String, CodingKey { case v, reviewId, at, rating, favourite, routeName, mode, pace, moods, duration, totalMinutes, distanceMeters, stops }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(v, forKey: .v); try container.encode(reviewId, forKey: .reviewId); try container.encode(at, forKey: .at)
    // An explicit null, like the web store, for favourite-only reviews.
    try container.encode(rating, forKey: .rating)
    try container.encode(favourite, forKey: .favourite); try container.encode(routeName, forKey: .routeName)
    try container.encode(mode, forKey: .mode); try container.encode(pace, forKey: .pace); try container.encode(moods, forKey: .moods)
    try container.encode(duration, forKey: .duration); try container.encode(totalMinutes, forKey: .totalMinutes)
    try container.encode(distanceMeters, forKey: .distanceMeters); try container.encode(stops, forKey: .stops)
  }
}

/// Newest record per review, from raw JSON Lines; malformed lines are skipped.
public func latestReviews(_ text: String) -> [ReviewRecord] {
  var latest: [String: ReviewRecord] = [:]
  var order: [String] = []
  let decoder = JSONDecoder()
  for line in text.split(separator: "\n") {
    guard let record = try? decoder.decode(ReviewRecord.self, from: Data(line.utf8)), record.v == 1 else { continue }
    if let previous = latest[record.reviewId] { if previous.at <= record.at { latest[record.reviewId] = record } }
    else { latest[record.reviewId] = record; order.append(record.reviewId) }
  }
  return order.compactMap { latest[$0] }
}

/// Average stars per place across the newest reviews.
public func placeRatings(_ records: [ReviewRecord]) -> [String: PlaceRating] {
  var totals: [String: (sum: Int, count: Int)] = [:]
  for record in records {
    guard let rating = record.rating, (1...5).contains(rating) else { continue }
    for id in Set(record.stops.map(\.id)) {
      let total = totals[id] ?? (0, 0)
      totals[id] = (total.sum + rating, total.count + 1)
    }
  }
  return totals.mapValues { PlaceRating(average: Double($0.sum) / Double($0.count), count: $0.count) }
}

/// Appends reviews to a JSON Lines file on the device, ready to export or upload later.
public actor ReviewStore {
  public let file: URL
  public init(file: URL) { self.file = file }

  public func append(_ record: ReviewRecord) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    var line = try encoder.encode(record)
    line.append(0x0A)
    try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    if let handle = try? FileHandle(forWritingTo: file) {
      defer { try? handle.close() }
      try handle.seekToEnd()
      try handle.write(contentsOf: line)
    } else {
      try line.write(to: file)
    }
  }

  public func records() -> [ReviewRecord] {
    guard let data = try? Data(contentsOf: file), let text = String(data: data, encoding: .utf8) else { return [] }
    return latestReviews(text)
  }
}
