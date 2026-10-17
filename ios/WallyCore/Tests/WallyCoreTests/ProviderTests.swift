import XCTest
@testable import WallyCore

final class PlacesTests: XCTestCase {
  func testNormalisationMapsCategoriesAndKeepsFirstValidPhoto() {
    let photos: [Any] = [["name": "../../evil"], ["name": "places/one/photos/AbC_-1", "authorAttributions": [["displayName": "A. Walker", "uri": "https://maps.google.com/contrib/1"], ["displayName": "Bad", "uri": "javascript:alert(1)"]]]]
    let places = normalisePlaces([googlePlace("one", type: "observation_deck", photos: photos)], start: start, radius: 1000)
    XCTAssertEqual(places.first?.category, .viewpoint)
    XCTAssertEqual(places.first?.id, "google-one")
    XCTAssertEqual(places.first?.photo, PlacePhotoRef(name: "places/one/photos/AbC_-1", authorAttributions: [Attribution(displayName: "A. Walker", uri: "https://maps.google.com/contrib/1"), Attribution(displayName: "Bad")]))
  }

  func testNormalisationRejectsMalformedUnsupportedAndDistantPlaces() {
    let input: [Any] = [NSNull(), [:], googlePlace("c", type: "restaurant"), googlePlace("d", lat: 0, lng: 0), googlePlace("same"), googlePlace("same", lat: start.lat + 0.005)]
    XCTAssertEqual(normalisePlaces(input, start: start, radius: 1000).map(\.id), ["google-same"])
    XCTAssertEqual(normalisePlaces([googlePlace("x")], start: start, radius: 3501), [])
  }

  func testNearbySearchSendsKeyHeaderFieldMaskAndBundleId() async throws {
    let transport = MockTransport { _ in (200, ["places": [googlePlace("one")]]) }
    let request = GenerateRequest(start: start, duration: .m30, mode: .loop)
    _ = try await discoverLoopPlaces(client(transport), request)
    let first = transport.requests[0]
    XCTAssertEqual(first.url?.absoluteString, "https://places.googleapis.com/v1/places:searchNearby")
    XCTAssertEqual(first.value(forHTTPHeaderField: "X-Goog-Api-Key"), "test-key")
    XCTAssertEqual(first.value(forHTTPHeaderField: "X-Ios-Bundle-Identifier"), "com.example.wally")
    XCTAssertEqual(first.value(forHTTPHeaderField: "X-Goog-FieldMask"), placesFieldMask)
    XCTAssertEqual(transport.count, 3)
    XCTAssertLessThanOrEqual(transport.count, 6)
  }

  func testLongWalksUseAtMostSixRequestsAndStopOnRateLimit() async throws {
    let transport = MockTransport { _ in (200, ["places": []]) }
    _ = try await discoverExplorePlaces(client(transport), GenerateRequest(start: start, duration: .m90, mode: .explore))
    XCTAssertEqual(transport.count, 6)
    let limited = MockTransport { _ in (429, [:]) }
    do { _ = try await discoverLoopPlaces(client(limited), GenerateRequest(start: start, duration: .m90, mode: .loop)); XCTFail("Expected a rate-limit error") }
    catch { XCTAssertEqual((error as? ProviderError)?.status, 429) }
    XCTAssertEqual(limited.count, 1)
  }
}

final class RoutingTests: XCTestCase {
  private let points = [Coordinates(lat: 55.95, lng: -3.19), Coordinates(lat: 55.96, lng: -3.18)]
  private func payload(legs: Int = 1) -> [String: Any] {
    ["routes": [["polyline": ["geoJsonLinestring": ["type": "LineString", "coordinates": [[-3.19, 55.95], [-3.18, 55.96]]]], "distanceMeters": 1000, "duration": "800.5s", "legs": Array(repeating: ["duration": "400.25s"], count: legs), "warnings": ["Use caution."]]]]
  }

