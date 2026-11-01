# TASK-NMA-0010 — Transfer Bus Label

<!-- continuity:task {"acceptance":["a ring marker on the end station of a suspension","the label reads Transfer to the <bus> bus at <station>","unit test of the label text passes"],"depends_on":[],"goal":"The map names the station where a shuttle bus takes over and marks it.","id":"NMA-0010","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/19","next_action":"after #649 deploys, check the A-line T426 view on the live site","owner":"claude-code","priority":"P3","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"The shuttle label floated with no marker or station name (#647)."} -->

- Status: active
- Owner: claude-code
- Priority: P3
- Depends on: none

## Goal

The map names the station where a shuttle bus takes over and marks it.

## Why

The shuttle label floated with no marker or station name (#647).

## Allowed files

- `src/features/transit/alertFocus.ts`, `TransitLayer.tsx`, `alertFocus.test.ts`, `e2e/responsive.spec.ts`, `checkpoints/`, this file.

## Human outcome

The map says where to change from the train to the bus.

## Scope and boundaries

- In scope: the marker and wording at suspension end stations.
- Out of scope: bus stops at street corners, the chat's shuttle pins.
- Dependencies/uncertainty: not checked visually before deploy.

## Acceptance criteria

- [ ] Marker and label on the end station.
- [ ] Label text unit-tested.
- [ ] Checked on the live site.

## Evidence and sources

`npx vitest run src/features/transit/alertFocus.test.ts`: 11 passed; tsc and eslint clean. PR #649.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none): #647, no parent.
- Primary writer / branch / source issue revision / as-of status:
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-01 17:44:38 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["src/features/transit/alertFocus.ts, TransitLayer.tsx, alertFocus.test.ts, e2e/responsive.spec.ts"],"completed":["Marked the shuttle-bus end station and worded the label Transfer to the T426 bus at the station; rebased onto #644; opened #649 with auto-merge"],"decisions":["no new decisions"],"evidence":["vitest src/features/transit: 144 passed; tsc and eslint clean; not yet checked visually"],"evidence_class":"observed","next_action":"after #649 deploys, check the A-line T426 view on the live site","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0010","timestamp":"2026-11-01T17:44:38Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"70454df63ebb5e8b1d397fee59af63a00bd86b2cccf06a71a4352eb4ae3e84c4","request_id":"44e9c544155b402e870602edca91aefb","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0010"} -->

Completed:
- Marked the shuttle-bus end station and worded the label Transfer to the T426 bus at the station; rebased onto #644; opened #649 with auto-merge

Evidence:
- vitest src/features/transit: 144 passed; tsc and eslint clean; not yet checked visually

Decisions:
- no new decisions

Changed:
- src/features/transit/alertFocus.ts, TransitLayer.tsx, alertFocus.test.ts, e2e/responsive.spec.ts

Blocked/uncertain:
- none

Next:
- after #649 deploys, check the A-line T426 view on the live site

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
