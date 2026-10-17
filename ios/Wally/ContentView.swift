import SwiftUI
import WallyCore

/// `.wally-shell`: header, map stage, planner panel, caption and location button.
/// Below 768 pt the planner is a bottom sheet, as in the mobile web layout.
struct ContentView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    GeometryReader { proxy in
      let wide = proxy.size.width >= 768
      let headerHeight: CGFloat = wide ? 90 : 56
      // The visible sheet height; the sheet also fills the bottom safe area below it.
      let sheetHeight = model.mobileExpanded ? proxy.size.height * 0.56 : 57
      ZStack(alignment: .topLeading) {
        Color.cream
        mapStage
          .padding(.top, headerHeight)
          .padding(.leading, wide ? (proxy.size.width >= 1500 ? 444 : 420) : 0)
          .padding(.bottom, wide ? 0 : sheetHeight)
        HeaderView(wide: wide, showTagline: proxy.size.width > 1000).frame(height: headerHeight)
        if let caption = model.mapCaption { MapCaption(text: caption, wide: wide).padding(.top, wide ? 117 : 70).padding(.leading, wide ? 0 : 18).frame(maxWidth: wide ? .infinity : nil, alignment: .center).offset(x: wide ? 100 : 0) }
        LocationButton(size: wide ? 40 : 35).padding(.top, wide ? 113 : 68).padding(.trailing, wide ? 27 : 17).frame(maxWidth: .infinity, alignment: .trailing)
        if wide {
          PlannerPanel(sheet: false).frame(width: proxy.size.width >= 1500 ? 398 : 374)
            .background(RoundedRectangle(cornerRadius: 20).fill(Color.cream).shadow(color: Color(hex: 0x304b3a, opacity: 0.09), radius: 19, y: 8))
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .padding(.top, 112).padding(.leading, 28).padding(.bottom, 26)
        } else {
          VStack { Spacer(minLength: 0); PlannerPanel(sheet: true).frame(height: sheetHeight + proxy.safeAreaInsets.bottom) }
            .ignoresSafeArea(edges: .bottom)
        }
      }
      .animation(.spring(response: 0.3, dampingFraction: 1), value: model.mobileExpanded)
    }
    .background(Color.cream)
    .ignoresSafeArea(.keyboard)
    .onAppear { model.requestAutomaticLocation() }
  }

  @ViewBuilder private var mapStage: some View {
    if model.hasMapKey {
      WanderMapView(start: model.effectiveStart, hasStart: model.effectiveStartSelected, destination: model.preferences.mode == .destination ? model.effectiveDestination : nil,
        routes: model.shownRoutes, selected: model.shownRoute, event: model.preview?.event ?? model.selected?.event,
        canSetStart: !model.loading && !model.preferences.demo, onStartChange: model.changeMapLocation)
    } else {
      SampleRoutePreview(start: model.effectiveStart, routes: model.routes, selected: model.selected)
    }
  }
}

struct HeaderView: View {
  @Environment(AppModel.self) private var model
  var wide: Bool
  var showTagline: Bool
  var body: some View {
    HStack(spacing: wide ? 30 : 12) {
      HStack(spacing: 8) {
        Image(systemName: "point.topleft.down.to.point.bottomright.curvepath").font(.system(size: wide ? 22 : 16, weight: .semibold)).foregroundStyle(Color.forest)
          .rotationEffect(.degrees(-10)).frame(width: wide ? 35 : 24, height: wide ? 35 : 24)
        (Text("wally").foregroundStyle(Color.ink) + Text(".").foregroundStyle(Color(hex: 0x9bab70)))
          .font(.custom("Arial-BoldMT", size: wide ? 36 : 26)).tracking(wide ? -2 : -1.5)
      }.accessibilityElement(children: .combine).accessibilityLabel("Wally home")
      if showTagline {
        Text("Take the scenic route to nowhere.").wallyText(11, .regular, Color(hex: 0x737c70), tracking: 0.1)
          .padding(.vertical, 6).padding(.leading, 27).overlay(alignment: .leading) { Rectangle().fill(Color(hex: 0xdaddd2)).frame(width: 1) }
      }
      Spacer(minLength: 0)
      PaceToggle(wide: wide)
      if model.preferences.demo {
        Text("DEMO MODE").wallyText(wide ? 9 : 7, .semibold, Color(hex: 0x576d58), tracking: wide ? 1.2 : 0.8)
          .padding(.vertical, wide ? 10 : 7).padding(.horizontal, wide ? 14 : 10).background(Capsule().fill(Color(hex: 0xedf0e5)))
      }
    }
    .padding(.horizontal, wide ? 36 : 19)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color.cream)
    .overlay(alignment: .bottom) { Rectangle().fill(Color(hex: 0xe8e9de)).frame(height: 1) }
  }
}

