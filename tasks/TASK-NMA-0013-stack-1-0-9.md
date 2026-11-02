# TASK-NMA-0013 — Stack 1 0 9

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"Upgrade the agent stack to the certified 1.0.9","id":"NMA-0013","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/26","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"claude-code","priority":"high","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"The repo pinned a stack older than 1.0.7, so its hooks and checks enforced old rules"} -->

- Status: active
- Owner: claude-code
- Priority: high
- Depends on: none

## Goal

Upgrade the agent stack to the certified 1.0.9

## Why

The repo pinned a stack older than 1.0.7, so its hooks and checks enforced old rules

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

### 2026-11-01 23:08:48 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":[".claude/hooks/acs_guard.py, .coord/hotload.lock.json, .oio/, CLAUDE.md, two OIO workflows, checkpoints/"],"completed":["Upgraded the agent stack pin from 2d5d83c to the certified 1.0.9 (496bf33) and fixed the repo identity the installer checks"],"decisions":["no new decisions"],"evidence":["acs_install.py --force finished OK (state=READY); check_manifest.py says the repo agrees with release train current; the new guard runs on Python 3.9"],"evidence_class":"observed","next_action":"Merge PR #30 once CI is green, then close the stale bot PR #16","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0013","timestamp":"2026-11-01T23:08:48Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"f13d0604656727a3e56d662fa8b071c40859e571bb0e5c84508923785640b90a","request_id":"7a921b7e333043ad892c04bc7b9b9bdf","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0013"} -->

Completed:
- Upgraded the agent stack pin from 2d5d83c to the certified 1.0.9 (496bf33) and fixed the repo identity the installer checks

Evidence:
- acs_install.py --force finished OK (state=READY); check_manifest.py says the repo agrees with release train current; the new guard runs on Python 3.9

Decisions:
- no new decisions

Changed:
- .claude/hooks/acs_guard.py, .coord/hotload.lock.json, .oio/, CLAUDE.md, two OIO workflows, checkpoints/

Blocked/uncertain:
- none

Next:
- Merge PR #30 once CI is green, then close the stale bot PR #16

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
