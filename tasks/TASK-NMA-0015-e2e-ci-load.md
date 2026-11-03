# TASK-NMA-0015 — E2E Ci Load

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"Make e2e pass on the shared VPS runners","id":"NMA-0015","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/31","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"claude-code","priority":"high","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"e2e is a required check and failed on every run since the move, so nothing could merge"} -->

- Status: active
- Owner: claude-code
- Priority: high
- Depends on: none

## Goal

Make e2e pass on the shared VPS runners

## Why

e2e is a required check and failed on every run since the move, so nothing could merge

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

### 2026-11-01 23:38:59 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["playwright.config.ts, .github/workflows/ci.yml"],"completed":["Capped Playwright at 2 workers with 15 s expectations on CI and raised the e2e job limit to 30 minutes"],"decisions":["no new decisions"],"evidence":["e2e failed on all 16 completed runs since the move; failures are the map canvas missing its 5 s wait while the 12-core VPS ran at load 18-23"],"evidence_class":"observed","next_action":"Watch PR #32's e2e run; if green, merge it, then merge #30 and #29","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0015","timestamp":"2026-11-01T23:38:59Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"53def11987a4f903828ba79a41e3d79168f98f4b61e164daff38a4c7a0fa8695","request_id":"a2f36deae8444f6ab0e64ead6205c8c1","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0015"} -->

Completed:
- Capped Playwright at 2 workers with 15 s expectations on CI and raised the e2e job limit to 30 minutes

Evidence:
- e2e failed on all 16 completed runs since the move; failures are the map canvas missing its 5 s wait while the 12-core VPS ran at load 18-23

Decisions:
- no new decisions

Changed:
- playwright.config.ts, .github/workflows/ci.yml

Blocked/uncertain:
- none

Next:
- Watch PR #32's e2e run; if green, merge it, then merge #30 and #29

### 2026-11-03 09:19:08 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["scripts/ci/pin-cpus.sh, .github/workflows/ci.yml, checkpoints/CURRENT.md"],"completed":["e2e runs on two pinned CPUs (scripts/ci/pin-cpus.sh); pull request #46 opened"],"decisions":["Pin the suite to as many CPUs as the runner's 2-CPU quota allows instead of raising time limits; runner-wide CPU sets are left to server-management"],"evidence":["Both pinned runs passed 110 of 110: 41605974620 in 13.1 min (median 11.2 s per test) and 41608169660 in 11.5 min (median 9.8 s) on a VPS 18-23% busy; the slow runs took 30-38 s per test"],"next_action":"Merge #46 when its checks pass, then confirm e2e on main's next run","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0015","timestamp":"2026-11-03T09:19:08Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"18e6727f6e2566013dd75d4f31e05c56e49e12e438762a3b8391a38bcee252ff","request_id":"c43d021d5da7486589eed2622ae40afc","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0015"} -->

Completed:
- e2e runs on two pinned CPUs (scripts/ci/pin-cpus.sh); pull request #46 opened

Evidence:
- Both pinned runs passed 110 of 110: 41605974620 in 13.1 min (median 11.2 s per test) and 41608169660 in 11.5 min (median 9.8 s) on a VPS 18-23% busy; the slow runs took 30-38 s per test

Decisions:
- Pin the suite to as many CPUs as the runner's 2-CPU quota allows instead of raising time limits; runner-wide CPU sets are left to server-management

Changed:
- scripts/ci/pin-cpus.sh, .github/workflows/ci.yml, checkpoints/CURRENT.md

Blocked/uncertain:
- none

Next:
- Merge #46 when its checks pass, then confirm e2e on main's next run

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
