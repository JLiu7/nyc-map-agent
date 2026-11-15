# TASK-NMA-0059 — Notice Card Says What

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"A tapped subway notice says which train, where and what changes, then why and when, on the card and in the voice","id":"NMA-0059","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/198","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Owner, 2026-11-14: the card for a 1 line notice read only the cause and the dates"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

A tapped subway notice says which train, where and what changes, then why and when, on the card and in the voice

## Why

Owner, 2026-11-14: the card for a 1 line notice read only the cause and the dates

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

### 2026-11-15 01:58:22 UTC — agent:claude-code/abf81021-c394-4e17-a76d-dd9aafb3f1e3

<!-- continuity:checkpoint {"agent":"agent:claude-code/abf81021-c394-4e17-a76d-dd9aafb3f1e3","blocked":[],"changed":["src/features/transit/alertDiagram.ts, NoticeDiagram.tsx, LinePanel.tsx, e2e/line-notices.spec.ts"],"completed":["A subway notice with nothing to draw used to open as only the cause and the dates; its card and voice now say the train and stations first, then why and when"],"decisions":["no new decisions"],"evidence":["The summary builder's unit tests pass (22, 7 new), the type check passes, and the line notice browser tests pass on the MacBook Pro (20 cases, 4 new at the four layout sizes)"],"next_action":"After the pull request for #198 deploys, open the 1 line on the live site and tap the notice about arrival times","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0059","timestamp":"2026-11-15T01:58:22Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"1ab6750940a845e454d8c225c01538f16bb0aa2ed16ab6f1fc6f23bd240c223f","request_id":"792c29d24e744922aec804dd6de5f7e4","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0059"} -->

Completed:
- A subway notice with nothing to draw used to open as only the cause and the dates; its card and voice now say the train and stations first, then why and when

Evidence:
- The summary builder's unit tests pass (22, 7 new), the type check passes, and the line notice browser tests pass on the MacBook Pro (20 cases, 4 new at the four layout sizes)

Decisions:
- no new decisions

Changed:
- src/features/transit/alertDiagram.ts, NoticeDiagram.tsx, LinePanel.tsx, e2e/line-notices.spec.ts

Blocked/uncertain:
- none

Next:
- After the pull request for #198 deploys, open the 1 line on the live site and tap the notice about arrival times

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
