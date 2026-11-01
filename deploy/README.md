# Deploying nyc-map-agent

The app runs on the VPS (`ssh vps`, user `ubuntu`) since 2026-10-31. It used to run on
gravebuster, which has been offline since then; that setup is kept at the end of this file
in case it comes back.

## The VPS

| Container | Role |
| --- | --- |
| `nyc-map-web` | the app (Vite build + Hono), on `127.0.0.1:18088` only |
| `nyc-map-motis` | MOTIS, the trip planner (`TRIP_PLANNER=motis`) |
| `nyc-map-lfm3-bridge` | re-offers the LFM3 tunnel port to containers on the Docker gateway |

Chat uses LFM3, which runs on the MacBook Pro. The Pro keeps an SSH reverse tunnel open to the
VPS's `127.0.0.1:18099` (launchd job `com.pukujan.lfm3-tunnel`). If the Pro sleeps or the tunnel
drops, chat stops answering while maps and trips keep working.

The checkout is `~/apps/nyc-map-agent`, the env file is `~/apps/nyc-map-agent.env`, and the MOTIS
data lives in `~/apps/nyc-map-motis`. Everything is in `deploy/docker-compose.vps.yml`.

### Public route

Cloudflare tunnel A (the `octo-cloudflared` container) reaches the app as
`http://nyc-map-web:8080` over the `study-os_edge` network, which `nyc-map-web` joins. The public
hostname `nyc.design-bakery.com` needs that route added on tunnel A in the Cloudflare dashboard;
until then it answers 530 and the app can be checked only from the VPS:

```bash
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

### Trip planner data

`deploy/motis/build.sh` downloads the OSM extract and the MTA, LIRR, Metro-North and ferry GTFS
feeds into `~/apps/nyc-map-motis` and builds the MOTIS dataset. It takes about a minute and 4 GB
of memory. Rebuild weekly, then `docker restart nyc-map-motis`.

### CI

The `deploy` job in `.github/workflows/ci.yml` still runs the production migrations on every
merge to main. Its trigger and wait steps call the deploy API at the URL in the repository
variable `NYC_DEPLOY_URL` (on gravebuster that was `https://nyc.design-bakery.com/deploy`) and are
skipped while that variable is unset, which it is for the VPS.
The `contract` job checks the public site named by `NYC_PUBLIC_URL` (such as
`https://nyc.design-bakery.com`) and is skipped the same way.
Komodo deploys the app now, so `NYC_DEPLOY_URL` stays unset; set `NYC_PUBLIC_URL` once the public route works.

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
