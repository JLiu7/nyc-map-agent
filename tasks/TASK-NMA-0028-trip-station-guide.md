# TASK-NMA-0028 — Trip Station Guide

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"Walk the trip preview through the station at eye level, with a line on the floor to the rider's train and the train pulling in","id":"NMA-0028","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/65","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"In x-ray the rider cannot see the walls or tell how to reach the platform, and no train arrives"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

Walk the trip preview through the station at eye level, with a line on the floor to the rider's train and the train pulling in

## Why

In x-ray the rider cannot see the walls or tell how to reach the platform, and no train arrives

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

### 2026-11-09 00:33:25 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["src/lib/map/stationRoute.ts, src/features/agent/stationWalks.ts, usePlayer.ts, stationScene.ts, AgentOverlay.tsx playback bar"],"completed":["Eye-level walk through the station with a guide line to the train and the train pulling in; phone preview bar fixed"],"decisions":["no new decisions"],"evidence":["Unit tests pass (1696); trip-station e2e passes at all four layout sizes; route found at 236 of 246 underground stations"],"next_action":"Merge the pull request when CI passes, then watch a trip preview on a phone","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0028","timestamp":"2026-11-09T00:33:25Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"8dcc517f831ae0c4b6edc9390e4518c1eddc81196788302fd0a1103d2bb64322","request_id":"cdbe91cda0404cf18781a9f37b8d1453","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0028"} -->

Completed:
- Eye-level walk through the station with a guide line to the train and the train pulling in; phone preview bar fixed

Evidence:
- Unit tests pass (1696); trip-station e2e passes at all four layout sizes; route found at 236 of 246 underground stations

Decisions:
- no new decisions

Changed:
- src/lib/map/stationRoute.ts, src/features/agent/stationWalks.ts, usePlayer.ts, stationScene.ts, AgentOverlay.tsx playback bar

Blocked/uncertain:
- none

Next:
- Merge the pull request when CI passes, then watch a trip preview on a phone

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
