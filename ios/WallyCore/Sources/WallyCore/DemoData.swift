import Foundation

// Hand-drawn paths along Edinburgh streets and park paths. These fixtures are
// illustrative, not surveyed routes or a substitute for live directions.
public let demoStart = Coordinates(lat: 55.9442, lng: -3.19055)
public let demoDestination = Coordinates(lat: 55.94695, lng: -3.1891)

private let demoPlaces: [String: Place] = [
  "middle": Place(id: "demo-middle-meadow", name: "Middle Meadow Walk", lat: 55.9429, lng: -3.19045, category: .path, description: "A broad tree-lined path into the Meadows, loved by everyday Edinburgh walkers.", baseScenicScore: 76),
  "meadows": Place(id: "demo-meadows", name: "The Meadows", lat: 55.94245, lng: -3.1921, category: .park, description: "Open lawns and mature trees just south of Edinburgh's Old Town.", baseScenicScore: 86),
  "george": Place(id: "demo-george-square", name: "George Square Gardens", lat: 55.94365, lng: -3.1873, category: .park, description: "A leafy university square framed by Georgian buildings.", baseScenicScore: 81),
  "mcewan": Place(id: "demo-mcewan", name: "McEwan Hall", lat: 55.9447, lng: -3.18755, category: .historic, description: "The university's grand domed ceremonial hall, viewed from Bristo Square.", baseScenicScore: 83),
  "museum": Place(id: "demo-museum", name: "National Museum of Scotland", lat: 55.94695, lng: -3.1891, category: .attraction, description: "A landmark museum on Chambers Street; this walk stops outside.", baseScenicScore: 86),
  "greyfriars": Place(id: "demo-greyfriars", name: "Greyfriars Bobby", lat: 55.9469, lng: -3.1921, category: .historic, description: "The small statue celebrating Edinburgh's famously loyal terrier.", baseScenicScore: 84),
  "teviot": Place(id: "demo-teviot", name: "Teviot Row House", lat: 55.94395, lng: -3.1890, category: .historic, description: "A distinctive sandstone university building on the edge of Bristo Square.", baseScenicScore: 79),
]

