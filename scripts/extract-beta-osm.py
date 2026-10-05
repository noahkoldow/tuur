"""Prepare local OSM candidates for the closed Berlin beta; never writes to Firebase.

Install pyosmium in an isolated environment, then run:
  python scripts/extract-beta-osm.py .firebase/beta-osm/berlin-latest.osm.pbf
The public Geofabrik extract omits contributor identity metadata. Full feature tags are retained.
"""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import osmium


BOUNDS = {"south": 52.5125, "west": 13.373, "north": 52.524, "east": 13.408}


def in_bounds(lat, lon):
    return BOUNDS["south"] <= lat < BOUNDS["north"] and BOUNDS["west"] <= lon < BOUNDS["east"]


def relevant(tags):
    return bool(tags.get("name")) and any(
        key in tags for key in ("tourism", "historic", "memorial", "leisure", "place", "heritage")
    )


class Candidates(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.elements = {}

    def store(self, kind, item_id, tags, coords, version, timestamp):
        if not coords:
            return
        lat = (min(c[0] for c in coords) + max(c[0] for c in coords)) / 2
        lon = (min(c[1] for c in coords) + max(c[1] for c in coords)) / 2
        if not in_bounds(lat, lon):
            return
        element = {
            "type": kind,
            "id": item_id,
            "tags": tags,
            "version": version,
            "timestamp": timestamp.isoformat(),
            "locationMethod": "osm-node" if kind == "node" else "osm-bounds-center",
        }
        element.update({"lat": lat, "lon": lon} if kind == "node" else {"center": {"lat": lat, "lon": lon}})
        self.elements[f"{kind}/{item_id}"] = element

    def node(self, node):
        tags = dict(node.tags)
        if relevant(tags) and node.location.valid():
            self.store("node", node.id, tags, [(node.lat, node.lon)], node.version, node.timestamp)

    def way(self, way):
        tags = dict(way.tags)
        if not relevant(tags):
            return
        if not all(n.location.valid() for n in way.nodes):
            return
        self.store("way", way.id, tags, [(n.lat, n.lon) for n in way.nodes], way.version, way.timestamp)

    def area(self, area):
        if area.from_way():
            return
        tags = dict(area.tags)
        if not relevant(tags):
            return
        coords = [(n.lat, n.lon) for ring in area.outer_rings() for n in ring if n.location.valid()]
        self.store("relation", area.orig_id(), tags, coords, area.version, area.timestamp)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pbf", type=Path)
    parser.add_argument("--out", type=Path, default=Path(".firebase/beta-osm/candidates.json"))
    args = parser.parse_args()
    handler = Candidates()
    # C++ filters run after location caching but before Python callbacks: untagged road nodes
    # remain available for geometries without invoking Python millions of times.
    handler.apply_file(
        str(args.pbf),
        locations=True,
        filters=[
            osmium.filter.KeyFilter("name"),
            osmium.filter.KeyFilter("tourism", "historic", "memorial", "leisure", "place", "heritage"),
        ],
    )
    with osmium.io.Reader(str(args.pbf), osmium.osm.NOTHING) as reader:
        snapshot = reader.header().get("osmosis_replication_timestamp")
    output = {
        "provenance": {
            "source": "https://download.geofabrik.de/europe/germany/berlin.html",
            "downloadUrl": "https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf",
            "license": "ODbL-1.0",
            "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
            "attribution": "© OpenStreetMap contributors; extract by Geofabrik GmbH",
            "snapshotAt": snapshot,
            "preparedAt": datetime.now(timezone.utc).isoformat(),
            "pbfSha256": hashlib.file_digest(args.pbf.open("rb"), "sha256").hexdigest(),
            "pbfBytes": args.pbf.stat().st_size,
        },
        "bounds": BOUNDS,
        "elements": sorted(handler.elements.values(), key=lambda item: (item["type"], item["id"])),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidates": len(output["elements"]), "snapshotAt": snapshot, "output": str(args.out)}))


if __name__ == "__main__":
    main()
