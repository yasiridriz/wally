import Foundation

public enum SearchErrorCode: String, Sendable {
  case invalidInput = "INVALID_INPUT", missingKey = "MISSING_KEY", accessDenied = "ACCESS_DENIED", rateLimited = "RATE_LIMITED", providerError = "PROVIDER_ERROR"
  var message: String {
    switch self {
    case .invalidInput: "Search for a place or address using 3–160 characters."
    case .missingKey: "Location search needs a Google Maps API key with Places API (New) enabled. You can still choose a point on the map."
    case .accessDenied: "Google Places access was denied. Check that Places API (New) is enabled and the API key is authorised."
    case .rateLimited: "Location search has reached its request limit. Try again later or choose a point on the map."
    case .providerError: "Location search is unavailable. Try again or choose a point on the map."
    }
  }
  var error: WallyError { WallyError(rawValue, message) }
}

public func normaliseSearchQuery(_ value: String) -> String? {
  let query = value.split(whereSeparator: \.isWhitespace).joined(separator: " ")
  return (3...160).contains(query.count) ? query : nil
}

func normaliseSearchResults(_ raw: [Any]) -> [LocationSearchResult] {
  var results: [LocationSearchResult] = []
  for value in raw.prefix(5) {
    let place = record(value)
    let name = (record(place?["displayName"])?["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let address = (place?["formattedAddress"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let location = record(place?["location"])
    guard let id = place?["id"] as? String, !id.isEmpty, id.count <= 120, !name.isEmpty, name.count <= 180, address.count <= 500,
          let lat = number(location?["latitude"]), let lng = number(location?["longitude"]) else { continue }
    let coordinates = Coordinates(lat: lat, lng: lng)
    guard isCoordinates(coordinates), !results.contains(where: { $0.id == "google-\(id)" }) else { continue }
    // Search results use provider attribution only, never review authors.
    let attributions = normaliseAttributions(((place?["attributions"] as? [Any]) ?? []).filter { record($0)?["provider"] != nil })
    results.append(LocationSearchResult(id: "google-\(id)", name: name, address: address, coordinates: coordinates, attributions: attributions))
  }
  return results
}

/// One Places Text Search request, at most five results, biased to a 10 km circle.
public func searchLocationPlaces(_ client: GoogleClient, query rawQuery: String, near: Coordinates?) async throws -> [LocationSearchResult] {
  guard let query = normaliseSearchQuery(rawQuery), near == nil || isCoordinates(near) else { throw SearchErrorCode.invalidInput.error }
  guard client.hasKey else { throw SearchErrorCode.missingKey.error }
  var body: [String: Any] = ["textQuery": query, "pageSize": 5]
  if let near { body["locationBias"] = ["circle": ["center": ["latitude": near.lat, "longitude": near.lng], "radius": 10000]] }
  let request = try client.request(URL(string: "https://places.googleapis.com/v1/places:searchText")!,
    fieldMask: "places.id,places.displayName,places.formattedAddress,places.location,places.attributions", body: body, timeout: 10)
  let data: Data, response: HTTPURLResponse
  do { (data, response) = try await client.transport.send(request) } catch { throw SearchErrorCode.providerError.error }
  if response.statusCode == 403 { throw SearchErrorCode.accessDenied.error }
  if response.statusCode == 429 { throw SearchErrorCode.rateLimited.error }
  guard (200..<300).contains(response.statusCode), let result = record(try? JSONSerialization.jsonObject(with: data)), result["error"] == nil,
        result["places"] == nil || result["places"] is [Any] else { throw SearchErrorCode.providerError.error }
  return normaliseSearchResults((result["places"] as? [Any]) ?? [])
}
