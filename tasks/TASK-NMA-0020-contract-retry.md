# TASK-NMA-0020 — Contract Retry

<!-- continuity:task {"acceptance":["the contract step runs Schemathesis again 30 s after a failure","a failure on both runs still fails the job","a first-run pass runs it once"],"depends_on":[],"goal":"Retry the contract check once so a single dropped request does not fail a healthy deploy","id":"NMA-0020","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/50","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"claude-code","priority":"low","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"A Cloudflare tunnel blip failed main's CI on 2026-11-04 and needed a manual rerun"} -->

- Status: active
- Owner: claude-code
- Priority: low
- Depends on: none

## Goal

Retry the contract check once so a single dropped request does not fail a healthy deploy

## Why

A Cloudflare tunnel blip failed main's CI on 2026-11-04 and needed a manual rerun

## Allowed files

- `.github/workflows/ci.yml` (the contract job's Schemathesis step only)

## Human outcome

A red main means something is wrong, not that one request was dropped.

## Scope and boundaries

- In scope:
- Out of scope:
- Dependencies/uncertainty:

## Acceptance criteria

- [x] The loop passes first try, passes after one failure and fails after two (checked under `bash -e` with stand-in commands).
- [ ] The next main runs show the step working; it only retries when a run fails.

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

### 2026-11-04 23:41:35 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":[".github/workflows/ci.yml contract step"],"completed":["The contract check now runs a second time 30 seconds after a failure, so one dropped request no longer fails a healthy deploy"],"decisions":["no new decisions"],"evidence":["The retry loop passes first try, passes after one failure and fails after two, checked with stand-in commands; the workflow file parses"],"evidence_class":"observed","next_action":"Open the pull request, then watch the next few main runs for the contract step","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0020","timestamp":"2026-11-04T23:41:35Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"203a5f2b671ff1f128803324be1e99e188d30e5b145a031b1baece1d02dd631c","request_id":"7c038de706b9422a87fead01305139e1","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0020"} -->

Completed:
- The contract check now runs a second time 30 seconds after a failure, so one dropped request no longer fails a healthy deploy

Evidence:
- The retry loop passes first try, passes after one failure and fails after two, checked with stand-in commands; the workflow file parses

Decisions:
- no new decisions

Changed:
- .github/workflows/ci.yml contract step

Blocked/uncertain:
- none

Next:
- Open the pull request, then watch the next few main runs for the contract step

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
