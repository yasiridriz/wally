import XCTest
@testable import WallyCore

final class ScoringTests: XCTestCase {
  func testDurationFitAcceptsNinetyToHundredPercent() {
    XCTAssertTrue(durationTimeFit(81, 90))
    XCTAssertTrue(durationTimeFit(90, 90))
    XCTAssertFalse(durationTimeFit(80, 90))
    XCTAssertFalse(durationTimeFit(91, 90))
    XCTAssertTrue(durationTimeFit(27, 30))
    XCTAssertFalse(durationTimeFit(26, 30))
  }

  func testTimingCountsWalkingVisitsAndBuffer() {
    let timing = estimateExperienceWithStops(durationSeconds: 1201, stops: [place("a"), Place(id: "b", name: "B", lat: 0, lng: 0, category: .viewpoint, baseScenicScore: 95, visitMinutes: 4)])
    XCTAssertEqual(timing, Timing(walkingMinutes: 21, stopMinutes: 6, bufferMinutes: 3, totalMinutes: 30))
  }

  func testRankingPrefersClosestTotalThenDistinctStops() {
    let a = route { $0.id = "a"; $0.totalMinutes = 29; $0.score = 50 }
    let b = route { $0.id = "b"; $0.totalMinutes = 30; $0.score = 40 }
    let c = route { $0.id = "c"; $0.totalMinutes = 28; $0.stops = [place("x"), place("y", lat: 55.95)] }
    let short = route { $0.id = "short"; $0.totalMinutes = 20 }
    XCTAssertEqual(rankTimeMatchedRoutes([a, b, c, short], budget: 30).map(\.id), ["b", "c"])
  }

  func testRepetitionPenalisesOutAndBackPaths() {
    let p = Coordinates(lat: 55.9, lng: -3.1), q = Coordinates(lat: 55.91, lng: -3.1)
    XCTAssertEqual(repetitionPenalty([p, q, p]), 10)
    XCTAssertEqual(repetitionPenalty([p, q]), 0)
  }

  func testMoodScoringAndVisitedNovelty() {
    let park = place("park")
    XCTAssertEqual(preferenceScore(park, [.green]), 100)
    XCTAssertEqual(preferenceScore(park, [.historic]), 30)
    XCTAssertEqual(preferenceScore(park, [.historic, .green]), 100)
    XCTAssertEqual(preferenceScore(park, []), 75)
    XCTAssertGreaterThan(scorePlaces([park], moods: [.green], visitedIds: []), scorePlaces([park], moods: [.green], visitedIds: ["park"]))
  }

  func testRunningCoversGroundFasterAndSearchesFurther() {
    XCTAssertGreaterThan(searchRadius(30, isLoop: true, speed: Pace.run.speed), searchRadius(30, isLoop: true) * 2)
    XCTAssertEqual(searchRadius(90, isLoop: false, speed: Pace.run.speed), (84 * 65 * Pace.runSpeed / 1.5).rounded())
    let walk = demoRouteSamples(GenerateRequest(start: demoStart, duration: .m90, mode: .loop))
    let run = demoRouteSamples(GenerateRequest(start: demoStart, duration: .m90, mode: .loop, pace: .run))
    XCTAssertFalse(run.isEmpty)
    for route in run {
      guard let walked = walk.first(where: { $0.id == route.id }) else { continue }
      XCTAssertLessThanOrEqual(route.walkingMinutes, Int((Double(walked.walkingMinutes) / 2).rounded(.up)))
    }
  }

  func testLoopReturnViaAndRetrace() {
    let s = Coordinates(lat: 55.95, lng: -3.19)
    let outAndBack = [s, Coordinates(lat: 55.95, lng: -3.185), Coordinates(lat: 55.95, lng: -3.18), Coordinates(lat: 55.95, lng: -3.185), s]
    XCTAssertEqual(retraceShare(outAndBack), 0.5)
    XCTAssertEqual(retraceShare([s, Coordinates(lat: 55.95, lng: -3.18), Coordinates(lat: 55.96, lng: -3.18), s]), 0)
    let stops = [place("a", lat: 55.953, lng: -3.185), place("b", lat: 55.95, lng: -3.17)]
    // The first stop is north of the return line, so the way home bends south.
    XCTAssertLessThan(returnViaPoint(stops, s)!.lat, 55.95)
    XCTAssertNil(returnViaPoint([place("near", lat: 55.9501, lng: -3.19)], s))
  }

