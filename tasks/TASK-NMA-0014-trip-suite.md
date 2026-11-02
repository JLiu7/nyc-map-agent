# TASK-NMA-0014 — Trip Suite

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"Score the chat agent's tool use over multi-turn trip conversations","id":"NMA-0014","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/23","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"claude-code","priority":"high","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Multi-turn trip failures (wrong tool, nothing drawn, a yes that does nothing) were not measured, so no fix could be shown to help"} -->

- Status: active
- Owner: claude-code
- Priority: high
- Depends on: none

## Goal

Score the chat agent's tool use over multi-turn trip conversations

## Why

Multi-turn trip failures (wrong tool, nothing drawn, a yes that does nothing) were not measured, so no fix could be shown to help

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

### 2026-11-01 23:15:11 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["scripts/eval-trips.ts, scripts/eval/trips/, docs/eval/trips/README.md"],"completed":["Built the multi-turn trip suite: 8 tool-use checks, 12 conversations, the runner (which answers the app's station readback as a rider would) and its README"],"decisions":["no new decisions"],"evidence":["14 check tests pass; eslint and tsc are clean; smoke runs on LFM3 found a real empty reply after a yes and a trip id shown to the rider"],"evidence_class":"observed","next_action":"Record the 36-conversation LFM3 baseline in docs/eval/trips/LEDGER.md, then mark PR #29 ready","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0014","timestamp":"2026-11-01T23:15:11Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"7c2297d2a80df49aad0b91f6e9a46e49bb463dcaf26dac6f0f5c299801458719","request_id":"2c40c39e6edd41849088f47231c66ce8","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0014"} -->

Completed:
- Built the multi-turn trip suite: 8 tool-use checks, 12 conversations, the runner (which answers the app's station readback as a rider would) and its README

Evidence:
- 14 check tests pass; eslint and tsc are clean; smoke runs on LFM3 found a real empty reply after a yes and a trip id shown to the rider

Decisions:
- no new decisions

Changed:
- scripts/eval-trips.ts, scripts/eval/trips/, docs/eval/trips/README.md

Blocked/uncertain:
- none

Next:
- Record the 36-conversation LFM3 baseline in docs/eval/trips/LEDGER.md, then mark PR #29 ready

### 2026-11-01 23:26:00 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["docs/eval/trips/LEDGER.md, PR #29 description"],"completed":["Ran and recorded the first trip suite baseline: 21 of 51 turns clean on LFM3 1.7B"],"decisions":["no new decisions"],"evidence":["eval-runs baseline rows; most failures trace to the fast trip path and the 8-step cap, not the model"],"evidence_class":"observed","next_action":"Merge PR #29 after green CI, then fix the fast trip path so it draws the route, keeps the rider's language and reads a named start","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0014","timestamp":"2026-11-01T23:26:00Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"5532a948da1a20450bde7ba59c8fcab176cd7cf7f8f27854cf378843e496cf2d","request_id":"370d99c4ad5440afa000695205e8b4a3","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0014"} -->

Completed:
- Ran and recorded the first trip suite baseline: 21 of 51 turns clean on LFM3 1.7B

Evidence:
- eval-runs baseline rows; most failures trace to the fast trip path and the 8-step cap, not the model

Decisions:
- no new decisions

Changed:
- docs/eval/trips/LEDGER.md, PR #29 description

Blocked/uncertain:
- none

Next:
- Merge PR #29 after green CI, then fix the fast trip path so it draws the route, keeps the rider's language and reads a named start

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
