#!/usr/bin/env bash
# Weekly OTP graph rebuild: fetch NYC OSM + MTA/NYC Ferry GTFS, build graph.obj
# in a one-shot OTP container, swap it in atomically, restart the otp service.
# SIR ships inside gtfs_subway.zip. Run on the VPS (see deploy/README.md); takes about
# 15 minutes and up to 14 GB of memory.
# The build gets no secrets. otp.env, next to the graph, holds the one the server needs:
# MTA_BUSTIME_KEY, which router-config.json substitutes for live bus times.
set -euo pipefail
ROOT=${OTP_ROOT:-$HOME/apps/nyc-map-otp}
APP=${APP_DIR:-$HOME/apps/nyc-map-agent}
ENV_FILE=${ENV_FILE:-$HOME/apps/nyc-map-agent.env}
IMAGE=${OTP_IMAGE:-opentripplanner/opentripplanner:2.10.0}
STAGE="$ROOT/stage"; LIVE="$ROOT/graph"
mkdir -p "$STAGE" "$LIVE"
# router-config.json stays out of the build: it names MTA_BUSTIME_KEY, which the build never gets.
cp "$APP"/deploy/otp/{build-config.json,otp-config.json} "$STAGE"/
rm -f "$STAGE/router-config.json"
S3=https://rrgtfsfeeds.s3.amazonaws.com
fetch() { curl -fsSL --retry 3 -o "$STAGE/$2.tmp" "$1" && mv "$STAGE/$2.tmp" "$STAGE/$2"; }
fetch https://download.bbbike.org/osm/bbbike/NewYork/NewYork.osm.pbf nyc.osm.pbf
for f in gtfs_subway gtfs_bx gtfs_b gtfs_m gtfs_q gtfs_si gtfs_busco gtfslirr gtfsmnr; do fetch "$S3/$f.zip" "$f.zip"; done
fetch https://nycferry.connexionz.net/rtt/public/utility/gtfs.aspx gtfs_ferry.zip
fetch https://data.cityofnewyork.us/download/b57i-ri22/application/x-zip-compressed gtfs_siferry.zip  # NYC DOT feed via NYC Open Data (flat zip; nyc.gov copy is nested and blocks curl)
rm -f "$STAGE/graph.obj"
docker run --rm --name nyc-map-otp-build -m 14g -e JAVA_TOOL_OPTIONS=-Xmx12g \
  -v "$STAGE":/var/opentripplanner "$IMAGE" --build --save
cp "$STAGE"/{otp-config.json,build-config.json} "$LIVE"/ && cp "$APP"/deploy/otp/router-config.json "$LIVE"/
mv "$STAGE/graph.obj" "$LIVE/graph.obj.new" && mv "$LIVE/graph.obj.new" "$LIVE/graph.obj"
(umask 077; grep '^MTA_BUSTIME_KEY=' "$ENV_FILE" > "$ROOT/otp.env" || : > "$ROOT/otp.env")
docker restart nyc-map-otp >/dev/null 2>&1 || echo "otp container not running yet; start it with compose"
echo "graph rebuilt $(date -Is)"
