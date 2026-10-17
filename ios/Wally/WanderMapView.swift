import GoogleMaps
import SwiftUI
import WallyCore

/// `src/components/map/wander-map.tsx` with the Google Maps SDK for iOS.
struct WanderMapView: UIViewRepresentable {
  var start: Coordinates
  var hasStart: Bool
  var destination: Coordinates?
  var routes: [WanderRoute]
  var selected: WanderRoute?
  var event: SampleEvent?
  var canSetStart: Bool
  var onStartChange: (Coordinates) -> Void

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIView(context: Context) -> MapContainer {
    let options = GMSMapViewOptions()
    options.camera = GMSCameraPosition(latitude: start.lat, longitude: start.lng, zoom: 14)
    if let mapID = AppConfig.mapID { options.mapID = GMSMapID(identifier: mapID) }
    let mapView = GMSMapView(options: options)
    mapView.delegate = context.coordinator
    mapView.settings.compassButton = false
    mapView.settings.indoorPicker = false
    mapView.isBuildingsEnabled = false
    mapView.accessibilityLabel = "Interactive Google Maps walking route map"
    return MapContainer(mapView: mapView)
  }

  func updateUIView(_ container: MapContainer, context: Context) {
    let coordinator = context.coordinator
    coordinator.canSetStart = canSetStart
    coordinator.onStartChange = onStartChange
    coordinator.draw(on: container.mapView, start: start, hasStart: hasStart, destination: destination, routes: routes, selected: selected, event: event)
    let fitKey = "\(selected?.id ?? "-"):\(start.lat),\(start.lng):\(destination?.lat ?? 0),\(destination?.lng ?? 0)"
    container.fit = { mapView in
      var bounds = GMSCoordinateBounds()
      if let selected { for point in selected.geometry { bounds = bounds.includingCoordinate(CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng)) } }
      else {
        bounds = bounds.includingCoordinate(CLLocationCoordinate2D(latitude: start.lat, longitude: start.lng))
        if let destination { bounds = bounds.includingCoordinate(CLLocationCoordinate2D(latitude: destination.lat, longitude: destination.lng)) }
      }
      guard let camera = mapView.camera(for: bounds, insets: UIEdgeInsets(top: 55, left: 45, bottom: 50, right: 55)) else { return }
      mapView.animate(to: GMSCameraPosition(target: camera.target, zoom: min(camera.zoom, 16)))
    }
    if coordinator.fitKey != fitKey { coordinator.fitKey = fitKey; container.refit() }
  }

  final class MapContainer: UIView {
    let mapView: GMSMapView
    var fit: ((GMSMapView) -> Void)?
    private var lastSize = CGSize.zero
    init(mapView: GMSMapView) {
      self.mapView = mapView
      super.init(frame: .zero)
      addSubview(mapView)
    }
    required init?(coder: NSCoder) { nil }
    override func layoutSubviews() {
      super.layoutSubviews()
      mapView.frame = bounds
      // Refit after a size change, such as the planner sheet opening or closing.
      if bounds.size != lastSize, bounds.width > 0, bounds.height > 0 { lastSize = bounds.size; refit() }
    }
    func refit() { if bounds.width > 0 { fit?(mapView) } }
  }

  final class Coordinator: NSObject, GMSMapViewDelegate {
    var canSetStart = false
    var onStartChange: ((Coordinates) -> Void)?
    var fitKey = ""
    private var drawKey = ""
    private var overlays: [GMSOverlay] = []

    func mapView(_ mapView: GMSMapView, didTapAt coordinate: CLLocationCoordinate2D) {
      if canSetStart { onStartChange?(Coordinates(lat: coordinate.latitude, lng: coordinate.longitude)) }
    }

    func draw(on mapView: GMSMapView, start: Coordinates, hasStart: Bool, destination: Coordinates?, routes: [WanderRoute], selected: WanderRoute?, event: SampleEvent?) {
      let key = "\(routes.map(\.id))|\(selected?.id ?? "")|\(start.lat),\(start.lng),\(hasStart)|\(destination.map { "\($0.lat),\($0.lng)" } ?? "")|\(event?.id ?? "")"
      guard key != drawKey else { return }
      drawKey = key
      overlays.forEach { $0.map = nil }
      overlays = []
      for (index, route) in routes.enumerated() {
        let path = GMSMutablePath()
        route.geometry.forEach { path.add(CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng)) }
        let line = GMSPolyline(path: path)
        let isSelected = route.id == selected?.id
        line.strokeColor = UIColor(routeColor(index)).withAlphaComponent(isSelected ? 0.95 : 0.35)
        line.strokeWidth = isSelected ? 6 : 3
        line.zIndex = isSelected ? 2 : 1
        line.map = mapView
        overlays.append(line)
      }
      func marker(_ point: Coordinates, _ view: UIView, _ title: String) {
        let marker = GMSMarker(position: CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng))
        marker.iconView = view
        marker.groundAnchor = CGPoint(x: 0.5, y: 0.5)
        marker.tracksViewChanges = false
        marker.title = title
        marker.zIndex = 3
        marker.map = mapView
        overlays.append(marker)
      }
      if hasStart { marker(start, MarkerView.dot(size: 20, fill: UIColor(Color.forest), border: 4), "Start your wander here") }
      if let endpoint = selected?.destination ?? destination { marker(endpoint, MarkerView.symbol("flag", size: 33, fill: UIColor(Color.copper)), "Your destination · finish here") }
      selected?.stops.enumerated().forEach { index, stop in marker(stop.coordinates, MarkerView.text("\(index + 1)", size: 28, fill: UIColor(Color.forest)), stop.name) }
      if let event { marker(event.location, MarkerView.text("E", size: 27, fill: UIColor(Color.copper)), "Fictional sample event: \(event.name)") }
    }
  }
}

/// Marker views from `.start-map-marker`, `.numbered-map-marker`, `.endpoint-map-marker` and `.event-map-marker`.
enum MarkerView {
  private static func base(size: CGFloat, fill: UIColor, border: CGFloat) -> UIView {
    let view = UIView(frame: CGRect(x: 0, y: 0, width: size, height: size))
    view.backgroundColor = fill
    view.layer.cornerRadius = size / 2
    view.layer.borderWidth = border
    view.layer.borderColor = UIColor(Color.cream).cgColor
    view.layer.shadowColor = UIColor(Color.forest).cgColor
    view.layer.shadowOpacity = 0.21
    view.layer.shadowRadius = 4.5
    view.layer.shadowOffset = CGSize(width: 0, height: 2)
    return view
  }
  static func dot(size: CGFloat, fill: UIColor, border: CGFloat) -> UIView { base(size: size, fill: fill, border: border) }
  static func text(_ text: String, size: CGFloat, fill: UIColor) -> UIView {
    let view = base(size: size, fill: fill, border: 3)
    let label = UILabel(frame: view.bounds)
    label.text = text
    label.textAlignment = .center
    label.textColor = .white
    label.font = UIFont(name: "Arial-BoldMT", size: 11)
    view.addSubview(label)
    return view
  }
  static func symbol(_ name: String, size: CGFloat, fill: UIColor) -> UIView {
    let view = base(size: size, fill: fill, border: 3)
    let image = UIImageView(image: UIImage(systemName: name, withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold)))
    image.tintColor = UIColor(Color(hex: 0xfffdf8))
    image.contentMode = .center
    image.frame = view.bounds
    view.addSubview(image)
    return view
  }
}
