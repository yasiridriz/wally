import Foundation

public protocol HTTPTransport: Sendable {
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// Ephemeral session without a response cache: Google content stays in memory only.
public struct URLSessionTransport: HTTPTransport {
  private let session: URLSession
  public init() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    session = URLSession(configuration: configuration)
  }
  public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    return (data, http)
  }
}

/// Calls Places API (New) and Routes API from the device.
/// `X-Ios-Bundle-Identifier` lets an iOS-restricted key authorise these REST calls.
public struct GoogleClient: Sendable {
  public var apiKey: String?
  public var bundleIdentifier: String?
  public var transport: HTTPTransport
  public init(apiKey: String?, bundleIdentifier: String? = nil, transport: HTTPTransport = URLSessionTransport()) {
    let trimmed = apiKey?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.apiKey = trimmed?.isEmpty == false ? trimmed : nil
    self.bundleIdentifier = bundleIdentifier
    self.transport = transport
  }
  public var hasKey: Bool { apiKey != nil }

  func request(_ url: URL, method: String = "POST", fieldMask: String? = nil, body: [String: Any]? = nil, timeout: TimeInterval) throws -> URLRequest {
    guard let apiKey else { throw ProviderError("Missing key", status: 401) }
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
    request.httpMethod = method
    request.setValue(apiKey, forHTTPHeaderField: "X-Goog-Api-Key")
    if let bundleIdentifier { request.setValue(bundleIdentifier, forHTTPHeaderField: "X-Ios-Bundle-Identifier") }
    if let fieldMask { request.setValue(fieldMask, forHTTPHeaderField: "X-Goog-FieldMask") }
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    return request
  }
}

public struct ProviderError: Error, LocalizedError, Equatable {
  public var message: String
  public var status: Int
  public init(_ message: String, status: Int = 0) { self.message = message; self.status = status }
  public var errorDescription: String? { message }
}

func record(_ value: Any?) -> [String: Any]? { value as? [String: Any] }
func number(_ value: Any?) -> Double? {
  guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID() else { return nil }
  return value.doubleValue
}

/// REST Place.Attribution uses provider/providerUri, unlike photo authors.
func normaliseAttributions(_ raw: Any?) -> [Attribution] {
  guard let raw = raw as? [Any] else { return [] }
  return raw.prefix(20).compactMap { value in
    let attribution = record(value)
    guard let name = (attribution?["provider"] ?? attribution?["displayName"]) as? String else { return nil }
    let displayName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !displayName.isEmpty, name.count <= 500 else { return nil }
    var safeUri: String?
    if let uri = (attribution?["providerUri"] ?? attribution?["uri"]) as? String, uri.count <= 2048, let url = URL(string: uri), ["https", "http"].contains(url.scheme?.lowercased() ?? "") { safeUri = uri }
    return Attribution(displayName: displayName, uri: safeUri)
  }
}
