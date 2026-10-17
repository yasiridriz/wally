import SwiftUI
import WallyCore

/// `sample-route-preview.tsx`: a schematic for demo routes when no map key is set.
/// Live Google geometry is never drawn here.
struct SampleRoutePreview: View {
  var start: Coordinates
  var routes: [WanderRoute]
  var selected: WanderRoute?

  var body: some View {
    let samples = routes.filter { $0.source == .demo }
    let shown = selected?.source == .demo ? selected : nil
    VStack(spacing: 4) {
      HStack(spacing: 8) {
        Image(systemName: "safari").font(.system(size: 16))
        VStack(alignment: .leading, spacing: 6) {
          Text("Sample route preview").wallyText(12, .medium, Color(hex: 0x3e5947))
          Text("Sample route schematic · not a map or navigation").wallyText(10, .regular, Color(hex: 0x819074))
        }
      }.foregroundStyle(Color(hex: 0x6d805d))
      Canvas { context, size in draw(context, size, samples, shown) }
        .aspectRatio(800 / 560, contentMode: .fit)
        .accessibilityLabel(shown.map { "Illustrative path for \($0.name), with numbered sample stops" } ?? "Generate a demo route to see its illustrative path")
      Text("Illustrative Edinburgh sample geometry. Locations and travel times are unverified. Live map selection requires a Google Maps API key.")
        .wallyText(10, .regular, Color(hex: 0x869279)).multilineTextAlignment(.center).lineSpacing(3).frame(maxWidth: 300)
    }
    .padding(.top, 46).padding(.horizontal, 10).padding(.bottom, 10)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(hex: 0xedf0e4))
  }

  private func draw(_ context: GraphicsContext, _ size: CGSize, _ samples: [WanderRoute], _ shown: WanderRoute?) {
    let scale = size.width / 800
    for x in stride(from: 2.0, to: 800, by: 32) {
      for y in stride(from: 2.0, to: 560, by: 32) { context.fill(Path(ellipseIn: CGRect(x: x * scale - 1, y: y * scale - 1, width: 2, height: 2)), with: .color(Color(hex: 0xc5cdb7))) }
    }
    let points = samples.flatMap(\.geometry)
    let minLng = ([start.lng] + points.map(\.lng)).min()!, maxLng = ([start.lng] + points.map(\.lng)).max()!
    let minLat = ([start.lat] + points.map(\.lat)).min()!, maxLat = ([start.lat] + points.map(\.lat)).max()!
    let width = max(0.002, maxLng - minLng), height = max(0.002, maxLat - minLat)
    func point(_ c: Coordinates) -> CGPoint { CGPoint(x: (80 + (c.lng - minLng) / width * 640) * scale, y: (450 - (c.lat - minLat) / height * 340) * scale) }
    func label(_ text: String, at p: CGPoint) { context.draw(Text(text).font(.custom("ArialMT", size: 11 * max(scale, 0.6))).foregroundColor(Color(hex: 0x5a6d4e)), at: p) }
    guard !samples.isEmpty else {
      var path = Path()
      path.move(to: CGPoint(x: 140 * scale, y: 400 * scale))
      path.addCurve(to: CGPoint(x: 350 * scale, y: 300 * scale), control1: CGPoint(x: 190 * scale, y: 280 * scale), control2: CGPoint(x: 310 * scale, y: 440 * scale))
      path.addCurve(to: CGPoint(x: 650 * scale, y: 220 * scale), control1: CGPoint(x: 390 * scale, y: 160 * scale), control2: CGPoint(x: 530 * scale, y: 170 * scale))
      context.stroke(path, with: .color(Color(hex: 0x9cab83)), style: StrokeStyle(lineWidth: 4 * scale, lineCap: .round, dash: [7 * scale, 10 * scale]))
      context.fill(Path(ellipseIn: CGRect(x: 130 * scale, y: 390 * scale, width: 20 * scale, height: 20 * scale)), with: .color(.forest))
      context.draw(Text("Choose your preferences and generate a sample walk.").font(.custom("ArialMT", size: 13 * max(scale, 0.6))).foregroundColor(Color(hex: 0x7d8b70)), at: CGPoint(x: 400 * scale, y: 490 * scale))
      return
    }
    for (index, route) in samples.enumerated() {
      var path = Path()
      path.addLines(route.geometry.map(point))
      let isShown = route.id == shown?.id
      context.stroke(path, with: .color(routeColor(index).opacity(isShown ? 1 : 0.3)), style: StrokeStyle(lineWidth: (isShown ? 6 : 3) * scale, lineCap: .round, lineJoin: .round))
    }
    let s = point(start)
    context.fill(Path(ellipseIn: CGRect(x: s.x - 13 * scale, y: s.y - 13 * scale, width: 26 * scale, height: 26 * scale)), with: .color(.cream))
    context.fill(Path(ellipseIn: CGRect(x: s.x - 9 * scale, y: s.y - 9 * scale, width: 18 * scale, height: 18 * scale)), with: .color(.forest))
    label("START", at: CGPoint(x: s.x, y: s.y + 28 * scale))
    for (index, stop) in (shown?.stops ?? []).enumerated() {
      let p = point(stop.coordinates)
      context.fill(Path(ellipseIn: CGRect(x: p.x - 15 * scale, y: p.y - 15 * scale, width: 30 * scale, height: 30 * scale)), with: .color(.cream))
      context.fill(Path(ellipseIn: CGRect(x: p.x - 12 * scale, y: p.y - 12 * scale, width: 24 * scale, height: 24 * scale)), with: .color(.forest))
      context.draw(Text("\(index + 1)").font(.custom("ArialMT", size: 11 * max(scale, 0.6))).foregroundColor(Color(hex: 0xfffdf8)), at: p)
      label(stop.name, at: CGPoint(x: p.x, y: p.y - 23 * scale))
    }
    if let destination = shown?.destination {
      let p = point(destination)
      context.fill(Path(ellipseIn: CGRect(x: p.x - 17 * scale, y: p.y - 17 * scale, width: 34 * scale, height: 34 * scale)), with: .color(.cream))
      context.fill(Path(ellipseIn: CGRect(x: p.x - 14 * scale, y: p.y - 14 * scale, width: 28 * scale, height: 28 * scale)), with: .color(.copper))
      context.draw(Image(systemName: "flag"), at: p)
      label("FINISH", at: CGPoint(x: p.x, y: p.y + 32 * scale))
    }
  }
}
