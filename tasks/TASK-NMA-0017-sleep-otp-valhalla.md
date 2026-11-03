# TASK-NMA-0017 — Sleep Otp Valhalla

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"Let OTP and Valhalla sleep on the VPS after 10 idle minutes and wake them on page open, at each question and before each search","id":"NMA-0017","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/44","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"claude-code","priority":"medium","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"They held about 4.5 GB of the VPS's memory around the clock for a few trips a day"} -->

- Status: active
- Owner: claude-code
- Priority: medium
- Depends on: none

## Goal

Let OTP and Valhalla sleep on the VPS after 10 idle minutes and wake them on page open, at each question and before each search

## Why

They held about 4.5 GB of the VPS's memory around the clock for a few trips a day

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

### 2026-11-03 05:23:19 UTC — agent:claude-code/e028b463-d05a-4ac6-831e-de4f7f96480d

<!-- continuity:checkpoint {"agent":"agent:claude-code/e028b463-d05a-4ac6-831e-de4f7f96480d","blocked":[],"changed":["server/features/agent/{sablier,otp,valhalla,routes}.ts, src/main.tsx, deploy/docker-compose.vps.yml, deploy/README.md, docs"],"completed":["Wake calls, page warm route, Sablier labels and health checks for OTP and Valhalla; PR #45 open with auto-merge armed"],"decisions":["no new decisions"],"evidence":["pnpm test (1,617 unit tests), typecheck, lint, knip, boundaries and openapi:check pass; both health checks exit 0 inside the live VPS containers"],"evidence_class":"observed","next_action":"After #45 deploys, check on the VPS that both containers stop after 10 idle minutes, measure OTP's cold start and write it into deploy/README.md and server-management vps/services.toml","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0017","timestamp":"2026-11-03T05:23:19Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"185f0b8543e88368fe9f4dc98ead6c490253b93a08469ff6572c8a34e6b36a9b","request_id":"ee1d07a9a2114c5cbf53ebb731abbb28","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0017"} -->

Completed:
- Wake calls, page warm route, Sablier labels and health checks for OTP and Valhalla; PR #45 open with auto-merge armed

Evidence:
- pnpm test (1,617 unit tests), typecheck, lint, knip, boundaries and openapi:check pass; both health checks exit 0 inside the live VPS containers

Decisions:
- no new decisions

Changed:
- server/features/agent/{sablier,otp,valhalla,routes}.ts, src/main.tsx, deploy/docker-compose.vps.yml, deploy/README.md, docs

Blocked/uncertain:
- none

Next:
- After #45 deploys, check on the VPS that both containers stop after 10 idle minutes, measure OTP's cold start and write it into deploy/README.md and server-management vps/services.toml

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
