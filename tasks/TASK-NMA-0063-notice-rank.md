# TASK-NMA-0063 — Notice Rank

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"A line's worst trouble is shown first, in its notices and in the Lines list","id":"NMA-0063","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/207","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Owner, 2026-11-14: skips and trains not available should be prioritized more and sorted"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

A line's worst trouble is shown first, in its notices and in the Lines list

## Why

Owner, 2026-11-14: skips and trains not available should be prioritized more and sorted

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

### 2026-11-15 04:28:41 UTC — agent:claude-code/abf81021-c394-4e17-a76d-dd9aafb3f1e3

<!-- continuity:checkpoint {"agent":"agent:claude-code/abf81021-c394-4e17-a76d-dd9aafb3f1e3","blocked":[],"changed":["src/features/transit/noticeRank.ts, lineNotices.ts, LinesDrawer.tsx, alertFocus.ts, e2e/line-notices.spec.ts, .size-limit.json"],"completed":["A line's notices were grouped by tone with a delay ahead of a no-trains stretch, and the Lines list's chip hid the worst trouble; one ranking now orders both, and the Lines list opens with a summary of the lines in trouble"],"decisions":["no new decisions"],"evidence":["On the MacBook Pro the transit unit tests pass (184, 9 new for the ranking), the type check, lint and size budgets pass, and the line notice browser tests pass (24 cases, 4 new for the Lines list and the sorted panel)"],"next_action":"After the pull request for #207 deploys, tap My train on the live site and open the A line","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0063","timestamp":"2026-11-15T04:28:41Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"ed8b111a8403d7c4f190c33674cc9ea03c81ba9ed17e39df7b23381bd370ec0d","request_id":"d96a6d6987214198a71a2025d96c8ad8","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0063"} -->

Completed:
- A line's notices were grouped by tone with a delay ahead of a no-trains stretch, and the Lines list's chip hid the worst trouble; one ranking now orders both, and the Lines list opens with a summary of the lines in trouble

Evidence:
- On the MacBook Pro the transit unit tests pass (184, 9 new for the ranking), the type check, lint and size budgets pass, and the line notice browser tests pass (24 cases, 4 new for the Lines list and the sorted panel)

Decisions:
- no new decisions

Changed:
- src/features/transit/noticeRank.ts, lineNotices.ts, LinesDrawer.tsx, alertFocus.ts, e2e/line-notices.spec.ts, .size-limit.json

Blocked/uncertain:
- none

Next:
- After the pull request for #207 deploys, tap My train on the live site and open the A line

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
