import SwiftUI
import WallyCore

private let moods: [(Mood, String, String)] = [
  (.surprise, "Surprise me", "sparkles"), (.scenic, "Scenic", "leaf"), (.green, "Green & peaceful", "tree"),
  (.historic, "Historic", "building.columns"), (.hidden, "Hidden gems", "safari"),
]

/// `src/components/route-controls.tsx`.
struct RouteControlsView: View {
  @Environment(AppModel.self) private var model
  @State private var legal: LegalPage?

  private func update(_ change: (inout Preferences) -> Void) {
    var next = model.preferences
    change(&next)
    model.changePreferences(next)
  }

  var body: some View {
    let prefs = model.preferences
    VStack(alignment: .leading, spacing: 0) {
      Text("Plan your walk").wallyText(22, .semibold, .ink, tracking: -0.5).padding(.bottom, 18).accessibilityAddTraits(.isHeader)

      LocationSection(target: .start, title: "STARTING FROM", icon: "mappin", picking: model.pickingTarget == .start && !prefs.demo) {
        HStack(spacing: 9) {
          pickButton(.start)
          IconButton(systemName: "location", label: "Use my current location", pulse: model.locating) { model.locate() }
            .disabled(model.locating || model.loading || prefs.demo)
        }
      } content: {
        if prefs.demo { FixedDemoLocation(label: model.locationLabel, note: "Fixed sample starting point") }
        else {
          LocationSearchView(label: "Starting point", selectedLabel: model.locationLabel, selectedAddress: model.startAddress, hasSelection: model.startSelected,
            onSelect: { model.chooseSearchLocation(.start, $0) }, onClear: { model.clearLocation(.start) })
            .id("start:\(model.start.lat),\(model.start.lng):\(model.startSelected)")
        }
      }

      VStack(alignment: .leading, spacing: 0) {
        Text("Route type").wallyText(12, .semibold).padding(.bottom, 11)
        ModeButton(icon: "arrow.2.squarepath", title: "Loop", detail: "Return to your starting point", active: prefs.mode == .loop, large: true) { update { $0.mode = .loop } }
        HStack(spacing: 9) {
          ModeButton(icon: "flag", title: "Targeted", detail: "Choose where to finish", active: prefs.mode == .destination) { update { $0.mode = .destination } }
          ModeButton(icon: "shoeprints.fill", title: "Explore", detail: "Finish at the last stop", active: prefs.mode == .explore) { update { $0.mode = .explore } }
        }.padding(.top, 7)
      }.padding(.top, 18)

      if prefs.mode == .destination {
        LocationSection(target: .destination, title: "WHERE ARE YOU HEADING?", icon: "flag", picking: model.pickingTarget == .destination && !prefs.demo) {
          pickButton(.destination)
        } content: {
          if prefs.demo { FixedDemoLocation(label: model.destinationLabel, note: "Fixed sample destination") }
          else {
            LocationSearchView(label: "Destination", selectedLabel: model.destinationLabel, selectedAddress: model.destinationAddress, hasSelection: model.destination != nil,
              onSelect: { model.chooseSearchLocation(.destination, $0) }, onClear: { model.clearLocation(.destination) })
              .id("destination:\(model.destination?.lat ?? 0),\(model.destination?.lng ?? 0)")
          }
        }
      }

      VStack(alignment: .leading, spacing: 0) {
        Text("Total time").wallyText(12, .semibold).padding(.bottom, 11)
        HStack(spacing: 7) {
          ForEach(WalkDuration.allCases, id: \.self) { value in
            let active = prefs.duration == value
            Button { update { $0.duration = value } } label: {
              VStack(spacing: 3) { Text("\(value.rawValue)").font(.wally(16, .medium)); Text("min").font(.wally(10)) }
                .foregroundStyle(active ? Color.cream : Color(hex: 0x5c6f5c)).frame(maxWidth: .infinity).padding(.vertical, 12)
                .card(border: active ? .forest : .line, radius: 9, fill: active ? .forest : .clear)
            }.buttonStyle(PressStyle()).accessibilityAddTraits(active ? .isSelected : [])
          }
        }
        Text(prefs.mode == .loop ? "Walking, stops and return included." : prefs.mode == .explore ? "Walking and stops included. Finish at the last stop." : "Walking and stops included. Finish at your destination.")
          .wallyText(9, .regular, Color(hex: 0x929787)).padding(.top, 8)
      }.padding(.top, 24)

      VStack(alignment: .leading, spacing: 0) {
        Text("Mood").wallyText(12, .semibold).padding(.bottom, 11)
        FlowLayout(spacing: 7) {
          ForEach(moods, id: \.0) { mood, label, symbol in
            let active = prefs.mood == mood
            Button { update { $0.mood = mood } } label: {
              HStack(spacing: 6) { Image(systemName: symbol).font(.system(size: 13)); Text(label).lineLimit(1) }
                .wallyText(12, .regular, active ? .forest : Color(hex: 0x78806f)).padding(.vertical, 10).padding(.horizontal, 13)
                .background(Capsule().fill(active ? Color(hex: 0xeaf0df) : .clear)).overlay(Capsule().stroke(active ? Color(hex: 0xa7b89b) : .line, lineWidth: 1))
            }.buttonStyle(PressStyle()).accessibilityAddTraits(active ? .isSelected : [])
          }
        }
      }.padding(.top, 24)

      Toggle(isOn: Binding(get: { prefs.includeEvents }, set: { value in update { $0.includeEvents = value } })) {
        VStack(alignment: .leading, spacing: 4) {
          Text("Sample event detours").wallyText(12, .medium)
          Text("Check for detours that fit your time").wallyText(11, .regular, Color(hex: 0x8b9181))
        }
      }.toggleStyle(WallyToggleStyle()).padding(.top, 22)

      PrimaryButton(action: model.generate) {
        Text(model.loading ? "Finding routes…" : "Find routes")
        if model.loading { ProgressView().tint(.cream).controlSize(.small) } else { Image(systemName: "arrow.right").font(.system(size: 16)) }
      }
      .disabled(!model.canGenerate)
      .padding(.top, 23)

      HStack {
        Spacer()
        Button { update { $0.demo.toggle() } } label: {
          HStack(spacing: 4) {
            Image(systemName: prefs.demo ? "checkmark.square.fill" : "square").font(.system(size: 11)).foregroundStyle(Color.forest)
            Text("Demo Mode")
            Image(systemName: "questionmark.circle").font(.system(size: 10))
          }.wallyText(9, .regular, Color(hex: 0x89907e))
        }.buttonStyle(PressStyle()).accessibilityAddTraits(prefs.demo ? .isSelected : [])
      }.padding(.top, 13)

      HStack(spacing: 12) {
        Button("Terms of use") { legal = .terms }
        Button("Privacy") { legal = .privacy }
      }.wallyText(11, .regular, Color(hex: 0x74806c)).underline().frame(maxWidth: .infinity).padding(.top, 14)
    }
    .disabled(model.loading)
    .padding(.top, 12).padding(.horizontal, 24).padding(.bottom, 22)
    .sheet(item: $legal) { LegalView(page: $0) }
  }

