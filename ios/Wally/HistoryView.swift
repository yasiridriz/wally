import SwiftUI
import WallyCore

/// `src/components/path-history.tsx`: routes you opened, newest first, to review
/// and favourite. Rated and favourite routes shape the next search.
struct HistoryView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  @State private var favouritesOnly = false
  @State private var confirmClear = false

  var body: some View {
    let entries = favouritesOnly ? model.history.filter(\.favourite) : model.history
    NavigationStack {
      List {
        Section {
          Text("Routes you open are remembered, so the next search favours new places. Rate them out of 5 and favourite the ones you love: turn on Favourites in the planner to get them back.")
            .wallyText(11, .regular, .muted).lineSpacing(3)
          Picker("Show", selection: $favouritesOnly) {
            Text("All (\(model.history.count))").tag(false)
            Text("Favourites (\(model.favouriteCount))").tag(true)
          }.pickerStyle(.segmented)
        }
        if entries.isEmpty {
          Text(favouritesOnly ? "No favourites yet. Tap the heart on a route you love." : "No routes yet. Routes you open will appear here.")
            .wallyText(12, .regular, .muted).frame(maxWidth: .infinity).padding(.vertical, 24)
        } else {
          Section {
            ForEach(entries) { entry in HistoryRow(entry: entry) }
              .onDelete { offsets in for offset in offsets { model.removeHistory(entries[offset].id) } }
          } footer: {
            Text("Stored on this device only. Ratings of live routes are also saved for improving future routes.").wallyText(10, .regular, .muted)
          }
        }
      }
      .navigationTitle("Path history")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        if !model.history.isEmpty {
          ToolbarItem(placement: .destructiveAction) { Button("Clear", role: .destructive) { confirmClear = true } }
        }
      }
      .confirmationDialog("Clear all path history, ratings and favourites on this device?", isPresented: $confirmClear, titleVisibility: .visible) {
        Button("Clear history", role: .destructive) { model.clearHistory() }
      }
    }
  }
}

private struct HistoryRow: View {
  @Environment(AppModel.self) private var model
  var entry: HistoryEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text(entry.name).wallyText(14, .semibold, .ink)
        if entry.source == .demo { Text("SAMPLE").wallyText(7, .semibold, Color(hex: 0x8a6a3c), tracking: 0.6) }
      }
      Label("\(entry.totalMinutes) min \(entry.pace == .run ? "run" : "walk") · \(kilometres(entry.distanceMeters)) · \(entry.selectedAt.formatted(date: .abbreviated, time: .shortened))",
        systemImage: entry.pace == .run ? "figure.run" : "figure.walk")
        .labelStyle(StatLabel()).wallyText(11, .regular, .muted)
      Text(entry.stops.map(\.name).joined(separator: " → ")).wallyText(12, .regular, .ink).lineSpacing(2)
      HStack {
        StarRating(value: entry.rating, label: "Rate \(entry.name)") { model.rate(entry.id, $0) }
        Spacer()
        FavouriteButton(on: entry.favourite) { model.toggleFavourite(entry.id) }
      }.padding(.top, 2)
    }
    .padding(.vertical, 4)
  }
}

/// Five stars; tapping the current star again clears it.
struct StarRating: View {
  var value: Int?
  var label: String
  var onRate: (Int) -> Void
  var body: some View {
    HStack(spacing: 2) {
      ForEach(1...5, id: \.self) { star in
        Button { onRate(star) } label: {
          Image(systemName: (value ?? 0) >= star ? "star.fill" : "star").font(.system(size: 16))
            .foregroundStyle((value ?? 0) >= star ? Color(hex: 0xc77c45) : Color(hex: 0xc9cfbf)).frame(width: 30, height: 30)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("\(star) star\(star == 1 ? "" : "s")")
        .accessibilityAddTraits(value == star ? .isSelected : [])
      }
    }
    .accessibilityElement(children: .contain).accessibilityLabel(label)
  }
}

struct FavouriteButton: View {
  var on: Bool
  var action: () -> Void
  var body: some View {
    Button(action: action) {
      HStack(spacing: 5) { Image(systemName: on ? "heart.fill" : "heart").font(.system(size: 12)); Text(on ? "Favourite" : "Add to favourites") }
        .wallyText(11, .semibold, on ? Color(hex: 0x975d39) : .muted)
        .padding(.vertical, 6).padding(.horizontal, 10)
        .background(Capsule().fill(on ? Color(hex: 0xf8eee6) : .clear)).overlay(Capsule().stroke(on ? Color(hex: 0xe5c8ab) : .line, lineWidth: 1))
    }
    .buttonStyle(.borderless)
    .accessibilityAddTraits(on ? .isSelected : [])
  }
}

/// Opens path history from the header.
struct HistoryButton: View {
  @Environment(AppModel.self) private var model
  @State private var open = false
  var wide: Bool
  var body: some View {
    Button { open = true } label: {
      Image(systemName: "clock.arrow.circlepath").font(.system(size: wide ? 15 : 14, weight: .semibold)).foregroundStyle(Color.forest)
        .frame(width: wide ? 34 : 30, height: wide ? 34 : 30)
        .background(Circle().fill(Color.cream)).overlay(Circle().stroke(Color(hex: 0xd6dccb), lineWidth: 1))
    }
    .buttonStyle(PressStyle())
    .accessibilityLabel("Path history")
    .sheet(isPresented: $open) { HistoryView().environment(model) }
  }
}