  func testRoutesRequestUsesWalkAndParsesGeometryAndTiming() async throws {
    let transport = MockTransport { _ in (200, self.payload()) }
    let result = try await routeWalking(client(transport), points, budget: RoutingBudget(remaining: 2))
    XCTAssertEqual(result.durationSeconds, 800.5)
    XCTAssertEqual(result.segmentSeconds, [400.25])
    XCTAssertEqual(result.geometry, points)
    XCTAssertEqual(result.warnings, ["Use caution."])
    XCTAssertEqual(transport.body(0)["travelMode"] as? String, "WALK")
    XCTAssertEqual(transport.requests[0].value(forHTTPHeaderField: "X-Goog-FieldMask"), "routes.duration,routes.distanceMeters,routes.polyline.geoJsonLinestring,routes.legs.duration,routes.warnings")
  }

  func testRetriesServerErrorsOnceButNotRateLimits() async {
    let failing = MockTransport { _ in (503, [:]) }
    let budget = RoutingBudget(remaining: 8)
    _ = try? await routeWalking(client(failing), points, budget: budget)
    XCTAssertEqual(failing.count, 2)
    let limited = MockTransport { _ in (429, [:]) }
    let limitedBudget = RoutingBudget(remaining: 8)
    _ = try? await routeWalking(client(limited), points, budget: limitedBudget)
    XCTAssertEqual(limited.count, 1)
    let canContinue = await limitedBudget.canContinue
    XCTAssertFalse(canContinue)
  }

  func testRejectsIncompleteTimingAndDistantEndpoints() async {
    let wrongLegs = MockTransport { _ in (200, self.payload(legs: 2)) }
    do { _ = try await routeWalking(client(wrongLegs), points, budget: RoutingBudget(remaining: 2)); XCTFail() } catch {}
    let far = MockTransport { _ in (200, self.payload()) }
    do { _ = try await routeWalking(client(far), [Coordinates(lat: 55.0, lng: -3.0), points[1]], budget: RoutingBudget(remaining: 2)); XCTFail() } catch {}
  }
}

final class PhotoAndServiceTests: XCTestCase {
  private let photoUri = "https://lh3.googleusercontent.com/place-photos/abc=s800"

  func testPhotoRequestKeepsTheKeyInAHeader() async {
    let transport = MockTransport { _ in (200, ["photoUri": self.photoUri]) }
    let url = await fetchPhotoUri(client(transport), name: "places/a/photos/r")
    XCTAssertEqual(url?.absoluteString, photoUri)
    XCTAssertEqual(transport.requests[0].url?.absoluteString, "https://places.googleapis.com/v1/places/a/photos/r/media?maxWidthPx=800&maxHeightPx=800&skipHttpRedirect=true")
    XCTAssertEqual(transport.requests[0].value(forHTTPHeaderField: "X-Goog-Api-Key"), "test-key")
    let rejected = await fetchPhotoUri(client(transport), name: "places/a/photos/r?key=x")
    XCTAssertNil(rejected)
    XCTAssertEqual(transport.count, 1)
  }

  func testUnsafePhotoUrlsAreRejected() async {
    for body in [["photoUri": "http://insecure.example/photo"], ["photoUri": "javascript:alert(1)"], [:]] {
      let url = await fetchPhotoUri(client(MockTransport { _ in (200, body) }), name: "places/a/photos/r")
      XCTAssertNil(url)
    }
  }

  func testSummaryMakesAtMostThreeRequests() async throws {
    let transport = MockTransport { _ in (200, ["photoUri": self.photoUri]) }
    let photos = try await summaryPhotos(client(transport), stops: [place("a", score: 70), place("b", score: 95), place("c", score: 99, photo: false), place("d", score: 85), place("e", score: 90)])
    XCTAssertEqual(transport.count, 3)
    XCTAssertEqual(photos.map(\.stopId), ["b", "d", "e"])
  }

  func testServiceRejectsUnknownRoutesAndReusesPhotoRequests() async throws {
    let transport = MockTransport { request in
      if request.url?.absoluteString.contains("/media") == true { return (200, ["photoUri": self.photoUri]) }
      return (500, [:])
    }
    let service = WallyService(client: client(transport))
    if case .success = await service.walkSummary(routeId: "unknown") { XCTFail("Unknown routes must not load photos") }
    let demo = await service.generateRoutes(GenerateRequest(start: start, duration: .m15, mode: .loop, demo: true))
    let routes = try demo.get().routes
    XCTAssertFalse(routes.isEmpty)
    XCTAssertEqual(routes[0].start, demoStart)
    let demoPhotos = try await service.walkSummary(routeId: routes[0].id).get()
    XCTAssertEqual(demoPhotos, [])
    XCTAssertEqual(transport.count, 0)
  }

