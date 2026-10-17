import SwiftUI
import UIKit
import WallyCore

/// `walk-summary.tsx`: a summary card, up to three stop cards, and the Google Maps link.
struct WalkSummaryView: View {
  @Environment(AppModel.self) private var model
  var route: WanderRoute

  var body: some View {
    let id = baseRouteId(route.id)
    let stops = summaryStops(route.stops)
    let wantsPhotos = route.source == .live && stops.contains { $0.photo != nil }
    let state = model.photoStates[id]
    VStack(alignment: .leading, spacing: 0) {
      Text("Walk preview").wallyText(17, .semibold, .ink, tracking: -0.4).padding(.bottom, 15)
      SummaryDeck(route: route, stops: stops, photos: state?.photos ?? [], loading: wantsPhotos && state == nil).id(id)
      if let error = state?.error { Text(error).wallyText(11, .regular, Color(hex: 0x87917b)).padding(.top, 8) }
      if let url = googleMapsDirectionsURL(route) {
        Link(destination: url) {
          HStack(spacing: 9) { Image(systemName: "location"); Text("Get me to Google Maps") }
            .wallyText(13, .medium, .cream).frame(maxWidth: .infinity, minHeight: 49).background(RoundedRectangle(cornerRadius: 10).fill(Color.forest))
        }.buttonStyle(PressStyle()).padding(.top, 14)
      }
    }
    .padding(.top, 26)
    .id("summary")
    .accessibilityElement(children: .contain).accessibilityLabel("Walk preview")
  }
}

private struct SummaryDeck: View {
  var route: WanderRoute
  var stops: [Place]
  var photos: [SummaryPhoto]
  var loading: Bool
  @State private var active: Int? = 0
  private var count: Int { stops.count + 1 }
  #if DEBUG
  /// Screenshot checks only: `-WallySummaryCard 1` opens on the first stop card.
  private let debugCard = UserDefaults.standard.integer(forKey: "WallySummaryCard")
  #else
  private let debugCard = 0
  #endif

  var body: some View {
    VStack(spacing: 10) {
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(spacing: 10) {
          CoverCard(route: route).id(0)
          ForEach(Array(stops.enumerated()), id: \.element.id) { index, stop in
            StopCard(stop: stop, number: (route.stops.firstIndex(of: stop) ?? index) + 1, photo: photos.first { $0.stopId == stop.id }, loading: loading && stop.photo != nil).id(index + 1)
          }
        }
        .scrollTargetLayout()
      }
      .scrollTargetBehavior(.viewAligned)
      .scrollPosition(id: $active, anchor: .leading)
      .task { if debugCard > 0 { try? await Task.sleep(for: .seconds(1)); show(debugCard) } }

      if count > 1 {
        HStack {
          IconButton(systemName: "chevron.left", size: 27, label: "Previous card") { show((active ?? 0) - 1) }.disabled((active ?? 0) == 0)
          Spacer()
          HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { index in
              Button { show(index) } label: { Circle().fill(index == (active ?? 0) ? Color.forest : Color(hex: 0xd6dccb)).frame(width: 7, height: 7).padding(4) }
                .accessibilityLabel("Show card \(index + 1)").accessibilityAddTraits(index == (active ?? 0) ? .isSelected : [])
            }
          }
          Spacer()
          IconButton(systemName: "chevron.right", size: 27, label: "Next card") { show((active ?? 0) + 1) }.disabled((active ?? 0) == count - 1)
        }
      }
    }
  }

  private func show(_ index: Int) { withAnimation { active = max(0, min(count - 1, index)) } }
}

private struct CardFrame: ViewModifier {
  func body(content: Content) -> some View {
    content.containerRelativeFrame(.horizontal) { width, _ in width * 0.88 }.frame(minHeight: 262, alignment: .top)
      .clipShape(RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.line, lineWidth: 1))
  }
}

