import Foundation
@testable import WallyCore

/// Records each request and returns queued responses in order. No test reaches Google.
final class MockTransport: HTTPTransport, @unchecked Sendable {
  private let lock = NSLock()
  private var handler: (URLRequest) throws -> (Int, Any)
  private(set) var requests: [URLRequest] = []
  init(_ handler: @escaping (URLRequest) throws -> (Int, Any)) { self.handler = handler }
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    let (status, body) = try lock.withLock { requests.append(request); return try handler(request) }
    let data = try (body as? Data) ?? JSONSerialization.data(withJSONObject: body, options: [.fragmentsAllowed])
    return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
  }
  var count: Int { lock.withLock { requests.count } }
  func body(_ index: Int) -> [String: Any] { (try? JSONSerialization.jsonObject(with: requests[index].httpBody ?? Data())) as? [String: Any] ?? [:] }
}

let start = Coordinates(lat: 55.9442, lng: -3.19055)

func client(_ transport: MockTransport, key: String? = "test-key") -> GoogleClient {
  GoogleClient(apiKey: key, bundleIdentifier: "com.example.wally", transport: transport)
}

func googlePlace(_ id: String, type: String = "park", lat: Double = start.lat, lng: Double = start.lng, photos: [Any]? = nil) -> [String: Any] {
  var place: [String: Any] = ["id": id, "displayName": ["text": "Place \(id)"], "location": ["latitude": lat, "longitude": lng], "types": [type, "point_of_interest"]]
  if let photos { place["photos"] = photos }
  return place
}

func place(_ id: String, score: Double = 80, photo: Bool = true, lat: Double = 55.945, lng: Double = -3.19, category: PlaceCategory = .park) -> Place {
  Place(id: id, name: "Stop \(id)", lat: lat, lng: lng, category: category, baseScenicScore: score, photo: photo ? PlacePhotoRef(name: "places/\(id)/photos/ref-\(id)") : nil)
}

func route(_ overrides: (inout WanderRoute) -> Void = { _ in }) -> WanderRoute {
  var value = WanderRoute(id: "route-1", name: "Walk", description: "", geometry: [start, Coordinates(lat: 55.945, lng: -3.19)],
    stops: [place("google-a", score: 80, lat: 55.945, lng: -3.19), place("google-b", score: 90, lat: 55.946, lng: -3.188)],
    distanceMeters: 1000, walkingMinutes: 20, stopMinutes: 6, bufferMinutes: 2, totalMinutes: 28, score: 70, highlights: [], isLoop: true, source: .live, start: start)
  overrides(&value)
  return value
}
