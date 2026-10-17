import Foundation

/// Keys come from `Config/Secrets.xcconfig` through Info.plist build settings.
/// They are part of the app bundle, so restrict them to this bundle ID in Google Cloud.
enum AppConfig {
  private static func value(_ key: String) -> String? {
    guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
    let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    // An unset build setting stays as "$(NAME)" or empty.
    return value.isEmpty || value.hasPrefix("$(") ? nil : value
  }
  /// Maps SDK for iOS key (the map).
  static let mapsSDKKey = value("WallyGoogleMapsSDKKey")
  /// Places API (New) and Routes API key (discovery, search, routing, photos).
  static let placesRoutesKey = value("WallyGooglePlacesRoutesKey")
  static let mapID = value("WallyGoogleMapsMapID")
  static let bundleIdentifier = Bundle.main.bundleIdentifier
  static var hasLiveSetup: Bool { mapsSDKKey != nil && placesRoutesKey != nil }
}
