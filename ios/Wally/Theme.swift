import SwiftUI
import WallyCore

/// Colours and type from `src/app/globals.css`. Sizes follow the mobile (< 768 px) rules.
extension Color {
  init(hex: UInt32, opacity: Double = 1) {
    self.init(.sRGB, red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255, opacity: opacity)
  }
  static let forest = Color(hex: 0x214d3c)
  static let ink = Color(hex: 0x213c31)
  static let muted = Color(hex: 0x7c8278)
  static let cream = Color(hex: 0xfbfaf5)
  static let line = Color(hex: 0xe6e8dc)
  /// A route that takes longer than the chosen time.
  static let danger = Color(hex: 0xc62828)
  static let dangerTint = Color(hex: 0xfdecec)
  static let teal = Color(hex: 0x6c8f7d)
  static let copper = Color(hex: 0xbf8050)
  static let googleGrey = Color(hex: 0x5e5e5e)
}

let routeColors: [Color] = [Color(hex: 0x266b58), Color(hex: 0xc77c45), Color(hex: 0x6888a4)]
func routeColor(_ index: Int) -> Color { routeColors[index % routeColors.count] }

extension Font {
  /// The web app uses Arial. Arial has no 500 or 600 weight, so browsers draw 600+ as bold.
  static func wally(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    let bold = [Font.Weight.semibold, .bold, .heavy, .black].contains(weight)
    return .custom(bold ? "Arial-BoldMT" : "ArialMT", size: size, relativeTo: .body)
  }
}

extension View {
  func wallyText(_ size: CGFloat, _ weight: Font.Weight = .regular, _ color: Color = .ink, tracking: CGFloat = 0) -> some View {
    font(.wally(size, weight)).foregroundStyle(color).tracking(tracking)
  }
  func card(border: Color = .line, radius: CGFloat = 12, fill: Color = .clear) -> some View {
    background(RoundedRectangle(cornerRadius: radius).fill(fill)).overlay(RoundedRectangle(cornerRadius: radius).stroke(border, lineWidth: 1))
  }
}

/// `button:active { transform:scale(.98) }` and `button:disabled { opacity:.55 }`.
struct PressStyle: ButtonStyle {
  @Environment(\.isEnabled) private var enabled
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.scaleEffect(configuration.isPressed ? 0.98 : 1).opacity(enabled ? 1 : 0.55).animation(.easeOut(duration: 0.2), value: configuration.isPressed)
  }
}

struct PrimaryButton<Label: View>: View {
  var action: () -> Void
  @ViewBuilder var label: Label
  var body: some View {
    Button(action: action) {
      HStack(spacing: 15) { label }.wallyText(13, .medium, .cream).frame(maxWidth: .infinity, minHeight: 49)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.forest))
    }.buttonStyle(PressStyle())
  }
}

struct IconButton: View {
  var systemName: String
  var size: CGFloat = 27
  var label: String
  var pulse = false
  var action: () -> Void
  var body: some View {
    Button(action: action) {
      Image(systemName: systemName).font(.system(size: size * 0.5)).foregroundStyle(Color.forest).frame(width: size, height: size)
        .card(border: Color(hex: 0xdfe4d6), radius: 8).opacity(pulse ? 0.4 : 1)
        .animation(pulse ? .easeInOut(duration: 0.5).repeatForever() : .default, value: pulse)
    }.buttonStyle(PressStyle()).accessibilityLabel(label)
  }
}

/// The plain-text "Google Maps" attribution Google requires next to its content.
struct GoogleAttribution: View {
  var size: CGFloat = 14
  var body: some View { Text(verbatim: "Google Maps").font(.custom("ArialMT", size: size)).foregroundStyle(Color.googleGrey).lineLimit(1) }
}

struct AttributionLinks: View {
  var attributions: [Attribution]
  var size: CGFloat = 11
  var body: some View {
    FlowLayout(spacing: 8) {
      ForEach(Array(attributions.enumerated()), id: \.offset) { _, attribution in
        if let url = attribution.safeURL { Link(attribution.displayName, destination: url).underline() }
        else { Text(attribution.displayName) }
      }
    }.wallyText(size, .regular, .googleGrey)
  }
}

/// `display:flex; flex-wrap:wrap` for chips and links.
struct FlowLayout: Layout {
  var spacing: CGFloat = 7
  var lineSpacing: CGFloat? = nil
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    arrange(proposal.width ?? .infinity, subviews).size
  }
  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    for (index, point) in arrange(bounds.width, subviews).points.enumerated() {
      subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
    }
  }
  private func arrange(_ width: CGFloat, _ subviews: Subviews) -> (points: [CGPoint], size: CGSize) {
    var points: [CGPoint] = [], x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0 && x + size.width > width { x = 0; y += rowHeight + (lineSpacing ?? spacing); rowHeight = 0 }
      points.append(CGPoint(x: x, y: y))
      x += size.width + spacing; rowHeight = max(rowHeight, size.height); maxX = max(maxX, x - spacing)
    }
    return (points, CGSize(width: maxX, height: y + rowHeight))
  }
}

func icon(for category: PlaceCategory) -> String {
  switch category {
  case .park: "tree"
  case .viewpoint: "mountain.2"
  case .historic: "building.columns"
  case .art: "paintpalette"
  case .attraction: "mappin"
  case .path: "shoeprints.fill"
  }
}

func kindLabel(_ route: WanderRoute) -> String { route.destination != nil ? "TARGETED" : route.isLoop ? "LOOP" : "EXPLORE" }
func kilometres(_ meters: Int) -> String { String(format: "%.1f km", Double(meters) / 1000) }
