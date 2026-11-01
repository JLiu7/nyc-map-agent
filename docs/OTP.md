# OpenTripPlanner (multimodal trip search)

Ask's `transit_plan` tool plans door-to-door trips with a self-hosted
[OpenTripPlanner 2](https://www.opentripplanner.org/) (official image
`opentripplanner/opentripplanner:2.10.0`). The agent asks OTP's GTFS GraphQL
API (`planConnection`) for itineraries, ranks them (earliest arrival, then
fewer transfers, then less walking; latest departure for arrive-by), keeps the
top 3 distinct route sequences and recommends the first. If OTP is unreachable
or returns nothing, the built-in subway router (`server/features/agent/trip.ts`)
answers instead (`trip.planner = "fallback"`).

Code: `server/features/agent/otp.ts` (client, ranking, Trip mapping),
`server/features/agent/plan.ts` (OTP first, fallback second).

The ferry map layer (`/api/v1/ferry`) used to read OTP too. It now reads the two
ferry GTFS feeds and NYC Ferry's vehicle positions itself
(`server/features/ferry/gtfs.ts`), so it works on the VPS, where no OTP runs (#618).

## Service

`otp` in `deploy/docker-compose.yml` (container `nyc-map-otp`):

- Internal compose network only, no published port. The web app reaches it at
  `OTP_URL=http://nyc-map-otp:8080` (GraphQL at `/otp/gtfs/v1`).
- `mem_limit: 9g`, heap `-Xmx7g` (gravebuster has 30 GB RAM). The graph build
  runs in a separate one-shot container with `-m 14g` / `-Xmx12g`.
- CD only swaps `web`; start or recreate OTP by hand:

```sh
cd /srv/nyc-map-agent/app/deploy
export CD_HOST_ENV_FILE=/srv/nyc-map-agent/.env
export NYC_MAP_IMAGE=$(docker inspect -f '{{.Config.Image}}' nyc-map-web)  # never recreate web bare
docker compose -p nyc-map-agent up -d --no-deps otp
```

## Data (graph)

`deploy/otp/build-graph.sh` downloads into `/srv/nyc-map-agent/otp/stage`, builds
`graph.obj`, swaps it into `/srv/nyc-map-agent/otp/graph` and restarts OTP.

| Feed id | Source |
|---|---|
| OSM | BBBike NewYork extract |
| SUBWAY | MTA `gtfs_subway.zip` (includes the Staten Island Railway, route `SIR`) |
| BX, B, M, Q, SI | MTA NYCT bus by borough |
| BUSCO | MTA Bus Company |
| LIRR, MNR | `gtfslirr.zip`, `gtfsmnr.zip` |
| FERRY | NYC Ferry (connexionz) |
| SIFERRY | Staten Island Ferry (NYC DOT GTFS, NYC Open Data b57i-ri22) |

Weekly rebuild: host crontab on gravebuster (host clock is UTC), Sunday 08:10 UTC
(04:10 New York in EDT, 03:10 in EST). A build takes about 5 minutes:

```
10 8 * * 0 /bin/bash /srv/nyc-map-agent/app/deploy/otp/build-graph.sh >> /srv/nyc-map-agent/otp/build.log 2>&1 # nyc-map-otp-weekly
```

(The nightly-ingest workflow runs inside a node container without the host
paths, so the rebuild lives in cron.)

## Realtime updaters (`deploy/otp/router-config.json`)

- Subway trip updates: the 8 keyless NYCT GTFS-rt feeds, every 30 s.
- Bus trip updates: MTA Bus Time GTFS-rt (`gtfsrt.prod.obanyc.com/tripUpdates`), one
  updater per bus feed id, every 60 s. The key is `${MTA_BUSTIME_KEY}`, which OTP
  substitutes from the container environment (the `.env` file); it is never in git.
- LIRR and Metro-North trip updates, every 60 s.
- NYC Ferry trip updates, alerts and vehicle positions (connexionz GTFS-rt), every 30 s / 2 min.
- Service alerts (camsys subway, bus, LIRR, MNR), every 2 min.

Known gaps: the NYCT subway GTFS-rt trip ids do not match the static feed's
trip ids (OTP logs `TRIP_NOT_FOUND`, 0% applied, even with `fuzzyTripMatching`),
and most Metro-North updates do not match either, so those legs use scheduled
times. Bus (Bus Time) and LIRR updates apply. Each bus feed also logs
`TRIP_NOT_FOUND` for the other boroughs' trips in the shared Bus Time feed; that
is expected. Service alerts apply for every feed.

## Checks

```sh
docker exec nyc-map-web node -e "fetch('http://nyc-map-otp:8080/otp/gtfs/v1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'{feeds{feedId}}'})}).then(r=>r.text()).then(console.log)"
docker stats --no-stream nyc-map-otp
```
