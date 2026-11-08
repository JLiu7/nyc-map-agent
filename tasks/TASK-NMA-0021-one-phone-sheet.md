# TASK-NMA-0021 — One Phone Sheet

<!-- continuity:task {"acceptance":["At 320x568, 375x667 and 390x844 the page never has more than one .pull-sheet","A station's line chip shows the line in the same sheet; Back returns to the station; Close line empties the sheet","The chat bar stays below the sheet and the map keeps a strip above it","e2e/responsive.spec.ts walks station, line and back with expectLayout at all four sizes"],"depends_on":[],"goal":"On a phone only one bottom sheet shows, with drill-in views and a back arrow","id":"NMA-0021","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/53","next_action":"after the pull request merges, try station, line chip, Back and Close on a phone","owner":"claude-code","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"The station and line sheets stacked and cut each other off"} -->

- Status: active
- Owner: claude-code
- Priority: P1
- Depends on: none

## Goal

On a phone only one bottom sheet shows, with drill-in views and a back arrow

## Why

The station and line sheets stacked and cut each other off

## Allowed files

- src/components/PullSheet.tsx, src/lib/store/pullSheet.ts (the sheet stack)
- src/components/MapPanel.tsx (the station sheet moves from the vaul drawer to a PullSheet)
- the PullSheet users: LinePanel, FollowSheet, TripPreview, ExitTask, SettingsSheet (Back wiring only)
- e2e/responsive.spec.ts, src/lib/store/pullSheet.test.ts, package.json and pnpm-lock.yaml (vaul removed)

## Human outcome

A rider who opens a station and taps one of its lines sees one sheet, reads the line's notices without anything cut off, and gets back to the station with the arrow, the way Google Maps works.

## Scope and boundaries

- In scope: every phone bottom sheet built on PullSheet shares one stack; only the newest draws.
- Out of scope: the line card's insides (another session is reworking its alert rows), the answer sheet, wide-screen layout.
- Dependencies/uncertainty: drag feel on a real phone is unchecked.

## Acceptance criteria

- [x] At 320x568, 375x667 and 390x844 the page never has more than one .pull-sheet
- [x] A station's line chip shows the line in the same sheet; Back returns to the station; Close line empties the sheet
- [x] The chat bar stays below the sheet and the map keeps a strip above it
- [x] e2e/responsive.spec.ts walks station, line and back with expectLayout at all four sizes

## Evidence and sources

Link repository state at a revision and cite external factual claims directly. Record commands and results for claims that need verification.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none): pukujan-lab-2/nyc-map-agent#53; no parent.
- Primary writer / branch / source issue revision / as-of status: claude-code, branch fix/53-one-phone-sheet, 2026-11-08.
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

- 2026-11-08: sheet stack, station sheet on PullSheet, Back on every sheet, e2e case passing at all four sizes locally.

### 2026-11-08 05:14:05 UTC — agent:claude-code/64b25730-48f6-44f4-bce5-fc8d8b4d58d6

<!-- continuity:checkpoint {"agent":"agent:claude-code/64b25730-48f6-44f4-bce5-fc8d8b4d58d6","blocked":[],"changed":["PullSheet, pullSheet store, MapPanel, the PullSheet users, e2e/responsive.spec.ts"],"completed":["Phone sheets share one stack: only the newest draws, Back returns to the one under it, Close line empties the sheet; the station sheet moved onto PullSheet"],"decisions":["no new decisions"],"evidence":["Typecheck, lint, unit tests and size budgets pass; the new e2e case passed at all four sizes in a one-worker run"],"next_action":"Wait for pull request #59 to merge itself, then drag the station sheet on a real phone","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0021","timestamp":"2026-11-08T05:14:05Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"31d861a1ce89f0fb169c9822dd4f72dd3f73cebe83e7dc9bbbe4539e7d6aad61","request_id":"45e08bf873ed41bb8bf2e190bc02b0eb","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0021"} -->

Completed:
- Phone sheets share one stack: only the newest draws, Back returns to the one under it, Close line empties the sheet; the station sheet moved onto PullSheet

Evidence:
- Typecheck, lint, unit tests and size budgets pass; the new e2e case passed at all four sizes in a one-worker run

Decisions:
- no new decisions

Changed:
- PullSheet, pullSheet store, MapPanel, the PullSheet users, e2e/responsive.spec.ts

Blocked/uncertain:
- none

Next:
- Wait for pull request #59 to merge itself, then drag the station sheet on a real phone

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
