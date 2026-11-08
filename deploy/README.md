# Deploying nyc-map-agent

The app runs on the VPS (`ssh vps`, user `ubuntu`) since 2026-10-31. It used to run on
gravebuster, which has been offline since then; that setup is kept at the end of this file
in case it comes back.

## The VPS

| Container | Role |
| --- | --- |
| `nyc-map-web` | the app (Vite build + Hono), on `127.0.0.1:18088` only |
| `nyc-map-otp` | OpenTripPlanner, the trip planner (subway, buses, LIRR, Metro-North, ferries); sleeps when idle |
| `nyc-map-valhalla` | Valhalla, the walking router; sleeps when idle |
| `nyc-map-motis` | MOTIS, the old trip planner, kept until 2026-11-08 in case OTP has to be switched off |
| `nyc-map-lfm3-bridge` | re-offers the LFM3 tunnel port to containers on the Docker gateway |

Chat uses LFM3, which runs on the MacBook Pro. The Pro keeps an SSH reverse tunnel open to the
VPS's `127.0.0.1:18099` (launchd job `com.pukujan.lfm3-tunnel`). If the Pro sleeps or the tunnel
drops, chat stops answering while maps and trips keep working.

The checkout is `~/apps/nyc-map-agent` and the env file is `~/apps/nyc-map-agent.env`. Router data
lives beside them in `~/apps/nyc-map-otp`, `~/apps/nyc-map-valhalla` and `~/apps/nyc-map-motis`. Everything is in `deploy/docker-compose.vps.yml`.