  func testDurationsAllowAnyMinuteUpToEightHours() {
    XCTAssertEqual(WalkDuration(rawValue: 135)?.rawValue, 135)
    XCTAssertEqual(WalkDuration(rawValue: 480)?.rawValue, 480)
    XCTAssertNil(WalkDuration(rawValue: 481))
    XCTAssertNil(WalkDuration(rawValue: 4))
    XCTAssertEqual(WalkDuration(clamping: 999).rawValue, 480)
    XCTAssertGreaterThan(searchRadius(180, isLoop: false), 7000)
    XCTAssertEqual(searchRadius(480, isLoop: false, speed: 5), maxSearchRadius)
    let saved = Preferences(duration: WalkDuration(clamping: 200)).persistable()
    XCTAssertEqual(Preferences.restore(saved, hasLiveSetup: true).duration.rawValue, 200)
  }

  func testPathMemoryAvoidsRepeatsAndPrefersFavourites() {
    let a = place("a"), b = place("b"), c = place("c"), d = place("d")
    var request = GenerateRequest(start: start, duration: .m30, mode: .loop)
    XCTAssertEqual(memoryScore([a, b], request), 0)
    request.memory = [MemoryHint(stopIds: ["a", "b"])]
    XCTAssertEqual(memoryScore([a, b], request), -30)
    XCTAssertLessThan(memoryScore([a, b], request), memoryScore([a, c], request))
    XCTAssertEqual(memoryScore([c, d], request), 0)
    request.memory = [MemoryHint(stopIds: ["a", "b"], favourite: true)]
    XCTAssertEqual(memoryScore([a, b], request), -30)
    request.favourites = true
    XCTAssertEqual(memoryScore([a, b], request), 85)
    request = GenerateRequest(start: start, duration: .m30, mode: .loop)
    request.memory = [MemoryHint(stopIds: ["a", "b"], rating: 5)]
    let loved = memoryScore([a, c, d], request)
    request.memory = [MemoryHint(stopIds: ["a", "b"], rating: 1)]
    XCTAssertGreaterThan(loved, memoryScore([a, c, d], request))
  }

  func testFavouritePlacesJoinDiscoveryAndRankingUsesMemory() {
    var request = GenerateRequest(start: start, duration: .m30, mode: .loop)
    request.favourites = true
    request.favouritePlaces = [place("fav"), place("b")]
    XCTAssertEqual(withFavouritePlaces([place("x"), place("b")], request) { _ in true }.map(\.id), ["fav", "b", "x"])
    request.favourites = false
    XCTAssertEqual(withFavouritePlaces([place("x")], request) { _ in true }.map(\.id), ["x"])
    var favourite = demoRouteSamples(GenerateRequest(start: demoStart, duration: .m90, mode: .loop))[0]
    var fresh = favourite
    favourite.id = "fav"; favourite.totalMinutes = 84; favourite.memoryScore = 60
    fresh.id = "new"; fresh.totalMinutes = 88; fresh.stops = [place("n1"), place("n2")]
    XCTAssertEqual(rankTimeMatchedRoutes([fresh, favourite], budget: 90).map(\.id), ["fav", "new"])
  }

  func testReviewsKeepNewestAndAverageByPlace() {
    let route = demoRouteSamples(GenerateRequest(start: demoStart, duration: .m90, mode: .loop))[0]
    var entry = HistoryEntry(id: "r1", route: route, mode: .loop, pace: .walk, moods: [], duration: 90, rating: 2)
    XCTAssertNil(ReviewRecord(entry), "Demo routes are never stored")
    entry.source = .live
    let older = ReviewRecord(entry, at: Date(timeIntervalSince1970: 0))!
    entry.rating = 5
    let newer = ReviewRecord(entry, at: Date(timeIntervalSince1970: 100))!
    let encoder = JSONEncoder()
    let lines = [older, newer].map { String(data: try! encoder.encode($0), encoding: .utf8)! }.joined(separator: "\n") + "\n{broken"
    let latest = latestReviews(lines)
    XCTAssertEqual(latest.map(\.rating), [5])
    XCTAssertEqual(placeRatings(latest)[route.stops[0].id], PlaceRating(average: 5, count: 1))
    // A favourite without stars is stored with an explicit null rating, like the web store.
    var favouriteOnly = HistoryEntry(id: "r2", route: route, mode: .loop, pace: .walk, moods: [], duration: 90, favourite: true)
    favouriteOnly.source = .live
    let json = String(data: try! encoder.encode(ReviewRecord(favouriteOnly)!), encoding: .utf8)!
    XCTAssertTrue(json.contains("\"rating\":null"))
    XCTAssertTrue(json.contains("\"v\":1"))
  }

