import GoogleMaps
import SwiftUI

@main
struct WallyApp: App {
  @State private var model: AppModel

  init() {
    if let key = AppConfig.mapsSDKKey { GMSServices.provideAPIKey(key) }
    _model = State(initialValue: AppModel())
  }

  var body: some Scene {
    WindowGroup {
      ContentView().environment(model).tint(.forest).preferredColorScheme(.light)
    }
  }
}
