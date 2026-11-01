# TASK-NMA-0002 — Ferries without OpenTripPlanner

<!-- continuity:task {"acceptance":["https://nyc.design-bakery.com/api/v1/ferry returns 200 with routes and terminals","CI's contract command reports no server errors against the public site"],"depends_on":[],"goal":"The ferry layer shows routes, piers and boats on the VPS without a trip planner.","id":"NMA-0002","issue_url":"https://github.com/Pukujan-lab/nyc-map-agent/issues/618","next_action":"after the fix deploys, check /api/v1/ferry publicly, then set NYC_PUBLIC_URL under #614","owner":"claude-code","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"On the VPS /api/v1/ferry returned 502 because it asked an OpenTripPlanner that only ran on gravebuster."} -->

- Status: active
- Owner: claude-code
- Priority: P1
- Depends on: none

## Goal

The ferry layer shows routes, piers and boats on the VPS without a trip planner.

## Why

On the VPS /api/v1/ferry returned 502 because it asked an OpenTripPlanner that only ran on gravebuster.

## Allowed files

- `server/features/ferry/**`, `package.json`, `pnpm-lock.yaml`, `docs/OTP.md`, the checkpoint files and this task file.

## Human outcome

Riders see ferry routes, piers and boats on the live map again.

## Scope and boundaries

- In scope: where `/api/v1/ferry` gets its data.
- Out of scope: the trip planner (MOTIS) and the OTP deploy files kept for other hosts.
- Dependencies/uncertainty: NYC Ferry's live positions feed may list no boats at night; the schedule fills in.

## Acceptance criteria

- [ ] `curl https://nyc.design-bakery.com/api/v1/ferry` returns 200 with routes and terminals.
- [ ] CI's contract command reports no server errors against the public site.

## Evidence and sources

Against the real feeds on 2026-11-01 the new route returned 200 with 8 routes, 44 terminals and 2 scheduled Staten Island boats. Unit tests: 8 in `server/features/ferry`.

## Reproduction details (only when needed)

Not needed.

## Related records

- Owning issue: #618; it blocks #614's last step.
- Writer: claude-code on `fix/618-ferry-without-otp`, as of 2026-11-01.
- Pull request: opened from this branch.

## Checkpoint log

No checkpoints yet.

### 2026-11-01 02:39:17 UTC — claude-code (Claude Opus 5.5)

<!-- continuity:checkpoint {"agent":"claude-code (Claude Opus 5.5)","blocked":[],"changed":["server/features/ferry/*, package.json (fflate 0.8.2), docs/OTP.md, checkpoints, tasks/TASK-NMA-0002"],"completed":["The ferry route reads the NYC Ferry and Staten Island Ferry GTFS feeds and NYC Ferry's live positions itself; no OTP needed"],"decisions":["no new decisions"],"evidence":["8 ferry unit tests pass; full suite 1532 passed; typecheck and eslint clean on the change; real feeds gave 200 with 8 routes, 44 terminals, 2 scheduled boats"],"evidence_class":"observed","next_action":"After Komodo deploys it, check /api/v1/ferry on nyc.design-bakery.com, then set NYC_PUBLIC_URL under #614","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0002","timestamp":"2026-11-01T02:39:17Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"895d52805b99ebbd5e81761f15e11bdb79c4dd657110e59a608a267b9151d60b","request_id":"3b36c8ef51584dd390d828c91949a5a0","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0002"} -->

Completed:
- The ferry route reads the NYC Ferry and Staten Island Ferry GTFS feeds and NYC Ferry's live positions itself; no OTP needed

Evidence:
- 8 ferry unit tests pass; full suite 1532 passed; typecheck and eslint clean on the change; real feeds gave 200 with 8 routes, 44 terminals, 2 scheduled boats

Decisions:
- no new decisions

Changed:
- server/features/ferry/*, package.json (fflate 0.8.2), docs/OTP.md, checkpoints, tasks/TASK-NMA-0002

Blocked/uncertain:
- none

Next:
- After Komodo deploys it, check /api/v1/ferry on nyc.design-bakery.com, then set NYC_PUBLIC_URL under #614

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