  func testServiceValidatesDestinations() async {
    let service = WallyService(client: client(MockTransport { _ in (200, [:]) }))
    let close = await service.generateRoutes(GenerateRequest(start: start, duration: .m30, mode: .destination, destination: start))
    XCTAssertEqual(close.failureCode, "INVALID_DESTINATION")
    let far = await service.generateRoutes(GenerateRequest(start: start, duration: .m30, mode: .destination, destination: Coordinates(lat: 51.5, lng: -0.12)))
    XCTAssertEqual(far.failureCode, "DESTINATION_TOO_FAR")
    let missing = await service.generateRoutes(GenerateRequest(start: start, duration: .m30, mode: .destination))
    XCTAssertEqual(missing.failureCode, "INVALID_INPUT")
    let noKey = await WallyService(client: GoogleClient(apiKey: nil)).generateRoutes(GenerateRequest(start: start, duration: .m30, mode: .loop))
    XCTAssertEqual(noKey.failureCode, "MISSING_KEY")
  }

  func testSearchUsesTextSearchWithBias() async throws {
    let transport = MockTransport { _ in (200, ["places": [["id": "x", "displayName": ["text": "Castle"], "formattedAddress": "Edinburgh", "location": ["latitude": 55.948, "longitude": -3.199]]]]) }
    let results = try await WallyService(client: client(transport)).searchLocations(query: "  edinburgh   castle ", near: start).get()
    XCTAssertEqual(results.map(\.id), ["google-x"])
    XCTAssertEqual(transport.body(0)["textQuery"] as? String, "edinburgh castle")
    XCTAssertEqual(transport.body(0)["pageSize"] as? Int, 5)
  }
}

extension Result {
  var failureCode: String? { if case .failure(let error) = self { return (error as? WallyError)?.code }; return nil }
}

final class LiveGenerationTests: XCTestCase {
  func testLiveLoopUsesAtMostEightRoutingAttemptsAndFitsTheDuration() async throws {
    let ring: [Any] = (0..<8).map { index -> [String: Any] in
      let point = offset(start, meters: 450, degrees: Double(index) * 45)
      return googlePlace("p\(index)", type: index % 2 == 0 ? "park" : "museum", lat: point.lat, lng: point.lng)
    }
    let transport = MockTransport { request in
      if request.url?.host == "places.googleapis.com" { return (200, ["places": ring]) }
      let body = (try JSONSerialization.jsonObject(with: request.httpBody!)) as! [String: Any]
      func point(_ key: String) -> [Double] { let latLng = ((body[key] as! [String: Any])["location"] as! [String: Any])["latLng"] as! [String: Double]; return [latLng["longitude"]!, latLng["latitude"]!] }
      let legs = (body["intermediates"] as! [Any]).count + 1
      // 18 minutes walking + 2 buffer + 8 visit minutes (park and museum) fits a 30-minute walk.
      return (200, ["routes": [["polyline": ["geoJsonLinestring": ["type": "LineString", "coordinates": [point("origin"), [-3.185, 55.946], point("destination")]]], "distanceMeters": 1700, "duration": "1080s", "legs": Array(repeating: ["duration": "\(1080 / legs)s"], count: legs)]]])
    }
    let routes = try await generateLiveRoutes(client(transport), GenerateRequest(start: start, duration: .m30, mode: .loop))
    let routing = transport.requests.filter { $0.url?.host == "routes.googleapis.com" }
    XCTAssertFalse(routes.isEmpty)
    XCTAssertLessThanOrEqual(routing.count, 8)
    XCTAssertLessThanOrEqual(transport.requests.count - routing.count, 6)
    for route in routes {
      XCTAssertTrue(durationTimeFit(route.totalMinutes, 30))
      XCTAssertTrue(route.isLoop)
      XCTAssertEqual(route.source, .live)
    }
  }
}
