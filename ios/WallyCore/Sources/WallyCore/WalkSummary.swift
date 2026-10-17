import Foundation

public let maxSummaryStops = 3
// Google Maps URLs accept up to nine waypoints (three in mobile browsers).
private let maxWaypoints = 9

/// Detour routes reuse the stops, photos and context of their base route.
public func baseRouteId(_ id: String) -> String { String(id.split(separator: ":", omittingEmptySubsequences: false).first ?? "") }

/// The highest-scoring stops, photos first, returned in walking order.
public func summaryStops(_ stops: [Place], limit: Int = maxSummaryStops) -> [Place] {
  Array(stops.enumerated().sorted { a, b in
    let pa = a.element.photo != nil, pb = b.element.photo != nil
    if pa != pb { return pa }
    if a.element.baseScenicScore != b.element.baseScenicScore { return a.element.baseScenicScore > b.element.baseScenicScore }
    return a.offset < b.offset
  }.prefix(limit)).sorted { $0.offset < $1.offset }.map(\.element)
}

private struct MapsStop { var point: Coordinates; var placeId: String? }

private func googlePlaceId(_ place: Place) -> String? {
  guard place.id.hasPrefix("google-") else { return nil }
  let id = String(place.id.dropFirst(7))
  return id.range(of: #"^[A-Za-z0-9_-]{1,300}$"#, options: .regularExpression) != nil ? id : nil
}

private func latLng(_ point: Coordinates) -> String { "\(fixed(point.lat, 6)),\(fixed(point.lng, 6))" }

/// Google Maps walking directions through the route stops, in route order.
/// Loops end at the start, Targeted walks at the chosen destination, and
/// Explore walks at the final stop. An accepted event detour stays in place.
public func googleMapsDirectionsURL(_ route: WanderRoute) -> URL? {
  guard let start = route.start ?? route.geometry.first, isCoordinates(start) else { return nil }
  var stops = route.stops.map { MapsStop(point: $0.coordinates, placeId: googlePlaceId($0)) }
  if let event = route.event { stops.insert(MapsStop(point: event.location), at: max(0, min(stops.count, route.eventStopIndex ?? stops.count))) }
  let destination: MapsStop?
  if route.isLoop { destination = MapsStop(point: start) }
  else if let end = route.destination { destination = MapsStop(point: end) }
  else { destination = stops.popLast() }
  guard let destination, (stops + [destination]).allSatisfy({ isCoordinates($0.point) }), stops.count <= maxWaypoints else { return nil }
  var items = [URLQueryItem(name: "api", value: "1"), URLQueryItem(name: "origin", value: latLng(start)), URLQueryItem(name: "destination", value: latLng(destination.point)), URLQueryItem(name: "travelmode", value: "walking")]
  if let id = destination.placeId { items.append(URLQueryItem(name: "destination_place_id", value: id)) }
  if !stops.isEmpty {
    items.append(URLQueryItem(name: "waypoints", value: stops.map { latLng($0.point) }.joined(separator: "|")))
    // Place IDs show stop names in Google Maps, but the list must match every waypoint.
    let ids = stops.compactMap(\.placeId)
    if ids.count == stops.count { items.append(URLQueryItem(name: "waypoint_place_ids", value: ids.joined(separator: "|"))) }
  }
  var components = URLComponents(string: "https://www.google.com/maps/dir/")!
  components.queryItems = items
  // URLComponents leaves "|" and "," unescaped; Google documents percent-encoded values.
  components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "|", with: "%7C").replacingOccurrences(of: ",", with: "%2C")
  return components.url
}
