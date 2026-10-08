import ExpoModulesCore
import MapKit

private final class ApplePlaceAnnotation: MKPointAnnotation {
  let placeId: String
  let category: String

  init(place: ApplePlaceRecord) {
    placeId = place.id
    category = place.category
    super.init()
    title = place.name
    coordinate = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
  }
}

final class TuurApplePlacesView: ExpoView, MKMapViewDelegate {
  private let map = MKMapView()
  let onPlaceSelected = EventDispatcher()
  var latitude: Double = .nan
  var longitude: Double = .nan
  var radiusMeters: Double = 1500
  var places: [ApplePlaceRecord] = []
  var selectedPlaceId: String?
  private var lastRegionKey = ""
  private var lastPlacesKey = ""

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    map.delegate = self
    map.mapType = .standard
    map.showsCompass = true
    map.showsScale = true
    // The host supplies its already-consented location; this view starts no location watcher.
    map.showsUserLocation = false
    map.pointOfInterestFilter = .excludingAll
    map.register(MKMarkerAnnotationView.self, forAnnotationViewWithReuseIdentifier: "apple-place")
    addSubview(map)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // Keep MapKit's logo/legal attribution visible and unobscured inside the complete native map.
    map.frame = bounds
  }

  func applyChanges() {
    let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    guard CLLocationCoordinate2DIsValid(center), radiusMeters.isFinite else { return }
    let radius = min(1500, max(100, radiusMeters))
    let regionKey = "\(latitude)|\(longitude)|\(radius)"
    if lastRegionKey != regionKey {
      map.setRegion(MKCoordinateRegion(center: center, latitudinalMeters: radius * 2.3, longitudinalMeters: radius * 2.3), animated: false)
      lastRegionKey = regionKey
    }
    let validPlaces = places.prefix(40).filter {
      !$0.id.isEmpty && !$0.name.isEmpty && CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude))
    }
    let placesKey = validPlaces.map { "\($0.id)|\($0.latitude)|\($0.longitude)" }.joined(separator: ";")
    if lastPlacesKey != placesKey {
      map.removeAnnotations(map.annotations)
      map.addAnnotations(validPlaces.map(ApplePlaceAnnotation.init))
      lastPlacesKey = placesKey
    }
    if let selectedPlaceId,
      let selected = map.annotations.compactMap({ $0 as? ApplePlaceAnnotation }).first(where: { $0.placeId == selectedPlaceId }) {
      if !map.selectedAnnotations.contains(where: { ($0 as? ApplePlaceAnnotation)?.placeId == selectedPlaceId }) {
        map.selectAnnotation(selected, animated: true)
      }
    } else {
      for annotation in map.selectedAnnotations { map.deselectAnnotation(annotation, animated: false) }
    }
  }

  func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
    guard let place = annotation as? ApplePlaceAnnotation,
      let marker = mapView.dequeueReusableAnnotationView(withIdentifier: "apple-place", for: place) as? MKMarkerAnnotationView else { return nil }
    marker.canShowCallout = true
    marker.markerTintColor = .systemRed
    let symbols = ["coffee": "cup.and.saucer.fill", "food": "fork.knife", "park": "leaf.fill", "toilets": "toilet.fill",
      "museum": "building.columns.fill", "culture": "theatermasks.fill"]
    marker.glyphImage = UIImage(systemName: symbols[place.category] ?? "mappin")
    marker.accessibilityLabel = place.title
    return marker
  }

  func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
    guard let place = view.annotation as? ApplePlaceAnnotation else { return }
    onPlaceSelected(["id": place.placeId])
  }
}
