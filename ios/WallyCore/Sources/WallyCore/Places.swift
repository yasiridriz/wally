import Foundation

let includedTypes = ["park", "botanical_garden", "tourist_attraction", "historical_landmark", "monument", "museum", "art_gallery", "observation_deck"]
// Photos share the Nearby Search Pro tier with displayName, so they add no request cost.
public let placesFieldMask = "places.id,places.displayName,places.location,places.types,places.attributions,places.photos"
let viewpointTypes = ["observation_deck", "scenic_spot"]
let activityTypes = ["hiking_area", "botanical_garden", "art_gallery", "museum", "market"]
private let scenic: [PlaceCategory: Double] = [.park: 85, .viewpoint: 95, .historic: 80, .art: 78, .attraction: 72, .path: 70]
private let descriptions: [PlaceCategory: String] = [
  .park: "A green pause among the city streets.", .viewpoint: "A viewpoint worth slowing down for.",
  .historic: "A piece of local history to discover on foot.", .art: "A place to discover art along the way; opening hours may vary.",
  .attraction: "A local point of interest along the way; this walk stops outside.", .path: "A pedestrian path for a change of scenery.",
]

public func isPhotoName(_ name: String) -> Bool {
  name.range(of: #"^places/[A-Za-z0-9_-]{1,300}/photos/[A-Za-z0-9_-]{1,1000}$"#, options: .regularExpression) != nil
}

private func category(_ types: [String]) -> PlaceCategory? {
  func any(_ values: [String]) -> Bool { types.contains(where: values.contains) }
  if any(["observation_deck", "scenic_spot"]) { return .viewpoint }
  if any(["park", "city_park", "national_park", "state_park", "botanical_garden", "garden"]) { return .park }
  if any(["historical_landmark", "historical_place", "monument", "castle", "cultural_landmark", "history_museum"]) { return .historic }
  if any(["art_gallery", "art_museum", "sculpture"]) { return .art }
  if types.contains("hiking_area") { return .path }
  if any(["tourist_attraction", "museum", "market", "farmers_market", "flea_market"]) { return .attraction }
  return nil
}

private func activity(_ types: [String], _ kind: PlaceCategory) -> (Double, String) {
  func any(_ values: [String]) -> Bool { types.contains(where: values.contains) }
  if kind == .viewpoint { return (4, "Pause for the view") }
  if any(["market", "farmers_market", "flea_market"]) { return (5, "Browse the market; check opening hours") }
  if types.contains("botanical_garden") { return (5, "Enjoy a short garden stroll; check access and opening hours") }
  if any(["art_gallery", "art_museum"]) { return (5, "Look at the gallery exterior or window displays; check hours before entering") }
  if any(["museum", "history_museum"]) { return (5, "Explore the museum exterior; check hours before entering") }
  if kind == .path { return (4, "Try a short stretch of the trail") }
  if kind == .park { return (3, "Take a quiet pause among the greenery") }
  if kind == .historic { return (3, "Pause to notice the landmark's details") }
  return (3, "Take a closer look from outside")
}

/// Keep only the first valid photo name; the image itself is requested on demand.
private func firstPhoto(_ raw: Any?) -> PlacePhotoRef? {
  guard let raw = raw as? [Any] else { return nil }
  for value in raw.prefix(10) {
    if let photo = record(value), let name = photo["name"] as? String, isPhotoName(name) {
      return PlacePhotoRef(name: name, authorAttributions: Array(normaliseAttributions(photo["authorAttributions"]).prefix(5)))
    }
  }
  return nil
}

/// Normalise named, relevant, nearby Google Places; scores are category proxies.
public func normalisePlaces(_ elements: [Any], start: Coordinates, radius: Double) -> [Place] {
  guard isCoordinates(start), radius.isFinite, radius >= 100, radius <= 3500 else { return [] }
  var places: [Place] = []
  for raw in elements.prefix(20) {
    let element = record(raw)
    let name = (record(element?["displayName"])?["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let location = record(element?["location"])
    guard let id = element?["id"] as? String, !id.isEmpty, id.count <= 120, !name.isEmpty, name.count <= 180,
          let lat = number(location?["latitude"]), let lng = number(location?["longitude"]) else { continue }
    let coordinates = Coordinates(lat: lat, lng: lng)
    let types = Array(((element?["types"] as? [Any]) ?? []).compactMap { $0 as? String }.prefix(30))
    guard let kind = category(types), isCoordinates(coordinates), distanceMeters(start, coordinates) <= radius else { continue }
    let normalizedId = "google-\(id)"
    if places.contains(where: { $0.id == normalizedId || distanceMeters($0.coordinates, coordinates) < 45 || ($0.name.lowercased() == name.lowercased() && distanceMeters($0.coordinates, coordinates) < 180) }) { continue }
    let (visit, suggestion) = activity(types, kind)
    places.append(Place(id: normalizedId, name: name, lat: lat, lng: lng, category: kind, description: descriptions[kind], baseScenicScore: scenic[kind] ?? 70,
                        tags: ["source": "google", "google_types": types.joined(separator: ",")], attributions: normaliseAttributions(element?["attributions"]),
                        visitMinutes: visit, suggestedActivity: suggestion, photo: firstPhoto(element?["photos"])))
  }
  return places.sorted { a, b in
    a.baseScenicScore != b.baseScenicScore ? a.baseScenicScore > b.baseScenicScore : distanceMeters(start, a.coordinates) < distanceMeters(start, b.coordinates)
  }
}

enum RankPreference: String { case distance = "DISTANCE", popularity = "POPULARITY" }

func queryPlaces(_ client: GoogleClient, center: Coordinates, radius: Double, types: [String], rank: RankPreference) async throws -> [Place] {
  guard isCoordinates(center), radius.isFinite, radius >= 100, radius <= 3500 else { throw ProviderError("Invalid discovery area.") }
  guard client.hasKey else { throw ProviderError("Live place discovery needs a Google Maps API key. Select Demo Mode for sample walks.", status: 401) }
  let request = try client.request(URL(string: "https://places.googleapis.com/v1/places:searchNearby")!, fieldMask: placesFieldMask, body: [
    "includedTypes": types, "maxResultCount": 20, "rankPreference": rank.rawValue,
    "locationRestriction": ["circle": ["center": ["latitude": center.lat, "longitude": center.lng], "radius": radius]],
  ], timeout: 10)
  let data: Data, response: HTTPURLResponse
  do { (data, response) = try await client.transport.send(request) }
  catch { throw ProviderError("Nearby place discovery could not connect. Please try again or select Demo Mode.") }
  if response.statusCode == 403 { throw ProviderError("Google Places access was denied. Check that Places API (New) is enabled and the API key is authorised.", status: 403) }
  if response.statusCode == 429 { throw ProviderError("Google Places is at its request limit. Try again later or select Demo Mode.", status: 429) }
  guard (200..<300).contains(response.statusCode) else { throw ProviderError("Nearby place discovery is unavailable. Please try again or select Demo Mode.", status: response.statusCode) }
  guard let result = record(try? JSONSerialization.jsonObject(with: data)), result["error"] == nil, result["places"] == nil || result["places"] is [Any] else {
    throw ProviderError("Nearby place discovery returned invalid results. Please try again or select Demo Mode.")
  }
  return normalisePlaces((result["places"] as? [Any]) ?? [], start: center, radius: radius)
}

struct DiscoveryQuery { var center: Coordinates; var radius: Double; var types: [String]; var rank: RankPreference }

/// Sequential queries, capped at six. Authorisation and rate-limit failures stop the rest.
private func queryAreas(_ client: GoogleClient, _ queries: [DiscoveryQuery]) async throws -> [[Place]] {
  var groups: [[Place]] = []
  var successes = 0
  var failure: Error?
  for query in queries.prefix(6) {
    do {
      groups.append(try await queryPlaces(client, center: query.center, radius: query.radius, types: query.types, rank: query.rank))
      successes += 1
    } catch {
      groups.append([])
      failure = error
      if let error = error as? ProviderError, [401, 403, 429].contains(error.status) { break }
    }
  }
  if successes == 0, let failure { throw failure }
  return groups
}

func mergePlaceGroups(_ groups: [[Place]], accepts: (Place) -> Bool) -> [Place] {
  var selected: [Place] = []
  func add(_ place: Place) {
    if selected.count >= 20 || !accepts(place) || selected.contains(where: { $0.id == place.id || distanceMeters($0.coordinates, place.coordinates) < 45 || ($0.name.lowercased() == place.name.lowercased() && distanceMeters($0.coordinates, place.coordinates) < 180) }) { return }
    selected.append(place)
  }
  // Reserve a little space for actual viewpoint and activity query results.
  for group in groups.suffix(2) { for place in group.prefix(2) { add(place) } }
  // Round-robin discovery areas so the nearest streets cannot consume all slots.
  for index in 0..<20 where selected.count < 20 { for group in groups where index < group.count { add(group[index]) } }
  return selected
}

public func discoverLoopPlaces(_ client: GoogleClient, _ request: GenerateRequest) async throws -> [Place] {
  guard isCoordinates(request.start) else { throw ProviderError("Invalid loop discovery area or duration.") }
  let radius = searchRadius(request.minutes, isLoop: true)
  let outerRadius = max(700, min(1100, radius * 0.4)).rounded()
  var queries = [DiscoveryQuery(center: request.start, radius: min(750, radius), types: includedTypes, rank: .distance)]
  if request.minutes >= 45 { queries += [0.0, 120, 240].map { DiscoveryQuery(center: offset(request.start, meters: radius * 0.75, degrees: $0), radius: outerRadius, types: includedTypes, rank: .popularity) } }
  queries += [DiscoveryQuery(center: request.start, radius: radius, types: viewpointTypes, rank: .popularity), DiscoveryQuery(center: request.start, radius: radius, types: activityTypes, rank: .popularity)]
  return mergePlaceGroups(try await queryAreas(client, queries)) { distanceMeters(request.start, $0.coordinates) <= radius }
}

public func discoverExplorePlaces(_ client: GoogleClient, _ request: GenerateRequest) async throws -> [Place] {
  guard isCoordinates(request.start) else { throw ProviderError("Invalid exploration area or duration.") }
  let radius = searchRadius(request.minutes, isLoop: false)
  let outerRadius = max(700, min(1400, radius * 0.4)).rounded()
  var queries = [DiscoveryQuery(center: request.start, radius: max(100, min(1000, radius * 0.4)), types: includedTypes, rank: .popularity)]
  if request.minutes >= 45 { queries += [0.0, 120, 240].map { DiscoveryQuery(center: offset(request.start, meters: radius * 0.78, degrees: $0), radius: outerRadius, types: includedTypes, rank: .popularity) } }
  queries += [DiscoveryQuery(center: request.start, radius: radius, types: viewpointTypes, rank: .popularity), DiscoveryQuery(center: request.start, radius: radius, types: activityTypes, rank: .popularity)]
  return mergePlaceGroups(try await queryAreas(client, queries)) { distanceMeters(request.start, $0.coordinates) <= radius }
}

public func discoverTargetedPlaces(_ client: GoogleClient, _ request: GenerateRequest) async throws -> [Place] {
  guard isCoordinates(request.start), let destination = request.destination, isCoordinates(destination) else {
    throw ProviderError("Choose a valid starting point, destination and duration before discovering places.")
  }
  let directDistance = distanceMeters(request.start, destination)
  // This generous geographic envelope is only a discovery filter. Actual
  // walking, stop visits and the safety buffer determine route eligibility.
  let travelEnvelope = max(350, Double(request.minutes - 5) * 80)
  if directDistance > travelEnvelope { return [] }
  let bearing = initialBearing(request.start, destination)
  let midpoint = offset(request.start, meters: directDistance / 2, degrees: bearing)
  let spareMeters = max(0, travelEnvelope - directDistance)
  let broadRadius = max(350, min(3500, directDistance / 3 + spareMeters * 0.22)).rounded()
  let lateralDistance = min(2800, spareMeters * 0.3)
  let centers = lateralDistance >= 300
    ? [request.start, destination, offset(midpoint, meters: lateralDistance, degrees: bearing + 90), offset(midpoint, meters: lateralDistance, degrees: bearing - 90)]
    : [request.start, midpoint, destination]
  let focusRadius = max(350, min(3500, travelEnvelope / 2)).rounded()
  let queries = centers.map { DiscoveryQuery(center: $0, radius: broadRadius, types: includedTypes, rank: .popularity) } + [
    DiscoveryQuery(center: midpoint, radius: focusRadius, types: viewpointTypes, rank: .popularity),
    DiscoveryQuery(center: midpoint, radius: focusRadius, types: activityTypes, rank: .popularity),
  ]
  return mergePlaceGroups(try await queryAreas(client, queries)) { distanceMeters(request.start, $0.coordinates) + distanceMeters($0.coordinates, destination) <= travelEnvelope }
}
