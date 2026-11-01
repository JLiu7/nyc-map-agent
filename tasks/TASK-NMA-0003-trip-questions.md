# TASK-NMA-0003 — Trip Questions

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"The trip chat asks one short question when a request is vague, then ends a planned trip with one follow-up offer.","id":"NMA-0003","issue_url":"https://github.com/Pukujan-lab/nyc-map-agent/issues/625","next_action":"none: #625 is closed and its fix is live (#626). The next change to trip questions belongs to the eval loop in #629, not to this record","owner":"claude-code","priority":"P2","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"completed","why":"Vague asks like 'Brooklyn tomorrow' were planned on a guess and no trip answer offered a next step."} -->

- Status: completed
- Owner: claude-code
- Priority: P2
- Depends on: none

## Goal

The trip chat asks one short question when a request is vague, then ends a planned trip with one follow-up offer.

## Why

Vague asks like 'Brooklyn tomorrow' were planned on a guess and no trip answer offered a next step.

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

### 2026-11-01 09:38:38 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["server/features/agent/ask.ts, tools.ts, routes.ts, prompt.ts, plan.ts, otp.ts"],"completed":["Slot check, app-said questions and follow-ups in eight languages, tests and a live LFM3 eval are in pull request 626."],"decisions":["no new decisions"],"evidence":["1551 tests pass; live LFM3 eval 7 to 8 of 9 across runs."],"next_action":"After pull request 626 merges and deploys, rerun scripts/eval-trip-questions.ts --url https://nyc.design-bakery.com/api/agent and post before and after dialogues on issue 625.","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0003","timestamp":"2026-11-01T09:38:38Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"9257e75e8b8574f3ab769d0a1292389af3d15779f1a86d1ae6cf42a17fd48783","request_id":"13165c5cd80c4a409220419d484eed57","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0003"} -->

Completed:
- Slot check, app-said questions and follow-ups in eight languages, tests and a live LFM3 eval are in pull request 626.

Evidence:
- 1551 tests pass; live LFM3 eval 7 to 8 of 9 across runs.

Decisions:
- no new decisions

Changed:
- server/features/agent/ask.ts, tools.ts, routes.ts, prompt.ts, plan.ts, otp.ts

Blocked/uncertain:
- none

Next:
- After pull request 626 merges and deploys, rerun scripts/eval-trip-questions.ts --url https://nyc.design-bakery.com/api/agent and post before and after dialogues on issue 625.

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
