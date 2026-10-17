import Foundation

/// Resolve one photo name to a short-lived image URL. The URL holds no API key.
public func fetchPhotoUri(_ client: GoogleClient, name: String) async -> URL? {
  guard isPhotoName(name), let url = URL(string: "https://places.googleapis.com/v1/\(name)/media?maxWidthPx=800&maxHeightPx=800&skipHttpRedirect=true"),
        let request = try? client.request(url, method: "GET", timeout: 10),
        let (data, response) = try? await client.transport.send(request), (200..<300).contains(response.statusCode),
        let uri = record(try? JSONSerialization.jsonObject(with: data))?["photoUri"] as? String, uri.count <= 4096,
        let photoURL = URL(string: uri), photoURL.scheme?.lowercased() == "https" else { return nil }
  return photoURL
}

/// At most three Place Photo requests, for the highest-scoring stops with photos.
public func summaryPhotos(_ client: GoogleClient, stops: [Place]) async throws -> [SummaryPhoto] {
  let candidates = summaryStops(stops).filter { $0.photo.map { isPhotoName($0.name) } ?? false }
  if candidates.isEmpty { return [] }
  guard client.hasKey else { throw WallyError("MISSING_KEY", "Place photos need a Google Maps API key.") }
  let photos = await withTaskGroup(of: (Int, SummaryPhoto?).self) { group in
    for (index, stop) in candidates.enumerated() {
      group.addTask {
        guard let photo = stop.photo, let url = await fetchPhotoUri(client, name: photo.name) else { return (index, nil) }
        return (index, SummaryPhoto(stopId: stop.id, placeName: stop.name, url: url, authorAttributions: photo.authorAttributions))
      }
    }
    var found: [(Int, SummaryPhoto?)] = []
    for await value in group { found.append(value) }
    return found.sorted { $0.0 < $1.0 }.compactMap(\.1)
  }
  if photos.isEmpty { throw WallyError("PHOTO_ERROR", "Place photos are unavailable right now.") }
  return photos
}
