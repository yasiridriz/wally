import Foundation

public func isCoordinates(_ value: Coordinates?) -> Bool {
  guard let value else { return false }
  return value.lat.isFinite && value.lng.isFinite && value.lat >= -85 && value.lat <= 85 && value.lng >= -180 && value.lng <= 180
}

public func distanceMeters(_ a: Coordinates, _ b: Coordinates) -> Double {
  let radians = Double.pi / 180
  let dLat = (b.lat - a.lat) * radians
  let dLng = (b.lng - a.lng) * radians
  let h = pow(sin(dLat / 2), 2) + cos(a.lat * radians) * cos(b.lat * radians) * pow(sin(dLng / 2), 2)
  return 6_371_000 * 2 * atan2(sqrt(h), sqrt(max(0, 1 - h)))
}

public func searchRadius(_ duration: Int, isLoop: Bool) -> Double {
  (min(3500, max(350, Double(duration - 6) * 65 / (isLoop ? 2.4 : 1.5)))).rounded()
}

public func pathDistance(_ points: [Coordinates]) -> Double {
  guard points.count > 1 else { return 0 }
  return (1..<points.count).reduce(0) { $0 + distanceMeters(points[$1 - 1], points[$1]) }
}

/// A point `meters` away from `origin` on a compass bearing in degrees.
public func offset(_ origin: Coordinates, meters: Double, degrees: Double) -> Coordinates {
  let radians = Double.pi / 180
  let bearing = degrees * radians
  let angular = meters / 6_371_000
  let latitude = origin.lat * radians
  let nextLatitude = asin(sin(latitude) * cos(angular) + cos(latitude) * sin(angular) * cos(bearing))
  let nextLongitude = origin.lng * radians + atan2(sin(bearing) * sin(angular) * cos(latitude), cos(angular) - sin(latitude) * sin(nextLatitude))
  let lng = (nextLongitude / radians + 540).truncatingRemainder(dividingBy: 360) - 180
  return Coordinates(lat: max(-85, min(85, nextLatitude / radians)), lng: lng)
}

public func initialBearing(_ start: Coordinates, _ end: Coordinates) -> Double {
  let radians = Double.pi / 180
  let delta = (end.lng - start.lng) * radians
  let a = start.lat * radians
  let b = end.lat * radians
  return atan2(sin(delta) * cos(b), cos(a) * sin(b) - sin(a) * cos(b) * cos(delta)) / radians
}

/// Matches JavaScript `toFixed` closely enough for coordinate keys and links.
func fixed(_ value: Double, _ digits: Int) -> String { String(format: "%.\(digits)f", value) }