private struct Fixture { var name: String; var description: String; var stops: [String]; var path: [(Double, Double)] }
private let s = (demoStart.lng, demoStart.lat)
private let d = (demoDestination.lng, demoDestination.lat)
private let fixtures: [Fixture] = [
  Fixture(name: "A little breathing room", description: "A short sample wander under the Meadows' trees.", stops: ["middle"], path: [s, (-3.1905, 55.9436), (-3.19045, 55.9429), (-3.19105, 55.94315), (-3.19135, 55.94355), (-3.1912, 55.94405), s]),
  Fixture(name: "The quiet square", description: "A sample stroll from leafy paths to Georgian gardens.", stops: ["george"], path: [s, (-3.1905, 55.9437), (-3.1894, 55.94365), (-3.1883, 55.94365), (-3.1873, 55.94365), (-3.1873, 55.94405), (-3.1885, 55.94415), s]),
  Fixture(name: "Bristo's grand entrance", description: "A sample city walk between two handsome university landmarks.", stops: ["mcewan", "teviot"], path: [s, (-3.1904, 55.94455), (-3.1894, 55.9446), (-3.1882, 55.94465), (-3.18755, 55.9447), (-3.1876, 55.94415), (-3.1890, 55.94415), (-3.1890, 55.94395), (-3.1903, 55.94395), s]),
  Fixture(name: "A sandstone side quest", description: "A tiny sample adventure around a beloved university building.", stops: ["teviot"], path: [s, (-3.1905, 55.9437), (-3.1890, 55.9437), (-3.1890, 55.94395), (-3.1890, 55.9442), s]),
  Fixture(name: "Lawns and little discoveries", description: "An easy sample loop through the Meadows and a university square.", stops: ["middle", "meadows", "george"], path: [s, (-3.19045, 55.9429), (-3.1921, 55.94245), (-3.19055, 55.9419), (-3.18835, 55.94215), (-3.1873, 55.94365), (-3.18735, 55.9441), (-3.189, 55.94415), s]),
  Fixture(name: "Edinburgh in miniature", description: "A sample wander between a grand hall, museum and beloved little dog.", stops: ["mcewan", "museum", "greyfriars"], path: [s, (-3.1904, 55.94455), (-3.18755, 55.9447), (-3.1877, 55.94525), (-3.18785, 55.94695), (-3.1891, 55.94695), (-3.1921, 55.9469), (-3.1916, 55.9455), (-3.1914, 55.9446), s]),
]
// Fixed museum-bound illustrations: Forrest Road / George IV Bridge, or
// Bristo Square / Potterrow, followed by Chambers Street to the museum.
private let destinationFixtures: [Fixture] = [
  Fixture(name: "Bobby on the way", description: "A sample route past Greyfriars Bobby, then along Chambers Street to the museum.", stops: ["greyfriars"], path: [s, (-3.1904, 55.94455), (-3.1914, 55.9446), (-3.1916, 55.9455), (-3.1921, 55.9469), (-3.1918, 55.94705), (-3.1904, 55.9470), d]),
  Fixture(name: "A grand arrival", description: "A sample museum-bound wander past Teviot and McEwan Hall, via Bristo Square and Potterrow.", stops: ["teviot", "mcewan"], path: [s, (-3.1905, 55.9437), (-3.1890, 55.9437), (-3.1890, 55.94395), (-3.1876, 55.94415), (-3.18755, 55.9447), (-3.1880, 55.9451), (-3.1877, 55.94525), (-3.18785, 55.94695), d]),
  Fixture(name: "The leafy way there", description: "A sample detour by George Square Gardens before approaching the museum along Potterrow and Chambers Street.", stops: ["george"], path: [s, (-3.1905, 55.9437), (-3.1894, 55.94365), (-3.1883, 55.94365), (-3.1873, 55.94365), (-3.1873, 55.94405), (-3.1876, 55.94415), (-3.1877, 55.94525), (-3.18785, 55.94695), d]),
]

/// All finite sample walks, before matching the requested total duration.
public func demoRouteSamples(_ request: GenerateRequest) -> [WanderRoute] {
  let candidates = request.mode == .destination ? destinationFixtures : fixtures
  return candidates.enumerated().compactMap { index, fixture -> WanderRoute? in
    let stops = fixture.stops.compactMap { demoPlaces[$0] }
    var path = fixture.path.map { Coordinates(lat: $0.1, lng: $0.0) }
    if request.mode == .explore, let last = stops.last, let end = path.firstIndex(where: { $0.lng == last.lng && $0.lat == last.lat }) { path = Array(path[...end]) }
    let distance = Int(pathDistance(path).rounded())
    let walking = Int((Double(distance) / (70 * request.pace.speed)).rounded(.up))
    let stopMinutes = stops.count * 2
    let buffer = max(2, Int((Double(walking) * 0.1).rounded(.up)))
    let total = walking + stopMinutes + buffer
    guard total <= request.minutes else { return nil }
    let highlights = [stops[0].category == .park ? "A little green space" : "Local discoveries", request.mode == .loop ? "Back where you started" : request.mode == .destination ? "Finish at the museum" : "A fresh finish", "Illustrative sample route"]
    return WanderRoute(id: "demo-\(request.mode.rawValue)-\(index)", name: fixture.name, description: fixture.description, geometry: path, stops: stops,
      distanceMeters: distance, walkingMinutes: walking, stopMinutes: stopMinutes, bufferMinutes: buffer, totalMinutes: total,
      score: scorePlaces(stops, moods: request.moods, visitedIds: request.visitedIds), highlights: highlights, isLoop: request.mode == .loop,
      source: .demo, destination: request.mode == .destination ? demoDestination : nil)
  }
}

public func generateDemoRoutes(_ request: GenerateRequest) -> [WanderRoute] {
  rankTimeMatchedRoutes(demoRouteSamples(request), budget: request.minutes)
}
