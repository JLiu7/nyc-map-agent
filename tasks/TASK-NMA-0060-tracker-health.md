# TASK-NMA-0060 — Tracker Health

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"The owner can see, as charts, how much the live train and bus tracker has learned and how far off its predictions are, for the whole system and for each line and bus route","id":"NMA-0060","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/11","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Owner, 2026-11-14: the tracker learns travel times but nothing measures its accuracy, and there is no place to see either"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

The owner can see, as charts, how much the live train and bus tracker has learned and how far off its predictions are, for the whole system and for each line and bus route

## Why

Owner, 2026-11-14: the tracker learns travel times but nothing measures its accuracy, and there is no place to see either

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

### 2026-11-15 02:33:58 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The observer job scores the tracker's predictions and two endpoints serve coverage and accuracy summaries"],"decisions":["no new decisions"],"evidence":["Unit tests for the scorers and endpoints pass; a 7-minute dry run against the live feeds scored 353 train and 45 bus predictions"],"next_action":"After the pull request merges, run nyc-job.sh update on the VPS and read the first stored scores; then ship the /tracker-health page and its Advanced-only link","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T02:33:58Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"d99532aec3296a322043794577882d329a11f2fa076e81196879f1ceefb5f234","request_id":"a8057f397c3349e3b1ec910b624687a2","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The observer job scores the tracker's predictions and two endpoints serve coverage and accuracy summaries

Evidence:
- Unit tests for the scorers and endpoints pass; a 7-minute dry run against the live feeds scored 353 train and 45 bus predictions

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- After the pull request merges, run nyc-job.sh update on the VPS and read the first stored scores; then ship the /tracker-health page and its Advanced-only link

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
