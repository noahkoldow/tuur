"""Extracts the places tuur needs from an OSM extract (e.g. Geofabrik Brandenburg incl. Berlin).

    python -I scripts/geofabrik-extract.py brandenburg-latest.osm.pbf places.jsonl

The filters mirror buildOverpassQuery (packages/shared/src/poi/raw.ts), so a line is the Overpass JSON element
that query would have returned: node (lat/lon), way/relation (center) and, for the walkable street network,
way geometry. The existing parseOverpass then produces identical RawPoi records. Each line also carries `tile`
(six-character geohash of its location) so the output can be grouped per tile without a second pass.

Requires pyosmium (pip install osmium). Reads the file only; writes nothing but the output path.
"""

import json
import sys
from collections import Counter

import osmium

GEOHASH = "0123456789bcdefghjkmnpqrstuvwxyz"


def geohash(lat: float, lng: float, precision: int = 6) -> str:
    lat_range, lng_range = [-90.0, 90.0], [-180.0, 180.0]
    out, bits, ch, even = "", 0, 0, True
    while len(out) < precision:
        rng, value = (lng_range, lng) if even else (lat_range, lat)
        mid = (rng[0] + rng[1]) / 2
        if value >= mid:
            ch = ch * 2 + 1
            rng[0] = mid
        else:
            ch = ch * 2
            rng[1] = mid
        even = not even
        bits += 1
        if bits == 5:
            out += GEOHASH[ch]
            bits, ch = 0, 0
    return out


SIGHT_VALUES = {
    "tourism": {"attraction", "museum", "gallery", "artwork", "viewpoint", "zoo", "theme_park", "aquarium"},
    "amenity": {
        "place_of_worship", "theatre", "arts_centre", "marketplace", "fountain", "townhall", "library",
        "university", "restaurant", "cafe", "food_court", "ice_cream", "pub", "bar", "nightclub", "biergarten",
    },
    "man_made": {"tower", "lighthouse", "windmill", "watermill", "obelisk"},
    "leisure": {"park", "garden", "nature_reserve"},
    "natural": {"peak", "waterfall", "spring", "cave_entrance", "beach"},
    "building": {
        "cathedral", "church", "chapel", "castle", "palace", "monastery", "temple", "mosque", "synagogue",
    },
}
# Any value qualifies for these keys.
SIGHT_ANY = ("historic", "heritage")
HIGHWAYS = {
    "residential", "living_street", "pedestrian", "footway", "path", "cycleway", "unclassified", "tertiary",
    "secondary",
}
PLACES = {"neighbourhood", "quarter", "suburb", "hamlet", "village", "locality", "square"}
BLOCKED_ACCESS = {"private", "no", "customers", "permit"}


def is_sight(tags) -> bool:
    if not tags.get("name"):
        return False
    if any(key in tags for key in SIGHT_ANY):
        return True
    return any(tags.get(key) in values for key, values in SIGHT_VALUES.items())


def is_local(tags, kind: str) -> bool:
    """Context for the narration (streets, quarters, boards, named trees); `kind` is node, way or area."""
    if not tags.get("name"):
        return False
    if kind == "way" and tags.get("highway") in HIGHWAYS:
        return tags.get("access") not in BLOCKED_ACCESS and tags.get("foot") != "no"
    if kind == "node" and tags.get("place") in PLACES:
        return True
    if tags.get("tourism") == "information" and tags.get("information") in {"board", "map"}:
        return True
    return kind == "node" and tags.get("natural") == "tree"


class Extractor(osmium.SimpleHandler):
    def __init__(self, out):
        super().__init__()
        self.out = out
        self.counts = Counter()

    def emit(self, kind: str, element_id: int, tags, lat: float, lng: float, extra: dict, role: str = "sight") -> None:
        # role "sight" = a place worth visiting; "local" = street/quarter/board context for narration.
        element = {"type": kind, "id": element_id, "role": role, "tags": dict(tags), "tile": geohash(lat, lng), **extra}
        self.out.write(json.dumps(element, ensure_ascii=False, separators=(",", ":")) + "\n")
        self.counts[kind] += 1

    def node(self, n):
        if not n.tags or not n.location.valid():
            return
        if is_sight(n.tags) or is_local(n.tags, "node"):
            self.emit("node", n.id, n.tags, n.location.lat, n.location.lon,
                      {"lat": n.location.lat, "lon": n.location.lon}, "sight" if is_sight(n.tags) else "local")

    def way(self, w):
        if not w.tags:
            return
        sight, local = is_sight(w.tags), is_local(w.tags, "way")
        if not (sight or local):
            return
        try:
            points = [(node.lat, node.lon) for node in w.nodes if node.location.valid()]
        except osmium.InvalidLocationError:
            return
        if not points:
            return
        lats, lngs = [p[0] for p in points], [p[1] for p in points]
        center = {"lat": (min(lats) + max(lats)) / 2, "lon": (min(lngs) + max(lngs)) / 2}
        extra = {"center": center}
        if local and not sight:
            extra["geometry"] = [{"lat": lat, "lon": lng} for lat, lng in points]
        self.emit("way", w.id, w.tags, center["lat"], center["lon"], extra, "sight" if sight else "local")

    def area(self, a):
        # Ways are handled above; only multipolygon relations are new here.
        if a.from_way() or not a.tags or not is_sight(a.tags):
            return
        try:
            points = [(n.lat, n.lon) for ring in a.outer_rings() for n in ring if n.location.valid()]
        except (osmium.InvalidLocationError, RuntimeError):
            return
        if not points:
            return
        lats, lngs = [p[0] for p in points], [p[1] for p in points]
        center = {"lat": (min(lats) + max(lats)) / 2, "lon": (min(lngs) + max(lngs)) / 2}
        self.emit("relation", a.orig_id(), a.tags, center["lat"], center["lon"], {"center": center})


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    source, target = sys.argv[1], sys.argv[2]
    with open(target, "w", encoding="utf-8", newline="\n") as out:
        handler = Extractor(out)
        handler.apply_file(source, locations=True, idx="flex_mem")
    print(json.dumps({"written": dict(handler.counts), "output": target}))


if __name__ == "__main__":
    main()
