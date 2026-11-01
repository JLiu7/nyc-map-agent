# TASK-NMA-0012 — Otp Valhalla

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"Plan trips with OTP and walks with Valhalla on the VPS","id":"NMA-0012","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/24","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"claude-code","priority":"high","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Owner chose OTP for step-free and LIRR trips, and a self-hosted walking router"} -->

- Status: active
- Owner: claude-code
- Priority: high
- Depends on: none

## Goal

Plan trips with OTP and walks with Valhalla on the VPS

## Why

Owner chose OTP for step-free and LIRR trips, and a self-hosted walking router

## Allowed files

- define bounded paths before implementation.

## Human outcome

Describe what becomes easier, safer, clearer, or possible when this task is complete.

## Scope and boundaries

- In scope:
- Out of scope:
- Dependencies/uncertainty:

## Acceptance criteria

- [ ] state observable, task-specific outcomes.

## Evidence and sources

Link repository state at a revision and cite external factual claims directly. Record commands and results for claims that need verification.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none):
- Primary writer / branch / source issue revision / as-of status:
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-01 18:13:39 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["deploy/docker-compose.vps.yml, deploy/otp/build-graph.sh, deploy/valhalla/build.sh, server/features/agent/valhalla.ts, services.ts, polyline.ts, deploy/README.md"],"completed":["Trips on the VPS were planned by MOTIS and walks by a public OSRM server; OTP graph and Valhalla tiles are now built on the VPS, and the compose file and app switch to them, with MOTIS kept until 2026-11-08 as a fallback"],"decisions":["no new decisions"],"evidence":["440 server tests pass; 14-trip comparison on trial containers: OTP had fewer changes in 7 trips and equal in 5, arrived earlier in 4 and 3 to 9 minutes later in 7; docker compose config accepted on the VPS"],"evidence_class":"observed","next_action":"After merge, check nyc-map-otp and nyc-map-valhalla are up and the live chat's trips and walks come from them; then step-free trips (OTP wheelchair plus Valhalla wheelchair profile) and a bigger OSM extract for Long Island","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0012","timestamp":"2026-11-01T18:13:39Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"cc4407b3573cb495a83959b2795102bdb5241f585c19d565a9781410d734769c","request_id":"e4ab3d3e368e4188958ecec3176abd9f","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0012"} -->

Completed:
- Trips on the VPS were planned by MOTIS and walks by a public OSRM server; OTP graph and Valhalla tiles are now built on the VPS, and the compose file and app switch to them, with MOTIS kept until 2026-11-08 as a fallback

Evidence:
- 440 server tests pass; 14-trip comparison on trial containers: OTP had fewer changes in 7 trips and equal in 5, arrived earlier in 4 and 3 to 9 minutes later in 7; docker compose config accepted on the VPS

Decisions:
- no new decisions

Changed:
- deploy/docker-compose.vps.yml, deploy/otp/build-graph.sh, deploy/valhalla/build.sh, server/features/agent/valhalla.ts, services.ts, polyline.ts, deploy/README.md

Blocked/uncertain:
- none

Next:
- After merge, check nyc-map-otp and nyc-map-valhalla are up and the live chat's trips and walks come from them; then step-free trips (OTP wheelchair plus Valhalla wheelchair profile) and a bigger OSM extract for Long Island

### 2026-11-01 18:13:47 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["deploy/docker-compose.vps.yml, deploy/otp/build-graph.sh, deploy/valhalla/build.sh, server/features/agent/valhalla.ts, services.ts, polyline.ts, deploy/README.md"],"completed":["Trips on the VPS were planned by MOTIS and walks by a public OSRM server; OTP graph and Valhalla tiles are now built on the VPS, and the compose file and app switch to them, with MOTIS kept until 2026-11-08 as a fallback"],"decisions":["no new decisions"],"evidence":["440 server tests pass; 14-trip comparison on trial containers: OTP had fewer changes in 7 trips and equal in 5, arrived earlier in 4 and 3 to 9 minutes later in 7; docker compose config accepted on the VPS"],"evidence_class":"observed","next_action":"After merge, check nyc-map-otp and nyc-map-valhalla are up and the live chat's trips and walks come from them; then step-free trips (OTP wheelchair plus Valhalla wheelchair profile) and a bigger OSM extract for Long Island","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0012","timestamp":"2026-11-01T18:13:47Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"cc4407b3573cb495a83959b2795102bdb5241f585c19d565a9781410d734769c","request_id":"66b8c41df91840a1b5109e000593fe7b","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0012"} -->

Completed:
- Trips on the VPS were planned by MOTIS and walks by a public OSRM server; OTP graph and Valhalla tiles are now built on the VPS, and the compose file and app switch to them, with MOTIS kept until 2026-11-08 as a fallback

Evidence:
- 440 server tests pass; 14-trip comparison on trial containers: OTP had fewer changes in 7 trips and equal in 5, arrived earlier in 4 and 3 to 9 minutes later in 7; docker compose config accepted on the VPS

Decisions:
- no new decisions

Changed:
- deploy/docker-compose.vps.yml, deploy/otp/build-graph.sh, deploy/valhalla/build.sh, server/features/agent/valhalla.ts, services.ts, polyline.ts, deploy/README.md

Blocked/uncertain:
- none

Next:
- After merge, check nyc-map-otp and nyc-map-valhalla are up and the live chat's trips and walks come from them; then step-free trips (OTP wheelchair plus Valhalla wheelchair profile) and a bigger OSM extract for Long Island

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
