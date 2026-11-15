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

### 2026-11-15 02:51:43 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The tracker health page at /tracker-health and its Advanced-only Settings link are built on a pushed branch"],"decisions":["no new decisions"],"evidence":["Lint, type check and unit tests pass; 11 of 12 browser cases passed before the last test fix, whose rerun is in progress"],"next_action":"Open the page pull request once the browser tests and size check pass; after pull request 202 merges, run nyc-job.sh update on the VPS and read the first scores; then the station view, stored conditions, pooling comparison and the MTA bus speeds dataset","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T02:51:43Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"d785eb1db19c35b590c28c67b78f4fe592a33e006c406b9e6f83b7b995e55ba0","request_id":"1c902adebb444b44a776a0eeec4efdc2","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The tracker health page at /tracker-health and its Advanced-only Settings link are built on a pushed branch

Evidence:
- Lint, type check and unit tests pass; 11 of 12 browser cases passed before the last test fix, whose rerun is in progress

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Open the page pull request once the browser tests and size check pass; after pull request 202 merges, run nyc-job.sh update on the VPS and read the first scores; then the station view, stored conditions, pooling comparison and the MTA bus speeds dataset

### 2026-11-15 02:55:35 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The tracker health page and its Advanced-only Settings link pass their browser tests at the four layout sizes and the size budgets"],"decisions":["no new decisions"],"evidence":["12 browser cases, lint, type check and unit tests pass on the MacBook Pro; the page chunk is 5.8 kB"],"next_action":"Merge the page pull request after pull request 202; run nyc-job.sh update on the VPS and read the first scores; then the station view, stored conditions, pooling comparison and the MTA bus speeds dataset","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T02:55:35Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"b8f84820884a18c14dbaafb27b3cc283366c511a81dc2d639b11fb74c0c3a234","request_id":"04419acec7874847a3e38afa8d2141ca","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The tracker health page and its Advanced-only Settings link pass their browser tests at the four layout sizes and the size budgets

Evidence:
- 12 browser cases, lint, type check and unit tests pass on the MacBook Pro; the page chunk is 5.8 kB

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Merge the page pull request after pull request 202; run nyc-job.sh update on the VPS and read the first scores; then the station view, stored conditions, pooling comparison and the MTA bus speeds dataset

### 2026-11-15 03:15:38 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The scoring merged in pull request 202 and main is merged into the page branch"],"decisions":["no new decisions"],"evidence":["Pull request 202 merged on 2026-11-15 with all checks passing; the page branch has no conflict with main"],"next_action":"When the VPS jobs checkout is on main, read the first job log and stored scores; check the live endpoints and the page after pull request 203 deploys","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T03:15:38Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"9c0f562ee0bc48c070088e42c0729a65d28d19e1cacb065da2a61979463317bc","request_id":"4b47a58aba5842879fbc6dd7acf8a8cd","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The scoring merged in pull request 202 and main is merged into the page branch

Evidence:
- Pull request 202 merged on 2026-11-15 with all checks passing; the page branch has no conflict with main

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- When the VPS jobs checkout is on main, read the first job log and stored scores; check the live endpoints and the page after pull request 203 deploys

### 2026-11-15 04:01:31 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The scoring and the tracker health page are live; the One line view now splits a subway line by platform direction"],"decisions":["no new decisions"],"evidence":["The first VPS run stored 740 scores; the live page loads real coverage; the fix passes its unit test and browser case at four sizes"],"next_action":"After the direction fix deploys, pick the 1 on the live page; then the station view with per-hour counts, stored conditions, the pooling comparison and the MTA bus speeds comparison","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T04:01:31Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"90c5b7be75e987ca190388da8e910eca5648779c93c9bff2b2f0b028616f2a35","request_id":"7b24c64f141f4fef9634f7f39c401b36","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The scoring and the tracker health page are live; the One line view now splits a subway line by platform direction

Evidence:
- The first VPS run stored 740 scores; the live page loads real coverage; the fix passes its unit test and browser case at four sizes

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- After the direction fix deploys, pick the 1 on the live page; then the station view with per-hour counts, stored conditions, the pooling comparison and the MTA bus speeds comparison

### 2026-11-15 05:19:56 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The tracker health page has a Stations card with per-line dwell and neighbouring stretch times"],"decisions":["no new decisions"],"evidence":["12 browser cases pass at four sizes with the station list and detail; 13 unit tests pass"],"next_action":"Per-hour sample counts on the week grid; then conditions stored with each score, the pooling comparison and the MTA bus speeds comparison","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T05:19:56Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"f3c9fd32143deaa47d3af4b5584310d6f9a46361f32b8f569dcc9d39315c4672","request_id":"95b3328749254456b6d788bdaf6b3bb5","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The tracker health page has a Stations card with per-line dwell and neighbouring stretch times

