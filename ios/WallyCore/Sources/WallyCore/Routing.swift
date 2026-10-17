import Foundation

public struct WalkingResult: Sendable {
  public var geometry: [Coordinates]
  public var distanceMeters: Int
  public var durationSeconds: Double
  public var segmentSeconds: [Double]
  public var warnings: [String]
}

/// Shared HTTP attempt cap for one generation, safe across concurrent workers.
public actor RoutingBudget {
  public private(set) var remaining: Int
  public private(set) var rateLimited = false
  public init(remaining: Int) { self.remaining = remaining }
  public var canContinue: Bool { remaining > 0 && !rateLimited }
  func take() -> Bool {
    guard canContinue else { return false }
    remaining -= 1
    return true
  }
  func markRateLimited() { rateLimited = true }
}

/// Google encodes protobuf durations as seconds with up to nine decimal places.
func parseDuration(_ value: Any?) -> Double? {
  guard let value = value as? String, value.range(of: #"^(?:0|[1-9]\d*)(?:\.\d{1,9})?s$"#, options: .regularExpression) != nil else { return nil }
  return Double(value.dropLast())
}

private func googleWaypoint(_ point: Coordinates) -> [String: Any] {
  ["location": ["latLng": ["latitude": point.lat, "longitude": point.lng]]]
}

public func routeWalking(_ client: GoogleClient, _ waypoints: [Coordinates], budget: RoutingBudget) async throws -> WalkingResult {
  guard client.hasKey else { throw ProviderError("Live walking routes need a Google Maps API key. Try Demo Mode.") }
  guard waypoints.count >= 2, waypoints.count <= 6, waypoints.allSatisfy(isCoordinates) else { throw ProviderError("Invalid walking waypoints.") }
  for attempt in 0..<2 {
    guard await budget.take() else { throw ProviderError("Routing request limit reached. Please try again shortly.") }
    do {
      let request = try client.request(URL(string: "https://routes.googleapis.com/directions/v2:computeRoutes")!,
        fieldMask: "routes.duration,routes.distanceMeters,routes.polyline.geoJsonLinestring,routes.legs.duration,routes.warnings",
        body: [
          "origin": googleWaypoint(waypoints[0]), "destination": googleWaypoint(waypoints[waypoints.count - 1]),
          // Non-via stops retain one leg per waypoint pair, needed for event arrival times.
          "intermediates": waypoints.dropFirst().dropLast().map { googleWaypoint($0).merging(["via": false]) { $1 } },
          "travelMode": "WALK", "computeAlternativeRoutes": false, "optimizeWaypointOrder": false,
          "polylineEncoding": "GEO_JSON_LINESTRING", "polylineQuality": "HIGH_QUALITY",
        ], timeout: 12)
      let data: Data, response: HTTPURLResponse
      do { (data, response) = try await client.transport.send(request) }
      catch { throw ProviderError("The walking provider did not respond in time. Please try again or use Demo Mode.") }
      guard (200..<300).contains(response.statusCode) else {
        if response.statusCode == 429 { await budget.markRateLimited() }
        let message = response.statusCode == 429 ? "The walking provider is busy. Please try again shortly or use Demo Mode."
          : [401, 403].contains(response.statusCode) ? "Google walking routes are not authorised. Check your API key and enabled Routes API."
          : "The walking provider could not find this route."
        throw ProviderError(message, status: response.statusCode)
      }
      let route = record((record(try? JSONSerialization.jsonObject(with: data))?["routes"] as? [Any])?.first)
      let geometry = record(record(route?["polyline"])?["geoJsonLinestring"])
      let incomplete = ProviderError("The walking provider returned an incomplete route.", status: 1)
      guard geometry?["type"] as? String == "LineString", let raw = geometry?["coordinates"] as? [Any], raw.count >= 2, raw.count <= 100_000,
            let distance = route?["distanceMeters"] as? Int, distance > 0,
            let durationSeconds = parseDuration(route?["duration"]), durationSeconds > 0 else { throw incomplete }
      var points: [Coordinates] = []
      for value in raw {
        guard let pair = value as? [Any], pair.count >= 2, let lng = number(pair[0]), let lat = number(pair[1]) else { throw incomplete }
        let point = Coordinates(lat: lat, lng: lng)
        guard isCoordinates(point) else { throw incomplete }
        points.append(point)
      }
      if distanceMeters(points[0], waypoints[0]) > 200 || distanceMeters(points[points.count - 1], waypoints[waypoints.count - 1]) > 200 {
        throw ProviderError("The walking network is too far from a selected location.", status: 1)
      }
      let segmentSeconds = ((route?["legs"] as? [Any]) ?? []).map { parseDuration(record($0)?["duration"]) ?? -1 }
      guard segmentSeconds.count == waypoints.count - 1, segmentSeconds.allSatisfy({ $0 >= 0 }) else {
        throw ProviderError("The walking provider returned incomplete timing information.", status: 1)
      }
      let warnings = ((route?["warnings"] as? [Any]) ?? []).compactMap { $0 as? String }.prefix(20).map { String($0.prefix(2000)) }
      return WalkingResult(geometry: points, distanceMeters: distance, durationSeconds: durationSeconds, segmentSeconds: segmentSeconds, warnings: Array(warnings))
    } catch let error as ProviderError {
      // Transport failures (status 0) and server errors get one retry inside the budget.
      let retryable = error.status == 0 || error.status >= 500
      if attempt == 0, retryable, await budget.canContinue { continue }
      throw error
    }
  }
  throw ProviderError("No walking route was available.")
}
