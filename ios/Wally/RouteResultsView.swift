import SwiftUI
import WallyCore

/// `route-results.tsx` and `route-card.tsx`.
struct RouteResultsView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    if model.loading {
      VStack(alignment: .leading, spacing: 0) {
        Text(model.preferences.pace == .run ? "Finding running routes…" : "Finding walking routes…").wallyText(17, .semibold, .ink, tracking: -0.4).padding(.bottom, 15)
        Text("Looking for interesting places and walkable paths…").wallyText(11, .regular, .muted)
        ForEach(0..<3, id: \.self) { _ in RouteSkeleton() }
      }
      .padding(.vertical, 22).padding(.horizontal, 24).overlay(alignment: .top) { Rectangle().fill(Color.line).frame(height: 1) }
      .accessibilityElement(children: .combine).accessibilityLabel("Finding walking routes")
    } else if !model.routes.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        if let over = model.routes.first(where: \.overBudget) {
          HStack(alignment: .top, spacing: 9) {
            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 15)).foregroundStyle(Color.danger)
            (Text("Your destination can’t be reached in \(model.preferences.duration.rawValue) minutes. ").font(.wally(12, .semibold))
              + Text("The most direct \(model.preferences.pace == .run ? "run" : "walk") takes about ")
              + Text("\(over.totalMinutes) minutes").font(.wally(12, .semibold))
              + Text(", \(over.totalMinutes - model.preferences.duration.rawValue) minutes longer. It’s shown in red: allow more time or choose a closer destination."))
              .wallyText(12, .regular, Color.danger).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
          }
          .padding(12).frame(maxWidth: .infinity, alignment: .leading)
          .background(RoundedRectangle(cornerRadius: 12).fill(Color.dangerTint))
          .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.danger, lineWidth: 1.5))
          .padding(.bottom, 15)
          .accessibilityElement(children: .combine)
        }
        HStack {
          Text(model.routes.contains(where: \.overBudget) ? "The way there" : "Suggested routes").wallyText(17, .semibold, .ink, tracking: -0.4)
          Spacer()
          IconButton(systemName: "arrow.clockwise", size: 30, label: "Regenerate routes", action: model.generate)
        }.padding(.bottom, 15)
        if let selected = model.selected, selected.source == .live {
          VStack(alignment: .leading, spacing: 8) {
            GoogleAttribution()
            Text("Walking directions may not include all sidewalks or pedestrian paths. Use caution.")
            ForEach(Array(selected.routingWarnings.enumerated()), id: \.offset) { Text($0.element) }
          }
          .wallyText(11, .regular, Color(hex: 0x7a806e)).lineSpacing(5).padding(.bottom, 15)
          .overlay(alignment: .bottom) { Rectangle().fill(Color.line).frame(height: 1) }.padding(.bottom, 16)
        }
        VStack(spacing: 11) {
          ForEach(Array(model.routes.enumerated()), id: \.element.id) { index, route in
            RouteCardView(route: route, index: index, selected: route.id == model.selected?.id, requestedMinutes: model.preferences.duration.rawValue) { model.selectRoute(route) }
          }
        }
        if let selected = model.selected {
          WalkSummaryView(route: selected)
          ItineraryView(route: selected)
        }
      }
      .padding(.vertical, 22).padding(.horizontal, 24).overlay(alignment: .top) { Rectangle().fill(Color.line).frame(height: 1) }
    }
  }
}

struct RouteSkeleton: View {
  @State private var dim = false
  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      ForEach([0.4, 0.8, 0.6], id: \.self) { width in
        GeometryReader { proxy in Capsule().fill(Color(hex: 0xe5e9da)).frame(width: proxy.size.width * width, height: 10) }.frame(height: 10)
      }
      Spacer(minLength: 0)
    }
    .opacity(dim ? 0.4 : 1).padding(.vertical, 20).padding(.horizontal, 14).frame(height: 148).card().padding(.top, 13)
    .onAppear { withAnimation(.easeInOut(duration: 0.75).repeatForever()) { dim = true } }
  }
}

