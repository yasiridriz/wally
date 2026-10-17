import Foundation

public struct Preferences: Equatable, Sendable {
  public var duration: WalkDuration
  /// Selected mood tags; empty means Surprise me.
  public var moods: [Mood]
  public var mode: RouteMode
  public var includeEvents: Bool
  public var demo: Bool
  public var pace: Pace
  public init(duration: WalkDuration = .m30, moods: [Mood] = [], mode: RouteMode = .loop, includeEvents: Bool = false, demo: Bool = false, pace: Pace = .walk) {
    self.duration = duration; self.moods = Mood.normalized(moods); self.mode = mode; self.includeEvents = includeEvents; self.demo = demo; self.pace = pace
  }
  public static let defaults = Preferences()

  /// Moods combine freely; clearing every one returns to Surprise me.
  public mutating func toggleMood(_ mood: Mood) {
    moods = moods.contains(mood) ? moods.filter { $0 != mood } : Mood.normalized(moods + [mood])
  }

  /// Legacy preferences migrate once to Loop, and a single stored mood becomes one tag.
  /// Demo remains a session choice.
  public static func restore(_ data: Data?, hasLiveSetup: Bool) -> Preferences {
    var defaults = Preferences.defaults
    defaults.demo = !hasLiveSetup
    guard let data, let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let duration = (value["duration"] as? Int).flatMap(WalkDuration.init(rawValue:)),
          let mode = (value["mode"] as? String).flatMap(RouteMode.init(rawValue:)) else { return defaults }
    let version = value["version"] as? Int
    let moods: [Mood]
    if version == 3 {
      guard let raw = value["moods"] as? [String] else { return defaults }
      let parsed = raw.compactMap(Mood.init(rawValue:))
      guard parsed.count == raw.count, !parsed.contains(.surprise) else { return defaults }
      moods = parsed
    } else {
      guard let mood = (value["mood"] as? String).flatMap(Mood.init(rawValue:)) else { return defaults }
      moods = mood == .surprise ? [] : [mood]
    }
    return Preferences(duration: duration, moods: moods, mode: version == 2 || version == 3 ? mode : .loop, includeEvents: value["includeEvents"] as? Bool == true, demo: !hasLiveSetup,
      pace: (value["pace"] as? String).flatMap(Pace.init(rawValue:)) ?? .walk)
  }

  /// Demo Mode is never persisted.
  public func persistable() -> Data {
    (try? JSONSerialization.data(withJSONObject: ["version": 3, "duration": duration.rawValue, "moods": moods.map(\.rawValue), "mode": mode.rawValue, "includeEvents": includeEvents, "pace": pace.rawValue], options: [.sortedKeys])) ?? Data()
  }
}