  func testMultipleMoodsFavourCoverageAndKeepMinorityTags() {
    let mixed = [place("a", category: .park), place("b", category: .historic)]
    let parks = [place("c", category: .park), place("d", category: .park)]
    XCTAssertGreaterThan(scorePlaces(mixed, moods: [.green, .historic], visitedIds: []), scorePlaces(parks, moods: [.green, .historic], visitedIds: []))
    let places = (0..<24).map { place("p\($0)", category: .park) } + [place("h1", category: .historic), place("h2", category: .historic)]
    let shortlist = shortlistForMoods(places, [.green, .historic])
    XCTAssertEqual(shortlist.count, 20)
    XCTAssertTrue(Set(shortlist.map(\.id)).isSuperset(of: ["h1", "h2"]))
    XCTAssertEqual(shortlistForMoods(places, []).map(\.id), places.prefix(20).map(\.id))
  }
}

final class CandidateTests: XCTestCase {
  private func ring(_ count: Int, meters: Double) -> [Place] {
    (0..<count).map { index in
      let point = offset(start, meters: meters, degrees: Double(index) * 360 / Double(count))
      return place("p\(index)", score: 80 + Double(index), lat: point.lat, lng: point.lng)
    }
  }

  func testLoopCandidatesStayInsideTheHeadroom() {
    let request = GenerateRequest(start: start, duration: .m30, mode: .loop)
    let pool = loopCandidatePool(ring(8, meters: 500), request)
    XCTAssertFalse(pool.isEmpty)
    for candidate in pool {
      XCTAssertTrue((2...3).contains(candidate.stops.count))
      XCTAssertLessThanOrEqual(Double(estimateExperienceWithStops(durationSeconds: candidate.geographicMeters, stops: candidate.stops).totalMinutes), 30 * 1.25)
    }
  }

  func testTargetedCandidatesMayUseOneStopAndShortlistIsDistinct() {
    let request = GenerateRequest(start: start, duration: .m30, moods: [.scenic], mode: .destination, destination: offset(start, meters: 900, degrees: 90))
    let pool = openCandidatePool(ring(6, meters: 400), request)
    XCTAssertTrue(pool.contains { $0.stops.count == 1 })
    let shortlist = shortlistCandidates(ring(6, meters: 400), request)
    XCTAssertEqual(Set(shortlist.map { $0.map(\.id).sorted() }).count, shortlist.count)
  }
}

