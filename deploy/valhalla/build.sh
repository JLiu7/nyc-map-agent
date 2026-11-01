#!/usr/bin/env bash
# Valhalla street data for walking routes: the same NYC OSM extract OTP uses. A one-shot
# valhalla-scripted container builds the tiles into $ROOT, then the serving container
# (nyc-map-valhalla, which never builds) restarts on them. About 2 minutes and 2 GB of memory.
set -euo pipefail
ROOT=${VALHALLA_ROOT:-$HOME/apps/nyc-map-valhalla}
IMAGE=${VALHALLA_IMAGE:-ghcr.io/valhalla/valhalla-scripted:3.9.1}
mkdir -p "$ROOT"
curl -fsSL --retry 3 -o "$ROOT/nyc.osm.pbf.tmp" https://download.bbbike.org/osm/bbbike/NewYork/NewYork.osm.pbf
mv "$ROOT/nyc.osm.pbf.tmp" "$ROOT/nyc.osm.pbf"
docker run --rm --name nyc-map-valhalla-build -m 4g -e serve_tiles=False -e force_rebuild=True \
  -e build_elevation=False -e build_admins=True -e build_time_zones=True -v "$ROOT":/custom_files "$IMAGE"
docker restart nyc-map-valhalla >/dev/null 2>&1 || echo "valhalla container not running yet; start it with compose"
echo "valhalla tiles rebuilt $(date -Is)"
