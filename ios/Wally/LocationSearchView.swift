import SwiftUI
import WallyCore

/// `src/components/location-search.tsx`: explicit search only, never while typing.
struct LocationSearchView: View {
  @Environment(AppModel.self) private var model
  var label: String
  var selectedLabel: String
  var selectedAddress: String
  var hasSelection: Bool
  var onSelect: (LocationSearchResult) -> Void
  var onClear: () -> Void
  @State private var query = ""
  @State private var results: [LocationSearchResult] = []
  @State private var loading = false
  @State private var error = ""
  @State private var searched = false
  @State private var version = 0
  @FocusState private var focused: Bool

  private var normalised: String { query.split(whereSeparator: \.isWhitespace).joined(separator: " ") }

  private func clearSearch() { version += 1; query = ""; results = []; error = ""; searched = false; loading = false }

  private func search() {
    guard !model.loading, !loading else { return }
    guard normalised.count >= 3 else { error = "Enter at least three characters, such as a place name and city."; return }
    version += 1
    let request = version
    loading = true; error = ""; searched = false; results = []; focused = false
    Task {
      let response = await model.search(normalised)
      guard request == version else { return }
      loading = false
      switch response {
      case .success(let data): results = data; searched = true
      case .failure(let failure): error = failure.message
      }
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: 7) {
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 5) {
            if hasSelection { Image(systemName: "checkmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color(hex: 0x708d5b)) }
            Text(selectedLabel).wallyText(12, .medium, hasSelection ? .ink : Color(hex: 0x89917f))
          }
          if !selectedAddress.isEmpty { Text(selectedAddress).wallyText(11, .regular, Color(hex: 0x8a9480)) }
        }.frame(maxWidth: .infinity, alignment: .leading)
        if hasSelection {
          Button { clearSearch(); onClear() } label: { Image(systemName: "xmark").font(.system(size: 11)).foregroundStyle(Color(hex: 0x85927c)).padding(2) }
            .accessibilityLabel("Clear \(label.lowercased())")
        }
      }.padding(.top, 2).padding(.bottom, 11)

      HStack(spacing: 6) {
        HStack(spacing: 6) {
          Image(systemName: "magnifyingglass").font(.system(size: 13)).foregroundStyle(Color(hex: 0x94a085))
          TextField("Search a place or address", text: $query)
            .font(.wally(12)).foregroundStyle(Color.ink).textInputAutocapitalization(.never).autocorrectionDisabled()
            .submitLabel(.search).focused($focused).onSubmit(search)
            .onChange(of: query) { _, value in
              if value.count > 160 { query = String(value.prefix(160)) }
              version += 1; results = []; error = ""; searched = false; loading = false
            }
            .accessibilityLabel("\(label): search a place or address")
          Button(action: clearSearch) { Image(systemName: "xmark").font(.system(size: 10)).foregroundStyle(Color(hex: 0x94a085)) }
            .disabled(query.isEmpty).opacity(query.isEmpty ? 0.55 : 1).accessibilityLabel("Clear \(label.lowercased()) search")
        }
        .padding(.horizontal, 7).padding(.vertical, 12)
        .card(border: focused ? Color(hex: 0xa7bc74) : Color(hex: 0xdfe5d3), radius: 7, fill: .cream)
        Button(action: search) {
          Text(loading ? "Searching…" : "Search").wallyText(11, .medium, .forest).padding(.horizontal, 12).frame(maxHeight: .infinity)
            .card(border: Color(hex: 0xd3ddc4), radius: 7, fill: Color(hex: 0xe8eddf))
        }.buttonStyle(PressStyle()).disabled(loading || normalised.count < 3)
      }.fixedSize(horizontal: false, vertical: true)

      if loading { status("Looking up places with Google Maps…") }
      if !error.isEmpty { Text(error).wallyText(11, .regular, Color(hex: 0xa46e43)).lineSpacing(4).padding(.top, 9) }
      if searched && results.isEmpty { status("No places found. Try adding a city or a more specific address.") }
      if !results.isEmpty {
        VStack(alignment: .leading, spacing: 10) {
          VStack(spacing: 0) {
            ForEach(Array(results.enumerated()), id: \.element.id) { index, result in
              if index > 0 { Rectangle().fill(Color(hex: 0xdfe6d5)).frame(height: 1) }
              VStack(alignment: .leading, spacing: 0) {
                Button { clearSearch(); onSelect(result) } label: {
                  VStack(alignment: .leading, spacing: 4) {
                    Text(result.name).wallyText(12, .medium)
                    Text(result.address).wallyText(11, .regular, Color(hex: 0x8a9580))
                  }.frame(maxWidth: .infinity, alignment: .leading).padding(10).contentShape(Rectangle())
                }.buttonStyle(PressStyle())
                if !result.attributions.isEmpty { AttributionLinks(attributions: result.attributions, size: 10).padding(.horizontal, 10).padding(.bottom, 9) }
              }.background(Color.cream)
            }
          }
          .clipShape(RoundedRectangle(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xdce4d1), lineWidth: 1))
          GoogleAttribution()
        }.padding(.top, 10)
      }
    }
  }

  private func status(_ text: String) -> some View { Text(text).wallyText(11, .regular, Color(hex: 0x829275)).lineSpacing(4).padding(.top, 9) }
}
