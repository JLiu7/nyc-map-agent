#!/usr/bin/env bash
# Build the MOTIS NYC dataset: OSM + the same GTFS feeds OTP uses (deploy/otp/build-graph.sh).
# The dataset tags are OTP's feed ids in lower case; server/features/agent/motis.ts maps them back.
# Takes under a minute and about 4 GB of memory; then `docker restart nyc-map-motis`. See deploy/README.md.
set -euo pipefail
ROOT=${MOTIS_ROOT:-$HOME/apps/nyc-map-motis}; VER=${MOTIS_VERSION:-v2.11.3}
mkdir -p "$ROOT"; cd "$ROOT"; mkdir -p in
if [ ! -x bin/motis ]; then
  mkdir -p bin && curl -fsSL "https://github.com/motis-project/motis/releases/download/$VER/motis-linux-amd64.tar.bz2" | python3 -c "import bz2,sys; sys.stdout.buffer.write(bz2.decompress(sys.stdin.buffer.read()))" | tar x -C bin
fi
fetch() { curl -fsSL --retry 3 -o "in/$2.tmp" "$1" && mv "in/$2.tmp" "in/$2"; }
fetch https://download.bbbike.org/osm/bbbike/NewYork/NewYork.osm.pbf nyc.osm.pbf
S3=https://rrgtfsfeeds.s3.amazonaws.com
for f in gtfs_subway gtfs_bx gtfs_b gtfs_m gtfs_q gtfs_si gtfs_busco gtfslirr gtfsmnr; do fetch "$S3/$f.zip" "$f.zip"; done
fetch https://nycferry.connexionz.net/rtt/public/utility/gtfs.aspx gtfs_ferry.zip
fetch https://data.cityofnewyork.us/download/b57i-ri22/application/x-zip-compressed gtfs_siferry.zip
cat > config.yml <<YML
server:
  port: 8080
osm: in/nyc.osm.pbf
street_routing: true
osr_footpath: true
geocoding: false
timetable:
  first_day: TODAY
  num_days: 30
  railviz: false
  with_shapes: true
  datasets:
$(for f in subway:gtfs_subway bx:gtfs_bx b:gtfs_b m:gtfs_m q:gtfs_q si:gtfs_si busco:gtfs_busco lirr:gtfslirr mnr:gtfsmnr ferry:gtfs_ferry siferry:gtfs_siferry; do echo "    ${f%%:*}:"; echo "      path: in/${f#*:}.zip"; done)
YML
/usr/bin/time -v bin/motis import 2> import.time
grep -E "Maximum resident|Elapsed" import.time
echo "motis data rebuilt $(date -Is)"