/// Top-right toggle between walking and running pace. Running plans travel
/// 2.25x faster, so the same time budget reaches further.
struct PaceToggle: View {
  @Environment(AppModel.self) private var model
  var wide: Bool
  var body: some View {
    let run = model.preferences.pace == .run
    Button {
      var next = model.preferences
      next.pace = run ? .walk : .run
      model.changePreferences(next)
    } label: {
      HStack(spacing: 5) {
        Image(systemName: run ? "figure.run" : "figure.walk").font(.system(size: wide ? 13 : 12, weight: .semibold))
        Text(run ? "Run" : "Walk")
      }
      .wallyText(wide ? 11 : 10, .semibold, run ? .cream : .forest)
      .padding(.vertical, wide ? 8 : 6).padding(.horizontal, wide ? 12 : 10)
      .background(Capsule().fill(run ? Color.forest : Color.cream))
      .overlay(Capsule().stroke(run ? Color.forest : Color(hex: 0xd6dccb), lineWidth: 1))
    }
    .buttonStyle(PressStyle())
    .disabled(model.loading)
    .accessibilityLabel(run ? "Running pace on. Switch to walking" : "Switch to running pace")
    .accessibilityAddTraits(run ? .isSelected : [])
  }
}

struct MapCaption: View {
  var text: String
  var wide: Bool
  var body: some View {
    HStack(spacing: 7) {
      Circle().fill(Color(hex: 0x8d9f6b)).frame(width: 5, height: 5)
      Text(text).wallyText(wide ? 8 : 6, .semibold, .ink, tracking: wide ? 1 : 0.6).lineLimit(1)
    }
    .padding(.vertical, wide ? 10 : 9).padding(.horizontal, wide ? 16 : 12)
    .background(Capsule().fill(Color.cream.opacity(0.94)).shadow(color: Color(hex: 0x304b3a, opacity: 0.04), radius: 4.5, y: 2))
  }
}

struct LocationButton: View {
  @Environment(AppModel.self) private var model
  var size: CGFloat
  var body: some View {
    Button(action: model.locate) {
      Image(systemName: "location").font(.system(size: size * 0.5)).foregroundStyle(Color.forest).frame(width: size, height: size)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.cream).shadow(color: Color(hex: 0x304b3a, opacity: 0.07), radius: 7.5, y: 3))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xe1e7d9), lineWidth: 1))
    }
    .buttonStyle(PressStyle())
    .disabled(model.locating || model.preferences.demo || model.loading)
    .accessibilityLabel("Find my location")
  }
}

