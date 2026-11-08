# TASK-NMA-0025 — Xray Fulton

<!-- continuity:task {"acceptance":["x-ray at 229, 418, A38 and M22 shows the whole complex","levels match the reference, A/C three down","every platform reachable from the street; the build fails otherwise"],"depends_on":[],"goal":"Show the whole Fulton St complex in x-ray from any of its four stations, every platform reachable from the street","id":"NMA-0025","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/56","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"claude-code","priority":"medium","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"OSM filed the A/C platform under the 2/3 station, so the A/C had no x-ray and the complex showed in broken slices"} -->

- Status: active
- Owner: claude-code
- Priority: medium
- Depends on: none

## Goal

Show the whole Fulton St complex in x-ray from any of its four stations, every platform reachable from the street

## Why

OSM filed the A/C platform under the 2/3 station, so the A/C had no x-ray and the complex showed in broken slices

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

### 2026-11-08 04:59:40 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["scripts/xray-overrides.ts, scripts/xray-overrides/fulton.json, scripts/build-xray.ts, public/transit/xray.json"],"completed":["Fulton St x-ray now shows the whole complex from all four stations (2/3, 4/5, A/C, J/Z); the A/C had none before"],"decisions":["no new decisions"],"evidence":["unit tests pass (1657); every Fulton St platform reaches the street within 6 m joins; browser screenshot of the A/C x-ray shows all lines and the level-2 passage"],"next_action":"Open the PR for #56 and arm auto-merge; then do Times Sq, Atlantic Av-Barclays Ctr and Union Sq the same way","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0025","timestamp":"2026-11-08T04:59:40Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"26e834c8b4c483229fe757fd739a7d9ad535cae1c9ecc323f57752d4ede3e6f6","request_id":"3483638df31b4409a7729324b26f1616","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0025"} -->

Completed:
- Fulton St x-ray now shows the whole complex from all four stations (2/3, 4/5, A/C, J/Z); the A/C had none before

Evidence:
- unit tests pass (1657); every Fulton St platform reaches the street within 6 m joins; browser screenshot of the A/C x-ray shows all lines and the level-2 passage

Decisions:
- no new decisions

Changed:
- scripts/xray-overrides.ts, scripts/xray-overrides/fulton.json, scripts/build-xray.ts, public/transit/xray.json

Blocked/uncertain:
- none

Next:
- Open the PR for #56 and arm auto-merge; then do Times Sq, Atlantic Av-Barclays Ctr and Union Sq the same way

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
