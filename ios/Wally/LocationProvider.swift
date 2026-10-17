import CoreLocation

/// One-shot current location with a 12-second timeout, like the web geolocation call.
@MainActor
final class LocationProvider: NSObject, CLLocationManagerDelegate {
  enum Failure: Error { case denied, unavailable, timedOut }
  private let manager = CLLocationManager()
  private var continuation: CheckedContinuation<CLLocationCoordinate2D, Error>?
  private var requestID = 0

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
  }

  func currentLocation(timeout: TimeInterval = 12) async throws -> CLLocationCoordinate2D {
    finish(.failure(Failure.unavailable))
    requestID += 1
    let id = requestID
    return try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      switch manager.authorizationStatus {
      case .notDetermined: manager.requestWhenInUseAuthorization()
      case .denied, .restricted: finish(.failure(Failure.denied))
      default: manager.requestLocation()
      }
      Task { [weak self] in
        try? await Task.sleep(for: .seconds(timeout))
        // An old timeout must never end a newer request.
        if self?.requestID == id { self?.finish(.failure(Failure.timedOut)) }
      }
    }
  }

  private func finish(_ result: Result<CLLocationCoordinate2D, Error>) {
    guard let continuation else { return }
    self.continuation = nil
    continuation.resume(with: result)
  }

  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    Task { @MainActor in
      guard continuation != nil else { return }
      if status == .denied || status == .restricted { finish(.failure(Failure.denied)) }
      else if status == .authorizedWhenInUse || status == .authorizedAlways { self.manager.requestLocation() }
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let coordinate = locations.last?.coordinate else { return }
    Task { @MainActor in finish(.success(coordinate)) }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor in finish(.failure(Failure.unavailable)) }
  }
}
