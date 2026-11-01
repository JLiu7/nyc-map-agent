# TASK-NMA-0005 — Line Status Eval

<!-- continuity:task {"acceptance":["tsx scripts/eval-line-status.ts prints train and held-out clean rates per check over replayed cases","checks.test.ts passes offline, including the wrong A train reply from #627","docs/eval/line-status holds the loop and a handoff DeepSeek can run alone","no real rider questions are collected"],"depends_on":[],"goal":"Line status answers are scored on many replayed cases so each change to the chat is kept or dropped on numbers.","id":"NMA-0005","issue_url":"https://github.com/Pukujan-lab/nyc-map-agent/issues/629","next_action":"merge this pull request, then DeepSeek runs the loop in docs/eval/line-status/PROGRAM.md; the owner updates PRIVACY.md before any real questions are collected","owner":"claude-code","priority":"P2","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"One wrong A train answer was fixed by hand and nothing measures how often the chat misreads line status (#629)."} -->

- Status: active
- Owner: claude-code
- Priority: P2
- Depends on: none

## Goal

Line status answers are scored on many replayed cases so each change to the chat is kept or dropped on numbers.

## Why

One wrong A train answer was fixed by hand and nothing measures how often the chat misreads line status (#629).

## Allowed files

- `scripts/eval/line-status/`, `scripts/eval-line-status*.ts`, `scripts/record-alert-snapshot.ts`, `docs/eval/line-status/`, `.gitignore`, `checkpoints/`, this file.

## Human outcome

Every change to how the chat retells MTA trouble is judged on numbers from many replays, and a cheaper model can run that loop for hours.

## Scope and boundaries

- In scope: line status questions; the harness, recorder, generator and docs.
- Out of scope: trip questions (next suite), training LFM3, collecting real rider questions.
- Dependencies/uncertainty: LFM3 on the MacBook Pro must be awake; DeepSeek's key is not set up yet.

## Acceptance criteria

- [ ] The runner reports clean rates for train and held-out cases.
- [ ] Offline tests pass.
- [ ] The handoff and loop are in docs/eval/line-status.

## Evidence and sources

A 12-trial smoke run on LFM3 (prompt as merged in #628) came back 3 of 12 clean: 9 replies ended with an unwanted "Want to start?", and several invented a C shuttle bus. `npx vitest run scripts/eval` passes (10 tests), `tsc`, `eslint` and `depcruise` are clean. The full baseline is in docs/eval/line-status/LEDGER.md.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none): #629; related #627, #628; no parent.
- Primary writer / branch / source issue revision / as-of status:
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-01 10:12:09 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["scripts/eval-line-status*.ts, scripts/record-alert-snapshot.ts, scripts/eval/line-status/, docs/eval/line-status/, .gitignore, checkpoints/CURRENT.md"],"completed":["Built the line status eval: runner, ten rule checks, cases, recorder, DeepSeek generator, soak loop, handoff; opened #630 with auto-merge"],"decisions":["no new decisions"],"evidence":["npx vitest run scripts/eval: 10 passed; tsc, eslint, depcruise clean; 12-trial smoke run on LFM3 was 3 of 12 clean"],"evidence_class":"observed","next_action":"when the full baseline finishes, add its row to docs/eval/line-status/LEDGER.md in a follow-up pull request; DeepSeek key still to be set; PRIVACY.md change before any real questions","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0005","timestamp":"2026-11-01T10:12:09Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"c8a34dcc77ff4033d2d68922eaa7db648438c0c0e3c5d4101bd8a014d96335c0","request_id":"566053ccd68a418c9c438d54e8ab6048","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0005"} -->

Completed:
- Built the line status eval: runner, ten rule checks, cases, recorder, DeepSeek generator, soak loop, handoff; opened #630 with auto-merge

Evidence:
- npx vitest run scripts/eval: 10 passed; tsc, eslint, depcruise clean; 12-trial smoke run on LFM3 was 3 of 12 clean

Decisions:
- no new decisions

Changed:
- scripts/eval-line-status*.ts, scripts/record-alert-snapshot.ts, scripts/eval/line-status/, docs/eval/line-status/, .gitignore, checkpoints/CURRENT.md

Blocked/uncertain:
- none

Next:
- when the full baseline finishes, add its row to docs/eval/line-status/LEDGER.md in a follow-up pull request; DeepSeek key still to be set; PRIVACY.md change before any real questions

### 2026-11-01 10:22:35 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["docs/eval/line-status/LEDGER.md"],"completed":["Recorded the LFM3 baseline in the ledger: 31 of 174 trials clean; opened #631 with auto-merge"],"decisions":["no new decisions"],"evidence":["Run baseline-after-628, 58 cases x 3 trials, commit b17e6ce7f88a: train 14.6%, held-out 25.5%"],"evidence_class":"observed","next_action":"DeepSeek runs the loop in docs/eval/line-status/PROGRAM.md starting with the unwanted Want to start? and the invented shuttle; owner sets DEEPSEEK_API_KEY and approves the PRIVACY.md change","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0005","timestamp":"2026-11-01T10:22:35Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"4bbfae36ac7054bd2025c029564c5c143a3900f0426876d4e73b5bf58b618f35","request_id":"20bef696ab7641999b24a95321885c52","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0005"} -->

Completed:
- Recorded the LFM3 baseline in the ledger: 31 of 174 trials clean; opened #631 with auto-merge

Evidence:
- Run baseline-after-628, 58 cases x 3 trials, commit b17e6ce7f88a: train 14.6%, held-out 25.5%

Decisions:
- no new decisions

Changed:
- docs/eval/line-status/LEDGER.md

Blocked/uncertain:
- none

Next:
- DeepSeek runs the loop in docs/eval/line-status/PROGRAM.md starting with the unwanted Want to start? and the invented shuttle; owner sets DEEPSEEK_API_KEY and approves the PRIVACY.md change

### 2026-11-01 10:23:06 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":[".coord/boss_claim.json"],"completed":["Committed the boss seat change another agent (workbuddy@air) made to .coord/boss_claim.json"],"decisions":["no new decisions"],"evidence":["git diff showed only the seat handover at 2026-11-01T10:21:23Z; seat_protocol status OK"],"evidence_class":"observed","next_action":"DeepSeek runs the loop in docs/eval/line-status/PROGRAM.md; owner sets DEEPSEEK_API_KEY and approves the PRIVACY.md change","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0005","timestamp":"2026-11-01T10:23:06Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"0075dca6d17fe0368f1e4abc2d2d3d9ef78c7849fb05ae0635445b93216ea4f6","request_id":"da6900253b6f4c31b4ce708aced39d0e","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0005"} -->

Completed:
- Committed the boss seat change another agent (workbuddy@air) made to .coord/boss_claim.json

Evidence:
- git diff showed only the seat handover at 2026-11-01T10:21:23Z; seat_protocol status OK

Decisions:
- no new decisions

Changed:
- .coord/boss_claim.json

Blocked/uncertain:
- none

Next:
- DeepSeek runs the loop in docs/eval/line-status/PROGRAM.md; owner sets DEEPSEEK_API_KEY and approves the PRIVACY.md change

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
