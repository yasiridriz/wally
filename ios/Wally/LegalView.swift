import SwiftUI

enum LegalPage: String, Identifiable { case terms, privacy; var id: String { rawValue } }

/// The `/terms` and `/privacy` pages, adapted for an app without a Wally server.
struct LegalView: View {
  var page: LegalPage
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, text in Text(text).wallyText(15).lineSpacing(8).tint(.forest) }
        }.padding(24)
      }
      .background(Color.cream)
      .navigationTitle(page == .terms ? "Terms of use" : "Privacy")
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.tint(.forest) } }
    }
  }

  private var paragraphs: [AttributedString] {
    let texts = page == .terms ? [
      "Wally is an experimental walking-discovery application. Walking times and scenic scores are estimates. Check local access, conditions, and signs. Google walking directions may not include all sidewalks or pedestrian paths; use caution.",
      "Google Maps features are subject to the [Google Maps/Google Earth Additional Terms of Service](https://www.google.com/intl/en_us/help/terms_maps/) and [Google Privacy Policy](https://policies.google.com/privacy).",
      "Demo routes are illustrative sample paths with unverified times. All sample events are fictional and are not real listings. Availability depends on mapping providers and internet access. This hackathon MVP is provided as available, without guarantees of route access or suitability.",
    ] : [
      "Wally uses your selected start, destination, walking preferences, and visited-place IDs to suggest walks. In Live Mode, Wally asks your device to use your current location as the default start. Location access is optional: you can deny it and choose a place through search or the map instead. You can also request your location again using the location button.",
      "Preferences and visited-place IDs are stored on this device. Delete the app to remove them. Wally has no accounts, database, or analytics integration.",
      "The live map loads Google Maps on your device. Searching for a start or destination sends your search text and a nearby location bias to Google Places. Walking and nearby-place requests also send coordinates to Google Maps Platform. When you select a live route, Wally asks Google Places for up to three photos of its stops. Generated routes are kept in app memory for event detours and walk previews and expire after 20 minutes. The “Get me to Google Maps” button opens Google Maps with the route start, stops, and finish in the link.",
      "Google handles information under its [Privacy Policy](https://policies.google.com/privacy). Demo route generation uses local sample data; showing the interactive Google map still contacts Google. Without a map key, sample routes use a local schematic preview.",
    ]
    return texts.map { (try? AttributedString(markdown: $0)) ?? AttributedString($0) }
  }
}
