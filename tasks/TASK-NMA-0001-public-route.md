# TASK-NMA-0001 — Make the VPS app public

<!-- continuity:task {"acceptance":["https://nyc.design-bakery.com/healthz answers 200","repository variable NYC_PUBLIC_URL is set and CI's contract job runs"],"depends_on":[],"goal":"Riders reach the VPS app at nyc.design-bakery.com, and CI's contract check runs against it.","id":"NMA-0001","issue_url":"https://github.com/Pukujan-lab/nyc-map-agent/issues/614","next_action":"owner adds nyc.design-bakery.com on Cloudflare tunnel A pointing at http://nyc-map-web:8080","owner":"claude-code","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Komodo deploys main to the VPS now, but the name answers 530 because tunnel A has no route to the app."} -->

- Status: active
- Owner: claude-code
- Priority: P1
- Depends on: none

## Goal

Riders reach the VPS app at nyc.design-bakery.com, and CI's contract check runs against it.

## Why

Komodo deploys main to the VPS now, but the name answers 530 because tunnel A has no route to the app.

## Allowed files

- `checkpoints/CURRENT.md`, `checkpoints/history/2026-11.md`, `deploy/README.md`, this task file. The route itself is a Cloudflare dashboard change, and the variable is a repository setting.

## Human outcome

Riders open nyc.design-bakery.com and get the app that main just deployed.

## Scope and boundaries

- In scope: the tunnel A hostname, the `NYC_PUBLIC_URL` variable, the checkpoint.
- Out of scope: the deploy path, which works (#613, Pukujan-lab/server-management#69).
- Dependencies/uncertainty: the hostname is the owner's dashboard step.

## Acceptance criteria

- [ ] `curl -s -o /dev/null -w '%{http_code}' https://nyc.design-bakery.com/healthz` prints 200.
- [ ] `NYC_PUBLIC_URL` is `https://nyc.design-bakery.com`, and CI's contract job runs on the next merge.

## Evidence and sources

On 2026-11-01 Komodo deployed `nyc-map-agent:0cb74693be46`. It is healthy, and a container on `study-os_edge` reached `http://nyc-map-web:8080/healthz` with a 200. The public name answers 530.

## Reproduction details (only when needed)

Not needed.

## Related records

- Owning issue: #614; related #611 and Pukujan-lab/server-management#69.
- Writer: claude-code on `docs/614-checkpoint-live-deploy`, as of 2026-11-01.
- Pull request: #615.

## Checkpoint log

No checkpoints yet.

### 2026-11-01 02:16:21 UTC — claude-code (Claude Opus 5.5)

<!-- continuity:checkpoint {"agent":"claude-code (Claude Opus 5.5)","blocked":["owner adds nyc.design-bakery.com on Cloudflare tunnel A (#614)"],"changed":["checkpoints/CURRENT.md, checkpoints/history/2026-11.md, tasks/TASK-NMA-0001-public-route.md"],"completed":["Komodo deploys main to the VPS; first deploy 0cb74693be46 is healthy and on tunnel A's network"],"decisions":["no new decisions"],"evidence":["Komodo action logged 'deployed'; nyc-map-web healthy; /healthz 200 on 127.0.0.1:18088 and from study-os_edge"],"evidence_class":"observed","next_action":"After the route exists, set NYC_PUBLIC_URL and close #614","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0001","timestamp":"2026-11-01T02:16:21Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"3f06f72e841fbc5fb85341a8e69f4274948e86951258a5fd46e13ae5db2efa3b","request_id":"b773b6081cca4c0c82a249a95f2367d0","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0001"} -->

Completed:
- Komodo deploys main to the VPS; first deploy 0cb74693be46 is healthy and on tunnel A's network

Evidence:
- Komodo action logged 'deployed'; nyc-map-web healthy; /healthz 200 on 127.0.0.1:18088 and from study-os_edge

Decisions:
- no new decisions

Changed:
- checkpoints/CURRENT.md, checkpoints/history/2026-11.md, tasks/TASK-NMA-0001-public-route.md

Blocked/uncertain:
- owner adds nyc.design-bakery.com on Cloudflare tunnel A (#614)

Next:
- After the route exists, set NYC_PUBLIC_URL and close #614

### 2026-11-01 02:30:41 UTC — claude-code (Claude Opus 5.5)

<!-- continuity:checkpoint {"agent":"claude-code (Claude Opus 5.5)","blocked":["#618 ferry endpoint"],"changed":["checkpoints/CURRENT.md, deploy/README.md; Cloudflare tunnel A ingress and the nyc DNS record"],"completed":["nyc.design-bakery.com routes through tunnel A to nyc-map-web; DNS no longer points at the gravebuster tunnel"],"decisions":["NYC_PUBLIC_URL stays unset: CI's contract check fails on /api/v1/ferry (502, no OTP on the VPS, #618)"],"evidence":["public /healthz 200 and home page 200; acs, octodb, umami, voidfeed still 200; tunnel logged config version 5"],"evidence_class":"observed","next_action":"Fix #618, then set NYC_PUBLIC_URL and finish #614","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0001","timestamp":"2026-11-01T02:30:41Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"53c607da5af4a75df433a6f561d26662b83ac5150e8d23a0594f94ded5b5676d","request_id":"220788b3c9634d04a6143d188d13c638","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0001"} -->

Completed:
- nyc.design-bakery.com routes through tunnel A to nyc-map-web; DNS no longer points at the gravebuster tunnel

Evidence:
- public /healthz 200 and home page 200; acs, octodb, umami, voidfeed still 200; tunnel logged config version 5

Decisions:
- NYC_PUBLIC_URL stays unset: CI's contract check fails on /api/v1/ferry (502, no OTP on the VPS, #618)

Changed:
- checkpoints/CURRENT.md, deploy/README.md; Cloudflare tunnel A ingress and the nyc DNS record

Blocked/uncertain:
- #618 ferry endpoint

Next:
- Fix #618, then set NYC_PUBLIC_URL and finish #614

### 2026-11-01 02:54:02 UTC — claude-code (Claude Opus 5.5)

<!-- continuity:checkpoint {"agent":"claude-code (Claude Opus 5.5)","blocked":[],"changed":["deploy/README.md, checkpoints; VPS env file (backed up); Octo key 785a4cad; repo variable NYC_PUBLIC_URL"],"completed":["VPS app reads the nyc-neighbourhood Octo workspace with a key bound to it; NYC_PUBLIC_URL is set"],"decisions":["Kept the legal-graph-rag key unrevoked; it may serve other projects"],"evidence":["areas, transit-segments, block-tiles and ferry answer 200 publicly; site reload makes no failing API calls; contract check: 50 test cases, no issues"],"evidence_class":"observed","next_action":"Watch the next main run's contract job","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0001","timestamp":"2026-11-01T02:54:02Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"bf4f96650f99db9c2dff1b67b7aafff16de8bb11ed03b943e76ede7424852e78","request_id":"4c35abb491464a9d89912ae00b840acc","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0001"} -->

Completed:
- VPS app reads the nyc-neighbourhood Octo workspace with a key bound to it; NYC_PUBLIC_URL is set

Evidence:
- areas, transit-segments, block-tiles and ferry answer 200 publicly; site reload makes no failing API calls; contract check: 50 test cases, no issues

Decisions:
- Kept the legal-graph-rag key unrevoked; it may serve other projects

Changed:
- deploy/README.md, checkpoints; VPS env file (backed up); Octo key 785a4cad; repo variable NYC_PUBLIC_URL

Blocked/uncertain:
- none

Next:
- Watch the next main run's contract job

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
