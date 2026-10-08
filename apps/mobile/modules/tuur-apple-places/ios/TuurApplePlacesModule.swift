import ExpoModulesCore
import MapKit

// The only mutable state is main-actor isolated, including cancellation and MapKit callbacks.
public final class TuurApplePlacesModule: Module, @unchecked Sendable {
  @MainActor private lazy var searchController = ApplePlacesSearchController()

  public func definition() -> ModuleDefinition {
    Name("TuurApplePlaces")

    AsyncFunction("searchNearby") { (options: ApplePlacesSearchOptions, promise: Promise) in
      MainActor.assumeIsolated {
        self.searchController.search(options: options, promise: promise)
      }
    }.runOnQueue(.main)

    AsyncFunction("cancelSearch") {
      MainActor.assumeIsolated {
        self.searchController.cancel()
      }
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async { self.searchController.cancel() }
    }

    View(TuurApplePlacesView.self) {
      Events("onPlaceSelected")
      Prop("latitude") { (view: TuurApplePlacesView, value: Double) in view.latitude = value }
      Prop("longitude") { (view: TuurApplePlacesView, value: Double) in view.longitude = value }
      Prop("radiusMeters") { (view: TuurApplePlacesView, value: Double?) in
        view.radiusMeters = value ?? 1500
      }
      Prop("places") { (view: TuurApplePlacesView, value: [ApplePlaceRecord]) in view.places = value }
      Prop("selectedPlaceId") { (view: TuurApplePlacesView, value: String?) in
        view.selectedPlaceId = value
      }
      OnViewDidUpdateProps { (view: TuurApplePlacesView) in view.applyChanges() }
    }
  }
}

struct ApplePlacesSearchOptions: Record {
  @Field var latitude: Double = .nan
  @Field var longitude: Double = .nan
  @Field var radiusMeters: Double = 1500
  @Field var category: String = "all"
}

struct ApplePlaceRecord: Record {
  @Field var id: String = ""
  @Field var name: String = ""
  @Field var latitude: Double = .nan
  @Field var longitude: Double = .nan
  @Field var category: String = ""
}

@MainActor
private final class ApplePlacesSearchController {
  private var activeSearch: MKLocalSearch?
  private var pendingPromise: Promise?
  private var timeout: DispatchWorkItem?
  private var generation = UUID()

  func cancel(code: String = "ERR_APPLE_PLACES_CANCELLED", message: String = "Search cancelled.") {
    // Invalidate first: MapKit may deliver its cancelled callback after a replacement starts.
    generation = UUID()
    let promise = pendingPromise
    pendingPromise = nil
    timeout?.cancel()
    timeout = nil
    activeSearch?.cancel()
    activeSearch = nil
    promise?.reject(code, message)
  }

  func search(options: ApplePlacesSearchOptions, promise: Promise) {
    cancel()
    let coordinate = CLLocationCoordinate2D(latitude: options.latitude, longitude: options.longitude)
    guard CLLocationCoordinate2DIsValid(coordinate), options.radiusMeters.isFinite,
      ["all", "sights", "coffee", "food", "park", "toilets", "museum", "culture"].contains(options.category) else {
      promise.reject("ERR_APPLE_PLACES_ARGUMENT", "Invalid nearby search coordinates or category.")
      return
    }
    let radius = min(1500, max(100, options.radiusMeters))
    let request = MKLocalPointsOfInterestRequest(center: coordinate, radius: radius)
    request.pointOfInterestFilter = MKPointOfInterestFilter(including: categories(options.category))
    let search = MKLocalSearch(request: request)
    activeSearch = search
    pendingPromise = promise
    let token = generation
    let timeout = DispatchWorkItem { [weak self] in
      guard let self, self.generation == token else { return }
      self.cancel(code: "ERR_APPLE_PLACES_TIMEOUT", message: "Apple Maps search timed out.")
    }
    self.timeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 18, execute: timeout)

    search.start { [weak self] response, error in
      guard let self, self.generation == token else { return }
      self.timeout?.cancel()
      self.timeout = nil
      self.activeSearch = nil
      self.pendingPromise = nil
      if let error {
        let nativeError = error as NSError
        if nativeError.domain == MKErrorDomain && nativeError.code == MKError.placemarkNotFound.rawValue {
          promise.resolve([ApplePlaceRecord]())
        } else {
          // Do not send provider request/response details or coordinates to logging systems.
          promise.reject("ERR_APPLE_PLACES_SEARCH", "Apple Maps search is temporarily unavailable.")
        }
        return
      }
      guard let response else {
        promise.reject("ERR_APPLE_PLACES_SEARCH", "Apple Maps returned no search response.")
        return
      }
      promise.resolve(self.results(response.mapItems, center: coordinate, radius: radius))
    }
  }

  private func categories(_ category: String) -> [MKPointOfInterestCategory] {
    switch category {
    case "coffee": return [.cafe, .bakery]
    case "food": return [.restaurant]
    case "park": return [.park]
    case "toilets": return [.restroom]
    case "museum": return [.museum]
    case "culture": return [.theater, .library, .aquarium, .zoo]
    case "sights": return [.museum, .theater, .library, .aquarium, .zoo]
    default: return [.cafe, .bakery, .restaurant, .park, .restroom]
    }
  }

  private func category(_ item: MKMapItem) -> String? {
    switch item.pointOfInterestCategory {
    case .cafe, .bakery: return "coffee"
    case .restaurant: return "food"
    case .park: return "park"
    case .restroom: return "toilets"
    case .museum: return "museum"
    case .theater, .library, .aquarium, .zoo: return "culture"
    default: return nil
    }
  }

  private func results(_ items: [MKMapItem], center: CLLocationCoordinate2D, radius: Double) -> [ApplePlaceRecord] {
    let origin = CLLocation(latitude: center.latitude, longitude: center.longitude)
    let candidates: [(place: ApplePlaceRecord, distance: Double)] = items.compactMap { item in
      guard let name = item.name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty,
        let category = category(item) else { return nil }
      let coordinate = item.placemark.coordinate
      guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }
      let distance = origin.distance(from: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude))
      // The search region is a preference; enforce the actual product radius on the returned data.
      guard distance <= radius else { return nil }
      var place = ApplePlaceRecord()
      place.id = "apple-\(UUID().uuidString)"
      place.name = String(name.prefix(200))
      place.latitude = coordinate.latitude
      place.longitude = coordinate.longitude
      place.category = category
      return (place, distance)
    }
    var unique: [ApplePlaceRecord] = []
    for candidate in candidates.sorted(by: { $0.distance < $1.distance }) {
      let place = candidate.place
      let normalized = place.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      let duplicate = unique.contains { existing in
        existing.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current) == normalized &&
          CLLocation(latitude: existing.latitude, longitude: existing.longitude)
            .distance(from: CLLocation(latitude: place.latitude, longitude: place.longitude)) < 25
      }
      if !duplicate { unique.append(place) }
      if unique.count == 40 { break }
    }
    // Results live only in this callback and the visible UI; no disk cache or server catalog.
    return unique
  }
}
