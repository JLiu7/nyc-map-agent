# TASK-NMA-0008 — Subway Max Hold

<!-- continuity:task {"acceptance":["a vehicle report holds a train at a station for at most 60 s after its timestamp unless the line is in trouble","unit tests cover fresh, stale, troubled and timetable-held cases","the parked share on the live feed falls toward the timetable model's 12%"],"depends_on":[],"goal":"Subway trains on the map stop for about 30 seconds to a minute, not until the next vehicle report.","id":"NMA-0008","issue_url":"https://github.com/Pukujan-lab/nyc-map-agent/issues/643","next_action":"after #644 deploys, re-measure the parked share on the live feed","owner":"claude-code","priority":"P2","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"The vehicle report pinned trains in stations with no time limit, so 34% were drawn parked (#643)."} -->

- Status: active
- Owner: claude-code
- Priority: P2
- Depends on: none

## Goal

Subway trains on the map stop for about 30 seconds to a minute, not until the next vehicle report.

## Why

The vehicle report pinned trains in stations with no time limit, so 34% were drawn parked (#643).

## Allowed files

- `src/features/transit/model.ts`, `TransitLayer.tsx`, `maxHold.test.ts`, `e2e/responsive.spec.ts`, `checkpoints/`, this file.

## Human outcome

Trains on the map move like real trains.

## Scope and boundaries

- In scope: the pin rule in estimateTrain.
- Out of scope: default dwell lengths, buses, the held-train detector.
- Dependencies/uncertainty: one live-feed sample was measured.

## Acceptance criteria

- [ ] 60 s cap with a trouble exception.
- [ ] Tests pass.
- [ ] Parked share re-measured after deploy.

## Evidence and sources

Live feed sample of 480 trips on 2026-11-01: 12% parked by the timetable model, 22% more pinned by the vehicle report, 34% in all. `npx vitest run src/features/transit`: 142 passed; tsc and eslint clean.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none): #643, no parent.
- Primary writer / branch / source issue revision / as-of status:
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-01 17:34:47 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["src/features/transit/model.ts, TransitLayer.tsx, maxHold.test.ts, e2e/responsive.spec.ts"],"completed":["Capped the vehicle-report pin at 60 s unless the line is in trouble; opened #644 with auto-merge"],"decisions":["no new decisions"],"evidence":["vitest src/features/transit: 142 passed; tsc and eslint clean; live sample: 34% parked before, 12% by timetable alone"],"evidence_class":"observed","next_action":"after #644 deploys, re-measure the parked share on the live feed","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0008","timestamp":"2026-11-01T17:34:47Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"8c0507f824fc2bdf1abc9a3191375373f4080d53d8f3948671241132ee9aa61f","request_id":"c39a1dabd8d942af8935d9c421431830","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0008"} -->

Completed:
- Capped the vehicle-report pin at 60 s unless the line is in trouble; opened #644 with auto-merge

Evidence:
- vitest src/features/transit: 142 passed; tsc and eslint clean; live sample: 34% parked before, 12% by timetable alone

Decisions:
- no new decisions

Changed:
- src/features/transit/model.ts, TransitLayer.tsx, maxHold.test.ts, e2e/responsive.spec.ts

Blocked/uncertain:
- none

Next:
- after #644 deploys, re-measure the parked share on the live feed

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
