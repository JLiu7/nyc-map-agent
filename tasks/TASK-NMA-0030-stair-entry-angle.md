# TASK-NMA-0030 — Stair Entry Angle

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"Let street view take you down a stair you walk onto at an angle","id":"NMA-0030","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/69","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Walking up to an entrance usually crossed the stair top and left you on the pavement"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

Let street view take you down a stair you walk onto at an angle

## Why

Walking up to an entrance usually crossed the stair top and left you on the pavement

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

### 2026-11-09 05:53:54 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["src/lib/map/stationWalk.ts walkIn"],"completed":["Stair steps steer along the flight, so street view goes down from an angle"],"decisions":["no new decisions"],"evidence":["Unit tests pass (1724); new stair-angle test fails without the change; station-walk, trip-station and street-xray e2e pass at all sizes"],"next_action":"Merge the pull request when CI passes, then walk into Union Sq on a phone","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0030","timestamp":"2026-11-09T05:53:54Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"4f18fdf81caad6bfb312905991c080785c9edc115764509a253b7b27c96a3fec","request_id":"150dfce58eea43c481de65b8f69b3a3a","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0030"} -->

Completed:
- Stair steps steer along the flight, so street view goes down from an angle

Evidence:
- Unit tests pass (1724); new stair-angle test fails without the change; station-walk, trip-station and street-xray e2e pass at all sizes

Decisions:
- no new decisions

Changed:
- src/lib/map/stationWalk.ts walkIn

Blocked/uncertain:
- none

Next:
- Merge the pull request when CI passes, then walk into Union Sq on a phone

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