  private func pickButton(_ target: PickTarget) -> some View {
    Button("Pick on map") { model.pick(target) }.wallyText(11, .medium, .forest).buttonStyle(PressStyle())
      .disabled(model.loading || model.preferences.demo).accessibilityAddTraits(model.pickingTarget == target ? .isSelected : [])
  }
}

struct LocationSection<Actions: View, Content: View>: View {
  var target: PickTarget
  var title: String
  var icon: String
  var picking: Bool
  @ViewBuilder var actions: Actions
  @ViewBuilder var content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 7) {
        Label { Text(title) } icon: { Image(systemName: icon).font(.system(size: 13)) }.labelStyle(TightLabel()).wallyText(9, .semibold, Color(hex: 0x7d8e71), tracking: 0.8)
        Spacer(minLength: 0)
        actions
      }
      content
    }
    .padding(13)
    .card(border: picking ? Color(hex: 0xadc29c) : .line, radius: 12, fill: Color(hex: 0xf4f5ee))
    .padding(.top, target == .start ? 4 : 13)
  }
}

struct TightLabel: LabelStyle {
  func makeBody(configuration: Configuration) -> some View { HStack(spacing: 6) { configuration.icon; configuration.title } }
}

struct FixedDemoLocation: View {
  var label: String
  var note: String
  var body: some View {
    VStack(alignment: .leading, spacing: 0) { Text(label).wallyText(12, .medium); Text(note).wallyText(9, .regular, Color(hex: 0x929b85)) }.lineSpacing(3)
  }
}

struct ModeButton: View {
  var icon: String
  var title: String
  var detail: String
  var active: Bool
  var large = false
  var action: () -> Void
  var body: some View {
    Button(action: action) {
      HStack(spacing: 9) {
        Image(systemName: icon).font(.system(size: large ? 15 : 14))
        VStack(alignment: .leading, spacing: 3) {
          Text(title).font(.wally(large ? 12 : 11, .semibold))
          Text(detail).wallyText(11, .regular, Color(hex: 0x9a9d90)).fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
      }
      .foregroundStyle(active ? Color.forest : Color(hex: 0x8a8e7d))
      .padding(large ? 12 : 10).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .card(border: active ? Color(hex: 0xa9b69b) : .line, radius: 10, fill: active ? Color(hex: 0xf0f3e8) : .clear)
    }.buttonStyle(PressStyle()).accessibilityAddTraits(active ? .isSelected : [])
  }
}

/// `.toggle-track`: 32 × 19 track with a 13 pt knob.
struct WallyToggleStyle: ToggleStyle {
  func makeBody(configuration: Configuration) -> some View {
    Button { configuration.isOn.toggle() } label: {
      HStack(spacing: 10) {
        configuration.label.frame(maxWidth: .infinity, alignment: .leading)
        Capsule().fill(configuration.isOn ? Color.forest : Color(hex: 0xe2e5d9)).frame(width: 32, height: 19)
          .overlay(alignment: configuration.isOn ? .trailing : .leading) { Circle().fill(.white).frame(width: 13, height: 13).shadow(color: Color.ink.opacity(0.12), radius: 1.5, y: 1).padding(3) }
          .animation(.easeOut(duration: 0.2), value: configuration.isOn)
      }
    }.buttonStyle(PressStyle()).accessibilityAddTraits(configuration.isOn ? .isSelected : [])
  }
}