/// `.adventure-panel`: the sheet handle (mobile only) and the scrolling planner.
struct PlannerPanel: View {
  @Environment(AppModel.self) private var model
  var sheet: Bool
  var body: some View {
    @Bindable var model = model
    VStack(spacing: 0) {
      if sheet {
        Button { model.mobileExpanded.toggle() } label: {
          ZStack(alignment: .top) {
            Capsule().fill(Color(hex: 0xd6dccb)).frame(width: 31, height: 4).padding(.top, 8)
            HStack {
              Text(model.routes.isEmpty ? "Plan your walk" : "Your routes").wallyText(12, .medium, .forest)
              Spacer()
              Image(systemName: "arrow.down").font(.system(size: 13)).foregroundStyle(Color.forest).rotationEffect(.degrees(model.mobileExpanded ? 0 : 180))
            }.padding(.top, 17).padding(.horizontal, 22)
          }.frame(maxWidth: .infinity, minHeight: 53, alignment: .top).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(model.mobileExpanded ? "Collapse walk planner" : "Expand walk planner")
      }
      ScrollViewReader { reader in
        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            RouteControlsView()
            if model.preferences.demo {
              HStack(alignment: .top, spacing: 8) {
                Image(systemName: "info.circle").font(.system(size: 14)).padding(.top, 1)
                (Text("Sample Edinburgh walks.").font(.wally(11, .semibold)).foregroundColor(Color(hex: 0x566a46)) + Text(" Paths and times are illustrative, not verified directions.\(model.hasLiveSetup ? "" : " Configure Google Maps to use live routing.")"))
                  .wallyText(11, .regular, Color(hex: 0x71805e)).lineSpacing(4)
              }
              .foregroundStyle(Color(hex: 0x71805e)).padding(.vertical, 12).padding(.horizontal, 14)
              .card(border: Color(hex: 0xe0e5d2), radius: 10, fill: Color(hex: 0xeef0e2)).padding(.horizontal, 24).padding(.bottom, 18)
            }
            if !model.error.isEmpty { ErrorNotice() }
            if !model.message.isEmpty { Text(model.message).wallyText(11, .regular, Color(hex: 0x65745a)).lineSpacing(4).padding(.horizontal, 24).padding(.bottom, 18) }
            RouteResultsView().id("results")
            if model.preferences.includeEvents, let selected = model.selected, selected.event == nil { EventDetourView() }
            if let accepted = model.acceptedDetour {
              Text("Sample detour added: \(accepted.event.name). Total estimate includes the visit.").wallyText(11, .regular, Color(hex: 0x65745a)).lineSpacing(4).padding(.horizontal, 24).padding(.bottom, 18)
            }
          }
          .padding(.bottom, sheet ? 12 : 0)
        }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: model.scrollToResults) { withAnimation { reader.scrollTo(model.scrollTarget, anchor: .top) } }
      }
    }
    .background(sheet ? UnevenRoundedRectangle(topLeadingRadius: 23, topTrailingRadius: 23).fill(Color.cream).shadow(color: Color(hex: 0x304b3a, opacity: 0.11), radius: 15, y: -5) : nil)
    .clipShape(UnevenRoundedRectangle(topLeadingRadius: sheet ? 23 : 0, topTrailingRadius: sheet ? 23 : 0))
  }
}

struct ErrorNotice: View {
  @Environment(AppModel.self) private var model
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(model.error).wallyText(11, .regular, Color(hex: 0x975d39)).lineSpacing(4).fixedSize(horizontal: false, vertical: true)
      if !model.preferences.demo {
        Button { var next = model.preferences; next.demo = true; model.changePreferences(next) } label: {
          HStack(spacing: 5) { Text("Try Edinburgh Demo Mode"); Image(systemName: "arrow.up.right").font(.system(size: 11)) }.wallyText(11, .semibold, .forest)
        }.buttonStyle(PressStyle())
      }
    }
    .padding(.vertical, 14).padding(.leading, 12).padding(.trailing, 24)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 9).fill(Color(hex: 0xf8eee6)))
    .overlay(alignment: .topTrailing) {
      Button { model.error = "" } label: { Image(systemName: "xmark").font(.system(size: 11)).foregroundStyle(Color(hex: 0x975d39)).padding(8) }
        .accessibilityLabel("Dismiss error")
    }
    .padding(.horizontal, 24).padding(.bottom, 18)
    .accessibilityElement(children: .contain)
  }
}