final class WalkSummaryTests: XCTestCase {
  private func query(_ url: URL?) -> [String: String] {
    XCTAssertTrue(url?.absoluteString.hasPrefix("https://www.google.com/maps/dir/?") == true)
    return Dictionary(uniqueKeysWithValues: (URLComponents(url: url!, resolvingAgainstBaseURL: false)?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
  }

  func testSummaryStopsPreferPhotosAndScoresInWalkOrder() {
    let stops = [place("a", score: 70), place("b", score: 99, photo: false), place("c", score: 95), place("d", score: 80), place("e", score: 90)]
    XCTAssertEqual(summaryStops(stops).map(\.id), ["c", "d", "e"])
    XCTAssertEqual(baseRouteId("abc:sample-history"), "abc")
  }

  func testLoopLinkReturnsToStartWithPlaceIds() {
    let items = query(googleMapsDirectionsURL(route()))
    XCTAssertEqual(items["travelmode"], "walking")
    XCTAssertEqual(items["origin"], "55.944200,-3.190550")
    XCTAssertEqual(items["destination"], "55.944200,-3.190550")
    XCTAssertEqual(items["waypoints"], "55.945000,-3.190000|55.946000,-3.188000")
    XCTAssertEqual(items["waypoint_place_ids"], "a|b")
    XCTAssertTrue(googleMapsDirectionsURL(route())!.absoluteString.contains("%7C"))
  }

  func testExploreAndTargetedEndpoints() {
    let explore = query(googleMapsDirectionsURL(route { $0.isLoop = false }))
    XCTAssertEqual(explore["destination"], "55.946000,-3.188000")
    XCTAssertEqual(explore["destination_place_id"], "b")
    XCTAssertEqual(explore["waypoint_place_ids"], "a")
    let targeted = query(googleMapsDirectionsURL(route { $0.isLoop = false; $0.destination = demoDestination }))
    XCTAssertEqual(targeted["destination"], "55.946950,-3.189100")
  }

  func testEventStaysInPositionAndPartialPlaceIdsAreOmitted() {
    let event = SampleEvent(id: "e", name: "Event", location: Coordinates(lat: 55.9455, lng: -3.189), startTime: Date(), endTime: Date(), visitMinutes: 8, category: "art", description: "")
    let items = query(googleMapsDirectionsURL(route { $0.event = event; $0.eventStopIndex = 1 }))
    XCTAssertEqual(items["waypoints"], "55.945000,-3.190000|55.945500,-3.189000|55.946000,-3.188000")
    XCTAssertNil(items["waypoint_place_ids"])
  }

  func testNoLinkWithoutAnEndpointOrValidStart() {
    XCTAssertNil(googleMapsDirectionsURL(route { $0.isLoop = false; $0.stops = [] }))
    XCTAssertNil(googleMapsDirectionsURL(route { $0.start = Coordinates(lat: .nan, lng: 0) }))
  }
}

final class DemoAndEventTests: XCTestCase {
  func testDemoRoutesFitTheBudgetAndTargetedFinishesAtTheMuseum() {
    for mode in RouteMode.allCases {
      for duration in WalkDuration.allCases {
        for route in generateDemoRoutes(GenerateRequest(start: demoStart, duration: duration, mode: mode)) {
          XCTAssertTrue(durationTimeFit(route.totalMinutes, duration.rawValue))
          XCTAssertEqual(route.source, .demo)
          if mode == .destination { XCTAssertEqual(route.destination, demoDestination) }
        }
      }
    }
  }

  /// Totals measured from the web `generateDemoRoutes`, so both apps offer the same samples.
  func testDemoTotalsMatchTheWebApp() {
    func totals(_ mode: RouteMode, _ duration: WalkDuration) -> [Int] { generateDemoRoutes(GenerateRequest(start: demoStart, duration: duration, mode: mode)).map(\.totalMinutes) }
    XCTAssertEqual(totals(.loop, .m15), [14])
    XCTAssertEqual(totals(.destination, .m15), [15])
    for duration in [WalkDuration.m30, .m45, .m60, .m90] { XCTAssertEqual(totals(.loop, duration), []); XCTAssertEqual(totals(.destination, duration), []) }
    for duration in WalkDuration.allCases { XCTAssertEqual(totals(.explore, duration), []) }
  }

  func testEventTimingIncludesWaitingAndRejectsLateFinishes() {
    let departure = Date(timeIntervalSince1970: 1_000_000)
    let event = SampleEvent(id: "e", name: "E", location: start, startTime: departure.addingTimeInterval(10 * 60), endTime: departure.addingTimeInterval(60 * 60), visitMinutes: 8, category: "art", description: "")
    XCTAssertEqual(evaluateEventTiming(walkingMinutes: 12, stopMinutes: 4, bufferMinutes: 2, arrivalMinutes: 5, event: event, departure: departure, budgetMinutes: 31)?.waitMinutes, 5)
    XCTAssertNil(evaluateEventTiming(walkingMinutes: 12, stopMinutes: 4, bufferMinutes: 2, arrivalMinutes: 5, event: event, departure: departure, budgetMinutes: 30))
    XCTAssertNil(evaluateEventTiming(walkingMinutes: 12, stopMinutes: 4, bufferMinutes: 2, arrivalMinutes: 58, event: event, departure: departure, budgetMinutes: 90))
  }

  func testPreferencesMigrateLegacyModeAndNeverPersistDemo() {
    let legacy = try! JSONSerialization.data(withJSONObject: ["duration": 45, "mood": "green", "mode": "explore", "includeEvents": true])
    XCTAssertEqual(Preferences.restore(legacy, hasLiveSetup: true), Preferences(duration: .m45, moods: [.green], mode: .loop, includeEvents: true, demo: false))
    let saved = Preferences(duration: .m60, moods: [.historic, .scenic], mode: .explore, demo: true).persistable()
    XCTAssertEqual(Preferences.restore(saved, hasLiveSetup: true).mode, .explore)
    XCTAssertEqual(Preferences.restore(saved, hasLiveSetup: true).moods, [.scenic, .historic])
    XCTAssertEqual(Preferences.restore(Preferences(pace: .run).persistable(), hasLiveSetup: true).pace, .run)
    XCTAssertEqual(Preferences.restore(saved, hasLiveSetup: true).pace, .walk)
    XCTAssertTrue(Preferences.restore(Preferences(favourites: true).persistable(), hasLiveSetup: true).favourites)
    let v2 = try! JSONSerialization.data(withJSONObject: ["version": 2, "duration": 30, "mood": "surprise", "mode": "explore"])
    XCTAssertEqual(Preferences.restore(v2, hasLiveSetup: true).moods, [])
    let bad = try! JSONSerialization.data(withJSONObject: ["version": 3, "duration": 30, "moods": ["nope"], "mode": "loop"])
    XCTAssertEqual(Preferences.restore(bad, hasLiveSetup: true), Preferences.defaults)
    XCTAssertFalse(String(data: saved, encoding: .utf8)!.contains("demo"))
    XCTAssertTrue(Preferences.restore(Data("bad".utf8), hasLiveSetup: false).demo)
  }
}
