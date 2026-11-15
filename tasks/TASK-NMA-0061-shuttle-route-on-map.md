# TASK-NMA-0061 — Shuttle Route On Map

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"An open shuttle bus notice shows the bus's line, its stops and where to change on the map","id":"NMA-0061","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/204","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Owner, 2026-11-14: it did not show the shuttle bus route"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

An open shuttle bus notice shows the bus's line, its stops and where to change on the map

## Why

Owner, 2026-11-14: it did not show the shuttle bus route

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

### 2026-11-15 03:21:21 UTC — agent:claude-code/abf81021-c394-4e17-a76d-dd9aafb3f1e3

<!-- continuity:checkpoint {"agent":"agent:claude-code/abf81021-c394-4e17-a76d-dd9aafb3f1e3","blocked":[],"changed":["src/features/transit/alertFocus.ts, alertDiagram.ts, NoticeDiagram.tsx, TransitLayer.tsx, LinePanel.tsx, e2e/line-notices.spec.ts, .size-limit.json"],"completed":["An open shuttle bus notice showed no bus on the map; it now draws the bus's line, a dot with the corners at each stop, and Change here at the station that still has trains"],"decisions":["no new decisions"],"evidence":["The transit unit tests pass (171, 3 new), the type check and lint pass, and the line notice browser tests pass on the MacBook Pro (20 cases); main is merged in after its API check failed against a newer main"],"next_action":"After the pull request for #204 deploys, open the A line's Lefferts Blvd shuttle notice on the live site","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0061","timestamp":"2026-11-15T03:21:21Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"0dd7cbd27225dc23fdbc9662a940c23b9f5560d4c8e92da43f212def34190820","request_id":"b8892fc4b8b44c8cac87e3a8453e0fa1","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0061"} -->

Completed:
- An open shuttle bus notice showed no bus on the map; it now draws the bus's line, a dot with the corners at each stop, and Change here at the station that still has trains

Evidence:
- The transit unit tests pass (171, 3 new), the type check and lint pass, and the line notice browser tests pass on the MacBook Pro (20 cases); main is merged in after its API check failed against a newer main

Decisions:
- no new decisions

Changed:
- src/features/transit/alertFocus.ts, alertDiagram.ts, NoticeDiagram.tsx, TransitLayer.tsx, LinePanel.tsx, e2e/line-notices.spec.ts, .size-limit.json

Blocked/uncertain:
- none

Next:
- After the pull request for #204 deploys, open the A line's Lefferts Blvd shuttle notice on the live site

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