struct RouteCardView: View {
  @Environment(AppModel.self) private var model
  var route: WanderRoute
  var index: Int
  var selected: Bool
  var requestedMinutes: Int
  var onSelect: () -> Void
  var body: some View {
    let color = route.overBudget ? Color.danger : routeColor(index)
    Button(action: onSelect) {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 8) {
          Text("0\(index + 1)").wallyText(10, .semibold, color)
          Text(kindLabel(route)).wallyText(7, .regular, Color(hex: 0x8c9481), tracking: 0.7)
          Spacer()
          VStack(alignment: .trailing, spacing: 4) {
            Text("\(Int(route.score))").wallyText(20, .medium, color)
            Text("WANDER SCORE").wallyText(5, .regular, Color(hex: 0x89977d), tracking: 0.6)
          }
        }
        HStack {
          Text(route.name).wallyText(15, .semibold, .ink, tracking: -0.2).multilineTextAlignment(.leading)
          Spacer(minLength: 4)
          Image(systemName: "arrow.up.right").font(.system(size: 14)).foregroundStyle(Color.ink)
        }.padding(.top, 9)
        Text(route.description).wallyText(11, .regular, Color(hex: 0x84907b)).lineSpacing(5).multilineTextAlignment(.leading).padding(.top, 6)
        HStack(spacing: 12) {
          Label("\(route.totalMinutes) of \(requestedMinutes) min\(route.overBudget ? " · \(route.totalMinutes - requestedMinutes) over" : "")", systemImage: "clock")
            .foregroundStyle(route.overBudget ? Color.danger : Color(hex: 0x63745c))
            .fontWeight(route.overBudget ? .bold : .regular)
          Label(kilometres(route.distanceMeters), systemImage: "shoeprints.fill")
          Label("\(route.stops.count) stops", systemImage: "mappin")
        }.labelStyle(StatLabel()).wallyText(11, .regular, Color(hex: 0x63745c)).padding(.top, 13)
        Text("\(route.isLoop ? "Returns to start" : route.destination != nil ? "Finishes at your destination" : "Finishes at the last stop") · \(model.preferences.pace == .run ? "running" : "walking") and stops included")
          .wallyText(11, .regular, Color(hex: 0x748465)).padding(.top, 8)
        FlowLayout(spacing: 4) {
          ForEach(Array(route.highlights.prefix(3)), id: \.self) { highlight in
            Text(highlight).wallyText(10, .regular, Color(hex: 0x7b886c)).padding(.vertical, 4).padding(.horizontal, 6).background(RoundedRectangle(cornerRadius: 4).fill(Color(hex: 0xe7ecdd)))
          }
        }.padding(.top, 10)
      }
      .padding(16).frame(maxWidth: .infinity, alignment: .leading)
      .card(border: route.overBudget || selected ? color : .line, radius: 12, fill: route.overBudget ? Color.dangerTint : selected ? Color(hex: 0xf0f3e9) : .clear)
      .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.danger, lineWidth: route.overBudget ? 2 : 0))
      .contentShape(RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(PressStyle())
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

struct StatLabel: LabelStyle {
  func makeBody(configuration: Configuration) -> some View { HStack(spacing: 4) { configuration.icon.font(.system(size: 11)); configuration.title } }
}

struct ItineraryView: View {
  @Environment(AppModel.self) private var model
  var route: WanderRoute
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if model.preview == nil && !route.overBudget {
        let remembered = model.historyEntry(for: route)
        HStack {
          StarRating(value: remembered?.rating, label: "Rate \(route.name)") { model.rateRoute(route, $0) }
          Spacer()
          FavouriteButton(on: remembered?.favourite == true) { model.toggleRouteFavourite(route) }
        }
        .padding(.vertical, 6).padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(hex: 0xf0f3e9)))
        .padding(.bottom, 18)
      }
      Text("Stops").wallyText(17, .semibold, .ink, tracking: -0.4).padding(.bottom, 15)
      Label("\(route.walkingMinutes) min \(model.preferences.pace == .run ? "running" : "walking") · \(route.stopMinutes) min at stops · \(route.bufferMinutes) min buffer", systemImage: "clock")
        .labelStyle(StatLabel()).wallyText(11, .regular, Color(hex: 0x89917d)).padding(.top, -4)
      if route.stops.contains(where: { $0.suggestedActivity != nil }) {
        Text("Activities are suggestions. Check access and opening hours.").wallyText(11, .regular, Color(hex: 0x87917b)).padding(.top, 9)
      }
      VStack(alignment: .leading, spacing: 0) {
        ForEach(Array(route.stops.enumerated()), id: \.element.id) { index, stop in
          let last = index == route.stops.count - 1 && route.destination == nil
          StopRow(index: "\(index + 1)", connector: !last) {
            Text("\(stop.category.rawValue.uppercased()) · \(plannedVisitMinutes(stop)) MIN PLANNED\(!route.isLoop && route.destination == nil && last ? " · FINISH" : "")")
              .wallyText(7, .regular, Color(hex: 0x89947c), tracking: 1)
            Text(stop.name).wallyText(13, .semibold).padding(.top, 3)
            Text(stop.suggestedActivity ?? stop.description ?? "A point of interest along this route.").wallyText(11, .regular, Color(hex: 0x8b9480)).lineSpacing(6).padding(.top, 7)
            if let activity = stop.suggestedActivity, let description = stop.description, description != activity {
              Text(description).wallyText(11, .regular, Color(hex: 0x969f89)).padding(.top, 5)
            }
            if route.source == .live && !stop.attributions.isEmpty { AttributionLinks(attributions: stop.attributions).padding(.top, 8) }
            let visited = model.visited.contains(stop.id)
            Button { model.visit(stop.id) } label: {
              Label(visited ? "Been here" : "Mark as visited", systemImage: visited ? "checkmark.circle.fill" : "checkmark").labelStyle(StatLabel())
                .wallyText(10, .regular, visited ? .forest : Color(hex: 0x8c967e))
            }.buttonStyle(PressStyle()).padding(.top, 10).accessibilityAddTraits(visited ? .isSelected : [])
          }
        }
        if let destination = route.destination {
          StopRow(index: nil, connector: false) {
            Text("YOUR DESTINATION").wallyText(7, .regular, Color(hex: 0x89947c), tracking: 1)
            Text(route.source == .demo ? "National Museum of Scotland" : "Your chosen finish").wallyText(13, .semibold).padding(.top, 3)
            Text(String(format: "Finish at %.4f°, %.4f°. This endpoint is included in your walking estimate.", destination.lat, destination.lng))
              .wallyText(11, .regular, Color(hex: 0x8b9480)).lineSpacing(6).padding(.top, 7)
          }
        }
      }.padding(.top, 20)
    }.padding(.top, 26)
  }
}

private struct StopRow<Content: View>: View {
  var index: String?
  var connector: Bool
  @ViewBuilder var content: Content
  var body: some View {
    HStack(alignment: .top, spacing: 11) {
      ZStack {
        Circle().fill(index == nil ? Color(hex: 0xf0e7da) : Color(hex: 0xe8eddd))
        if let index { Text(index).wallyText(9, .semibold, Color(hex: 0x677e50)) }
        else { Image(systemName: "flag").font(.system(size: 10)).foregroundStyle(Color(hex: 0xab7549)) }
      }.frame(width: 23, height: 23)
      VStack(alignment: .leading, spacing: 0) { content }.frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.bottom, 24)
    .background(alignment: .topLeading) {
      if connector {
        Line().stroke(Color(hex: 0xcdd5bd), style: StrokeStyle(lineWidth: 1, dash: [3, 3])).frame(width: 1).padding(.top, 25).padding(.bottom, 1).offset(x: 11)
      }
    }
  }
}

private struct Line: Shape {
  func path(in rect: CGRect) -> Path { Path { $0.move(to: CGPoint(x: rect.midX, y: rect.minY)); $0.addLine(to: CGPoint(x: rect.midX, y: rect.maxY)) } }
}