private struct CoverCard: View {
  var route: WanderRoute
  var body: some View {
    var names = route.stops.map(\.name)
    if let event = route.event { names.insert(event.name, at: max(0, min(names.count, route.eventStopIndex ?? names.count))) }
    let ending = route.isLoop ? "Returns to start" : route.destination != nil ? "Finishes at your destination" : "Finishes at \(route.stops.last?.name ?? "the last stop")"
    return VStack(alignment: .leading, spacing: 0) {
      Text("\(route.source == .demo ? "SAMPLE · " : "")\(kindLabel(route))").wallyText(8, .regular, Color(hex: 0x8c9481), tracking: 0.8)
      Text(route.name).wallyText(17, .semibold, .ink, tracking: -0.3).lineSpacing(4).padding(.top, 8)
      HStack(spacing: 12) {
        Label("\(route.totalMinutes) min", systemImage: "clock")
        Label(kilometres(route.distanceMeters), systemImage: "shoeprints.fill")
        Label("\(route.stops.count) stops", systemImage: "mappin")
      }.labelStyle(StatLabel()).wallyText(11, .regular, Color(hex: 0x63745c)).padding(.top, 12)
      VStack(alignment: .leading, spacing: 4) {
        ForEach(Array(names.enumerated()), id: \.offset) { index, name in
          HStack(alignment: .firstTextBaseline, spacing: 6) { Text("\(index + 1).").frame(width: 14, alignment: .trailing); Text(name) }
        }
      }.wallyText(12).padding(.top, 14)
      Spacer(minLength: 12)
      Text(ending).wallyText(11, .regular, Color(hex: 0x748465))
    }
    .padding(18).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).background(Color(hex: 0xf0f3e9))
    .modifier(CardFrame())
    .accessibilityElement(children: .combine)
  }
}

private struct StopCard: View {
  var stop: Place
  var number: Int
  var photo: SummaryPhoto?
  var loading: Bool
  @State private var pulse = false
  private var placeholderIcon: some View { Image(systemName: icon(for: stop.category)).font(.system(size: 30, weight: .light)).foregroundStyle(Color(hex: 0x8fa07f)) }
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Overlays keep a filled photo inside the 150 pt frame, so it cannot widen the card.
      Color(hex: 0xe7ecdd).frame(height: 150)
        .overlay {
          if let photo {
            RemoteImage(url: photo.url) { placeholderIcon }.accessibilityLabel(stop.name)
          } else {
            placeholderIcon.accessibilityHidden(true)
          }
        }
        .overlay(alignment: .topLeading) {
          Text("Stop \(number)").wallyText(8, .semibold, .forest).padding(.vertical, 4).padding(.horizontal, 7)
            .background(RoundedRectangle(cornerRadius: 6).fill(Color.cream.opacity(0.92))).padding(10)
        }
        .clipped()
        .opacity(loading && pulse ? 0.55 : 1)
        .onAppear { if loading { withAnimation(.easeInOut(duration: 0.7).repeatForever()) { pulse = true } } }
      VStack(alignment: .leading, spacing: 0) {
        Text(stop.category.rawValue.uppercased()).wallyText(7, .regular, Color(hex: 0x89947c), tracking: 1)
        Text(stop.name).wallyText(14, .semibold).padding(.top, 3)
        Text(stop.suggestedActivity ?? stop.description ?? "A point of interest along this route.").wallyText(11, .regular, Color(hex: 0x84907b)).lineSpacing(5).padding(.top, 5)
        if let photo {
          HStack(spacing: 0) {
            if !photo.authorAttributions.isEmpty {
              Text("Photo: ")
              ForEach(Array(photo.authorAttributions.enumerated()), id: \.offset) { index, author in
                if index > 0 { Text(", ") }
                if let url = author.safeURL { Link(author.displayName, destination: url).underline() } else { Text(author.displayName) }
              }
              Text(" · ")
            }
            GoogleAttribution(size: 11)
          }.wallyText(10, .regular, .googleGrey).lineLimit(1).minimumScaleFactor(0.8).padding(.top, 8)
        }
      }.padding(.top, 12).padding(.horizontal, 14).padding(.bottom, 14)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).background(Color.white)
    .modifier(CardFrame())
  }
}

/// Loads Google photo URLs with an ephemeral session: nothing is cached on disk.
struct RemoteImage<Placeholder: View>: View {
  var url: URL
  @ViewBuilder var placeholder: Placeholder
  @State private var image: UIImage?
  @State private var failed = false
  private static var session: URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    return URLSession(configuration: configuration)
  }
  var body: some View {
    Group {
      if let image { Color.clear.overlay { Image(uiImage: image).resizable().scaledToFill() }.clipped() }
      else if failed { placeholder.frame(maxWidth: .infinity, maxHeight: .infinity) }
      else { Color.clear }
    }
    .task(id: url) {
      image = nil; failed = false
      do {
        let (data, response) = try await Self.session.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200, let loaded = UIImage(data: data) else { failed = true; return }
        image = loaded
      } catch { failed = true }
    }
  }
}
