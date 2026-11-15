# TASK-NMA-0062 — Notice Named Stations

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"A notice that names its stations is drawn on its stretch of line and walked aloud","id":"NMA-0062","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/206","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Owner, 2026-11-14: not sure if it does the graph walk for train affected"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

A notice that names its stations is drawn on its stretch of line and walked aloud

## Why

Owner, 2026-11-14: not sure if it does the graph walk for train affected

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

### 2026-11-15 04:27:58 UTC — agent:claude-code/abf81021-c394-4e17-a76d-dd9aafb3f1e3

<!-- continuity:checkpoint {"agent":"agent:claude-code/abf81021-c394-4e17-a76d-dd9aafb3f1e3","blocked":[],"changed":["src/features/transit/alertDiagram.ts, alertFocus.ts, NoticeDiagram.tsx, TransitLayer.tsx, e2e/line-notices.spec.ts, .size-limit.json"],"completed":["A notice that names its stations but takes no train away had no diagram or walk; it now draws its stations, tags them, lights them on the first spoken step, and the map marks no skip there"],"decisions":["no new decisions"],"evidence":["On the MacBook Pro the transit unit tests pass (176), the type check, lint and size budgets pass, and the line notice browser tests pass (20 cases); 14 of the 23 undrawn live notices of 2026-11-14 now draw"],"next_action":"After the pull request for #206 deploys, open the 1 line's arrival-times notice on the live site","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0062","timestamp":"2026-11-15T04:27:58Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"4eabb21586a18a7343f0ac6e309cdbe9bebf2ee6955f80619688e952d1e36f2c","request_id":"a0a656706e9e4f09883d95759d6d1610","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0062"} -->

Completed:
- A notice that names its stations but takes no train away had no diagram or walk; it now draws its stations, tags them, lights them on the first spoken step, and the map marks no skip there

Evidence:
- On the MacBook Pro the transit unit tests pass (176), the type check, lint and size budgets pass, and the line notice browser tests pass (20 cases); 14 of the 23 undrawn live notices of 2026-11-14 now draw

Decisions:
- no new decisions

Changed:
- src/features/transit/alertDiagram.ts, alertFocus.ts, NoticeDiagram.tsx, TransitLayer.tsx, e2e/line-notices.spec.ts, .size-limit.json

Blocked/uncertain:
- none

Next:
- After the pull request for #206 deploys, open the 1 line's arrival-times notice on the live site

### 2026-11-15 04:28:16 UTC — agent:claude-code/abf81021-c394-4e17-a76d-dd9aafb3f1e3

<!-- continuity:checkpoint {"agent":"agent:claude-code/abf81021-c394-4e17-a76d-dd9aafb3f1e3","blocked":[],"changed":["src/features/transit/alertDiagram.ts, alertFocus.ts, NoticeDiagram.tsx, TransitLayer.tsx, e2e/line-notices.spec.ts, .size-limit.json"],"completed":["A notice that names its stations but takes no train away had no diagram or walk; it now draws its stations, tags them, lights them on the first spoken step, and the map marks no skip there"],"decisions":["no new decisions"],"evidence":["On the MacBook Pro the transit unit tests pass (176), the type check, lint and size budgets pass, and the line notice browser tests pass (20 cases); 14 of the 23 undrawn live notices of 2026-11-14 now draw"],"next_action":"After the pull request for #206 deploys, open the 1 line's arrival-times notice on the live site","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0062","timestamp":"2026-11-15T04:28:16Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"4eabb21586a18a7343f0ac6e309cdbe9bebf2ee6955f80619688e952d1e36f2c","request_id":"b99cd650dd9e44a9a4ba96d5fd98d739","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0062"} -->

Completed:
- A notice that names its stations but takes no train away had no diagram or walk; it now draws its stations, tags them, lights them on the first spoken step, and the map marks no skip there

Evidence:
- On the MacBook Pro the transit unit tests pass (176), the type check, lint and size budgets pass, and the line notice browser tests pass (20 cases); 14 of the 23 undrawn live notices of 2026-11-14 now draw

Decisions:
- no new decisions

Changed:
- src/features/transit/alertDiagram.ts, alertFocus.ts, NoticeDiagram.tsx, TransitLayer.tsx, e2e/line-notices.spec.ts, .size-limit.json

Blocked/uncertain:
- none

Next:
- After the pull request for #206 deploys, open the 1 line's arrival-times notice on the live site

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