The env file's `OCTO_WORKSPACE_ID` must be the **nyc-neighbourhood** workspace (`ce74d86f…`), with
an `OCTO_API_KEY` bound to it. Until 2026-11-01 it named another project's workspace, so neighbourhood
areas, segment times and block tiles failed with "relation does not exist" or 404 (#614).

### Voice (speech-to-text)

The mic in Brave, Firefox and on phones records a turn in the browser, converts it to a 16 kHz WAV and posts it to `/api/stt`. The server sends it to the shared speech gateway on the VPS (Komodo stack `speech-gateway`, from the `voice-agent-research` repository), which listens on the Docker gateway at port 18800 and passes each request to a speech server with room: Whisper large-v3-turbo on the Windows PC first, then the copilot speech server on the Pro. Spoken answers (`/api/tts`) and the voice keeper's `/load` use the same address. Every request carries `X-Speech-Project: nyc-map` (`STT_PROJECT`), and no call id, since each turn is one request. The env file sets:

```
STT_BASE_URL=http://host.docker.internal:18800
STT_PROTOCOL=speech
STT_STACK=multilingual
```

Nothing goes to an outside service. Which machine takes a language, and what happens when every machine is full, is decided in the gateway's `demo/live-site/speech/gateway/routes.toml` in `voice-agent-research` (its `docs/speech-gateway.md`), not here. For `nyc-map` a full gateway answers 503 at once and the mic says voice is unavailable while typing keeps working; there is no cloud speech fallback. Check it from the VPS with `curl -s http://127.0.0.1:18800/health`, and `curl -s http://127.0.0.1:18800/routes` for the live routes.

### Public route

Cloudflare tunnel A (the `octo-cloudflared` container) reaches the app as
`http://nyc-map-web:8080` over the `study-os_edge` network, which `nyc-map-web` joins. The tunnel's
rule for `nyc.design-bakery.com` and the name's DNS record (a proxied CNAME to tunnel A) both live
in Cloudflare, not in this repository. Check the app publicly, or from the VPS if the public name fails:

```bash
curl -s https://nyc.design-bakery.com/healthz
curl -s http://127.0.0.1:18088/healthz
```

### How it gets deployed

Services on the VPS deploy from GitHub through Komodo, never from a hand-pulled branch. The plan
for what runs where is `vps/PLAN.md` in Pukujan-lab/server-management, and this app's Komodo stack
and its `nyc-map-agent-deploy-on-push` action are in that repository's
`komodo/resources/stacks-vps.toml` (Pukujan-lab/server-management#69).

Every 5 minutes the action compares GitHub's main with the image `nyc-map-web` runs. When they
differ it deploys the stack, whose pre-deploy is `deploy/vps/autodeploy.sh`:

1. Fetch `origin/main` and check it out (detached) in `~/apps/nyc-map-agent`.
2. Build `nyc-map-agent:<12-character commit>` and swap `nyc-map-web` to it.
3. Wait up to 150 seconds for the container's health check.
4. On success, write the tag to `deploy/.env`, which compose reads by itself, so Komodo's own
   `compose up` changes nothing. On failure, put the previous image back, record the commit in
   `deploy/.deploy-failed` so it is not rebuilt every 5 minutes, and fail the Komodo run (which
   alerts). Delete that file to retry the same commit.

To see what is running:

```bash
docker ps --filter name=nyc-map --format '{{.Names}} {{.Image}} {{.Status}}'
git -C ~/apps/nyc-map-agent log -1 --oneline
```

Earlier images stay tagged, so `docker image ls nyc-map-agent` lists the ones a rollback could use.
To roll back, revert the change on main; the action deploys the revert.

### Trip planner and walking data

Run both rebuilds weekly from the checkout on the VPS; nothing schedules them yet. Each one restarts
its own container when it finishes. A restart starts a sleeping container too, and it goes back to
sleep 10 minutes later (see below).

`deploy/otp/build-graph.sh` downloads the OSM extract and the MTA, LIRR, Metro-North and ferry GTFS
feeds into `~/apps/nyc-map-otp/stage` and builds the OTP graph. On 2026-11-01 that took 4 minutes
and the graph was 440 MB. The build gets no secrets. The script then writes `~/apps/nyc-map-otp/otp.env`
with just `MTA_BUSTIME_KEY` from the app's env file, because the running server needs it for live bus
times. OTP starts in under a minute and used 2.8 GB of memory on its first run (its limit is 9 GB).

`deploy/valhalla/build.sh` downloads the same OSM extract and builds Valhalla's tiles in a one-shot
container. The serving container only reads them. The server's walking routes use Valhalla when
`VALHALLA_URL` is set and fall back to the public OSRM foot server when Valhalla fails.

The OSM extract covers the five boroughs and a little around them, so a trip that starts or ends
on Long Island past the city line found no route in the 2026-11-01 test (Penn Station to
Hicksville, with both OTP and MOTIS). The extract's edge is the likely cause; a bigger one should fix it.

To go back to MOTIS for trips, set `TRIP_PLANNER=motis` on the `web` service and redeploy.
`deploy/motis/build.sh` still builds its data (about a minute and 4 GB of memory).

### Sleeping when idle

OTP holds about 3.7 GB and Valhalla about 0.9 GB, but trips come a few times a day. So both stop
after 10 minutes with no trip or walk request, and start again on the next one (#44). The VPS's one
Sablier stops and starts them. It is defined in server-management's `komodo/resources/platform.toml`,
which also sets the 10 minutes. The app asks it at three moments (`server/features/agent/sablier.ts`):

- When the page opens, it sends `GET /api/v1/agent/warm` once. The server passes at most one wake a
  minute to Sablier, and an open tab sends nothing more.
- At the start of each question, without waiting, because a question often leads to a trip.
- Before each trip or walk search, waiting until the container's health check passes: up to 75
  seconds for OTP, which has to load its graph, and 20 for Valhalla. If it is still not ready, the
  search goes ahead and the usual fallback answers (the built-in router for trips, public OSRM for
  walks).

Health checks never go through Sablier, so they keep nothing awake. Without `SABLIER_URL` (local
dev, tests, e2e) the app calls nothing and searches go straight out.

To check it: `docker ps -a --filter label=sablier.group=nyc-map` lists both as `Exited (0)` while
they sleep, and `docker logs sablier 2>&1 | grep nyc-map` shows each start and stop. To keep them
on, remove their `sablier.*` labels and redeploy; Sablier never stops a container without the label.

### CI

The `deploy` job in `.github/workflows/ci.yml` still runs the production migrations on every
merge to main. Its trigger and wait steps call the deploy API at the URL in the repository
variable `NYC_DEPLOY_URL` (on gravebuster that was `https://nyc.design-bakery.com/deploy`) and are
skipped while that variable is unset, which it is for the VPS.
The `contract` job checks the public site named by `NYC_PUBLIC_URL` (such as
`https://nyc.design-bakery.com`) and is skipped the same way.
Komodo deploys the app now, so `NYC_DEPLOY_URL` stays unset. `NYC_PUBLIC_URL` is `https://nyc.design-bakery.com` since 2026-11-01. The contract job runs right after CI's deploy job, before Komodo's next 5-minute check, so it tests the build that was live just before the merge.

## Previous host: gravebuster (offline since 2026-10-31)

### What runs

| Container | Role |
| --- | --- |
| `nyc-map-web` | the app (Vite build + Hono) on 8080 |
| `nyc-map-cd` | deploy API on 8081; mounts docker.sock and the checkout |
| `nyc-map-edge` | Caddy: `/deploy/api/*` → cd, `/deploy*` → dashboard, else → web |

Public hostname `nyc.design-bakery.com` is routed by the Cloudflare tunnel
(`study-os-cloudflared-1`) to `http://nyc-map-edge:80` over `study-os_edge`.

### Bootstrap (once)

```bash
sudo mkdir -p /srv/nyc-map-agent/state
sudo chown -R yoav:yoav /srv/nyc-map-agent
git clone https://github.com/Pukujan-lab/nyc-map-agent /srv/nyc-map-agent/app
cp /srv/nyc-map-agent/app/deploy/.env.example /srv/nyc-map-agent/.env
# fill in the values, then:
chmod 600 /srv/nyc-map-agent/.env
# The compose client reads env_file on the host, where /work does not exist.
export CD_HOST_ENV_FILE=/srv/nyc-map-agent/.env
cd /srv/nyc-map-agent
docker compose -f app/deploy/docker-compose.yml -f app/deploy/docker-compose.edge.yml up -d --build
curl -s https://nyc.design-bakery.com/healthz
```

`CD_HOST_ENV_FILE` is only needed for commands run on the host; inside
`nyc-map-cd` the default `/work/.env` is correct and is what the deploy pipeline
uses. Export it in the shell profile or prefix every host-side `docker compose`
invocation with it.

Generate the secrets:

```bash
openssl rand -hex 32   # CD_SESSION_SECRET
openssl rand -hex 32   # CD_DEPLOY_TOKEN  (also the GitHub secret NYC_DEPLOY_TOKEN)
```

### CI runner

The repository's workflows run on a self-hosted runner on this host, because
the account's hosted-minutes budget rejects every `ubuntu-latest` job. It lives
at `~/actions-runner`, labels `self-hosted, linux, x64, gravebuster`, and is a
systemd unit so it survives reboots:

```bash
systemctl status actions.runner.Pukujan-nyc-map-agent.gravebuster.service
```

The runner's user needs the `docker` group and passwordless sudo (the e2e job
runs `playwright install --with-deps`). To re-register after a rebuild:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -fsSL -o runner.tar.gz https://github.com/actions/runner/releases/download/v2.338.0/actions-runner-linux-x64-2.338.0.tar.gz
tar xzf runner.tar.gz && rm runner.tar.gz
./config.sh --unattended --replace --url https://github.com/Pukujan-lab/nyc-map-agent \
  --token "$(gh api -X POST repos/Pukujan-lab/nyc-map-agent/actions/runners/registration-token --jq .token)" \
  --name gravebuster --labels self-hosted,linux,x64,gravebuster --work _work
sudo ./svc.sh install yoav && sudo ./svc.sh start
```

### Manual operations

| Task | Command |
| --- | --- |
| Redeploy the CD container after changing it | `CD_HOST_ENV_FILE=/srv/nyc-map-agent/.env docker compose -f app/deploy/docker-compose.yml up -d --build cd edge` (run from `/srv/nyc-map-agent`) |
| Read deploy history | `tail -n 20 /srv/nyc-map-agent/state/deploys.jsonl` |
| Force a deploy | `curl -X POST -H "Authorization: Bearer $CD_DEPLOY_TOKEN" https://nyc.design-bakery.com/deploy/api/deploy` |
| Roll back | press **Roll back** in the dashboard |
| Clear a stuck lock | `rm -f /srv/nyc-map-agent/state/deploy.lock` (only when no deploy is running; the lock is a file, not a directory) |

### Failure modes

- **Build fails:** the old image keeps serving; the run is `failed` with the build log.
- **Health fails:** the previous image is swapped back automatically.
- **CD container restarts mid-run:** the run is marked `interrupted` on the next start.
- **Tunnel 502:** the `nyc-map-edge` container is down; check `docker logs nyc-map-edge`.
