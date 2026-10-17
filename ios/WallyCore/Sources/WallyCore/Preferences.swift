import Foundation

public struct Preferences: Equatable, Sendable {
  public var duration: WalkDuration
  public var mood: Mood
  public var mode: RouteMode
  public var includeEvents: Bool
  public var demo: Bool
  public init(duration: WalkDuration = .m30, mood: Mood = .surprise, mode: RouteMode = .loop, includeEvents: Bool = false, demo: Bool = false) {
    self.duration = duration; self.mood = mood; self.mode = mode; self.includeEvents = includeEvents; self.demo = demo
  }
  public static let defaults = Preferences()

  /// Legacy preferences migrate once to Loop. Demo remains a session choice.
  public static func restore(_ data: Data?, hasLiveSetup: Bool) -> Preferences {
    var defaults = Preferences.defaults
    defaults.demo = !hasLiveSetup
    guard let data, let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let duration = (value["duration"] as? Int).flatMap(WalkDuration.init(rawValue:)),
          let mood = (value["mood"] as? String).flatMap(Mood.init(rawValue:)),
          let mode = (value["mode"] as? String).flatMap(RouteMode.init(rawValue:)) else { return defaults }
    return Preferences(duration: duration, mood: mood, mode: value["version"] as? Int == 2 ? mode : .loop, includeEvents: value["includeEvents"] as? Bool == true, demo: !hasLiveSetup)
  }

  /// Demo Mode is never persisted.
  public func persistable() -> Data {
    (try? JSONSerialization.data(withJSONObject: ["version": 2, "duration": duration.rawValue, "mood": mood.rawValue, "mode": mode.rawValue, "includeEvents": includeEvents], options: [.sortedKeys])) ?? Data()
  }
}