Evidence:
- 12 browser cases pass at four sizes with the station list and detail; 13 unit tests pass

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Per-hour sample counts on the week grid; then conditions stored with each score, the pooling comparison and the MTA bus speeds comparison

### 2026-11-15 05:35:57 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The page shows per-hour counts, error by conditions, the worst stops and the MTA comparison, on a pushed branch"],"decisions":["no new decisions"],"evidence":["12 browser cases pass at four sizes; 16 unit tests pass; the page chunk is 9.1 kB"],"next_action":"Open this pull request after the station view merges and the bus speeds one after the conditions one; run nyc-job.sh update on the VPS after each server change; then test the MTA figure as a starting value for thin bus stretches","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T05:35:57Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"21f7ac377f1058ed237747177487f1afd49a77a60c568bbb3155ed153b5a2228","request_id":"63cd45298a2e44bdbe8453e05a788d28","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The page shows per-hour counts, error by conditions, the worst stops and the MTA comparison, on a pushed branch

Evidence:
- 12 browser cases pass at four sizes; 16 unit tests pass; the page chunk is 9.1 kB

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Open this pull request after the station view merges and the bus speeds one after the conditions one; run nyc-job.sh update on the VPS after each server change; then test the MTA figure as a starting value for thin bus stretches

### 2026-11-15 06:38:02 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The page reads condition splits from the accuracy answer's new list"],"decisions":["no new decisions"],"evidence":["12 browser cases pass at four sizes"],"next_action":"When pull requests 214 and 215 merge, merge main into 216 and 217, run nyc-job.sh update on the VPS between runs, and read the first rows with conditions","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T06:38:02Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"91b63d23a184f16b13b6e2f761ffa92de0dca89dc40510e786d597fe2af29da3","request_id":"d8dded4b61514887aac4dbed2f7dec47","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The page reads condition splits from the accuracy answer's new list

Evidence:
- 12 browser cases pass at four sizes

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- When pull requests 214 and 215 merge, merge main into 216 and 217, run nyc-job.sh update on the VPS between runs, and read the first rows with conditions

### 2026-11-15 09:19:07 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The server side merged in pull request 217; the page branch is up to date with main"],"decisions":["no new decisions"],"evidence":["16 unit tests, type check and lint pass; size budgets pass on the MacBook Pro"],"next_action":"When pull request 216 merges and deploys, check the live page: stations, hour strip, error by conditions, worst stops and the MTA comparison; read the first rows with conditions","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T09:19:07Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"229f6a406afb9417ae89a60b9f4f7783e6661385cda82bf9deddf2861d227423","request_id":"5fbbd9086d574896a7dc85b12c8d188c","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The server side merged in pull request 217; the page branch is up to date with main

Evidence:
- 16 unit tests, type check and lint pass; size budgets pass on the MacBook Pro

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- When pull request 216 merges and deploys, check the live page: stations, hour strip, error by conditions, worst stops and the MTA comparison; read the first rows with conditions

### 2026-11-15 11:21:54 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The page branch is up to date with main and inside every size budget"],"decisions":["no new decisions"],"evidence":["Size budgets measured on the MacBook Pro after the merge: boot 294.7 kB, page 9.0 kB, all JS 1259.4 kB; 16 unit tests and the type check pass"],"next_action":"When pull request 216 merges and deploys, check the live page: stations, hour strip, error by conditions, worst stops and the MTA comparison","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T11:21:54Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"10ab0ef1e70f104b1701a684c07093b21cb6ae35761cac1f29f62123deba0425","request_id":"f75fc1d444e04161bffb70b10e6a2936","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The page branch is up to date with main and inside every size budget

Evidence:
- Size budgets measured on the MacBook Pro after the merge: boot 294.7 kB, page 9.0 kB, all JS 1259.4 kB; 16 unit tests and the type check pass

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- When pull request 216 merges and deploys, check the live page: stations, hour strip, error by conditions, worst stops and the MTA comparison

### 2026-11-15 11:22:57 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The page branch is up to date with main and inside every size budget main already has"],"decisions":["no new decisions"],"evidence":["Measured on the MacBook Pro after the merge: boot 294.6 kB of 295, page 9.1 kB of 10, all JS 1260.2 kB of 1262; the type check is clean and 16 unit tests pass"],"next_action":"When pull request 216 merges and deploys, check the live page: stations, hour strip, error by conditions, worst stops and the MTA comparison","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T11:22:57Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"b1102f66b03e068f1394455e0b99825444669bbd2322e7d7e90f88572066b002","request_id":"e3a88558bf5248d78c52da73b68ca9a3","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The page branch is up to date with main and inside every size budget main already has

Evidence:
- Measured on the MacBook Pro after the merge: boot 294.6 kB of 295, page 9.1 kB of 10, all JS 1260.2 kB of 1262; the type check is clean and 16 unit tests pass

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- When pull request 216 merges and deploys, check the live page: stations, hour strip, error by conditions, worst stops and the MTA comparison

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
