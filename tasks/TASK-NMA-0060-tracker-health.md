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

### 2026-11-15 05:25:18 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["Scores store notice, weather and traffic; the accuracy answer splits by them and lists stops; an endpoint gives samples per hour"],"decisions":["no new decisions"],"evidence":["68 unit tests in the transit server folder pass; the migration ran on the VPS database in a rolled-back transaction; a subway backtest found band and hour pooling equal"],"next_action":"After it merges, run nyc-job.sh update on the VPS between runs and read the first rows with conditions; then show the splits, stops and hours on the page","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T05:25:18Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"53f41c6bc6a9760581831a2ddccf5e625596d601ebc9974ad695ad8aaab6761b","request_id":"f6634b0c494849069b354eb604b2dbe0","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- Scores store notice, weather and traffic; the accuracy answer splits by them and lists stops; an endpoint gives samples per hour

Evidence:
- 68 unit tests in the transit server folder pass; the migration ran on the VPS database in a rolled-back transaction; a subway backtest found band and hour pooling equal

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- After it merges, run nyc-job.sh update on the VPS between runs and read the first rows with conditions; then show the splits, stops and hours on the page

### 2026-11-15 05:39:32 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The conditions migration now reverses cleanly, which the migrations check failed on"],"decisions":["no new decisions"],"evidence":["Up, down, up ran on the VPS database in a rolled-back transaction"],"next_action":"When pull requests 214 and 215 merge, merge main into 216 and 217, run nyc-job.sh update on the VPS between runs, and read the first rows with conditions","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T05:39:32Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"2940e306f423241efaa5d8477241fa2999bf0a382d7870e464334a32d95b1674","request_id":"3c8b806d78104eb98fea7969a8539847","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The conditions migration now reverses cleanly, which the migrations check failed on

Evidence:
- Up, down, up ran on the VPS database in a rolled-back transaction

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- When pull requests 214 and 215 merge, merge main into 216 and 217, run nyc-job.sh update on the VPS between runs, and read the first rows with conditions

### 2026-11-15 06:35:29 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The accuracy answer keeps its existing groups; condition splits are a new list"],"decisions":["no new decisions"],"evidence":["68 unit tests pass; the API check failed only on the added group names, which are no longer added"],"next_action":"When pull requests 214 and 215 merge, merge main into 216 and 217, run nyc-job.sh update on the VPS between runs, and read the first rows with conditions","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T06:35:29Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"dc899fe75222cfeb4ba650c540c945efb61f36da023217deaa7c34ff6da60c26","request_id":"b814c69497ba4033bc33032da0d86b19","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The accuracy answer keeps its existing groups; condition splits are a new list

Evidence:
- 68 unit tests pass; the API check failed only on the added group names, which are no longer added

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- When pull requests 214 and 215 merge, merge main into 216 and 217, run nyc-job.sh update on the VPS between runs, and read the first rows with conditions

### 2026-11-15 06:35:38 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The accuracy answer keeps its existing groups; condition splits are a new list"],"decisions":["no new decisions"],"evidence":["68 unit tests pass; the API check failed only on the added group names, which are no longer added"],"next_action":"When pull requests 214 and 215 merge, merge main into 216 and 217, run nyc-job.sh update on the VPS between runs, and read the first rows with conditions","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T06:35:38Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"dc899fe75222cfeb4ba650c540c945efb61f36da023217deaa7c34ff6da60c26","request_id":"6baa4366d2d64baaa57adc15e64f4e39","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The accuracy answer keeps its existing groups; condition splits are a new list

Evidence:
- 68 unit tests pass; the API check failed only on the added group names, which are no longer added

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- When pull requests 214 and 215 merge, merge main into 216 and 217, run nyc-job.sh update on the VPS between runs, and read the first rows with conditions

### 2026-11-15 06:36:20 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The bus speeds branch carries the API fix and current main"],"decisions":["no new decisions"],"evidence":["72 unit tests pass and the API spec is regenerated"],"next_action":"When pull requests 214 and 215 merge, merge main into 216 and 217, run nyc-job.sh update on the VPS between runs, and read the first rows with conditions","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T06:36:20Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"c7f24326c71a420ca7c4d01f4894892ff1f1e5e4a2104d225d6474302b4dbcdf","request_id":"30c2fb635a6e42d3b7871e9647afd2d3","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The bus speeds branch carries the API fix and current main

Evidence:
- 72 unit tests pass and the API spec is regenerated

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- When pull requests 214 and 215 merge, merge main into 216 and 217, run nyc-job.sh update on the VPS between runs, and read the first rows with conditions

### 2026-11-15 07:13:14 UTC — agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68

<!-- continuity:checkpoint {"agent":"agent:claude-code/452cd4bc-f008-4a98-a16c-13cbabce5e68","blocked":[],"changed":["none"],"completed":["The server branch (conditions, per-hour counts, MTA bus speeds) is up to date with main and first in line"],"decisions":["no new decisions"],"evidence":["72 unit tests pass after merging the bus session's estimator change; the API spec is current"],"next_action":"When pull request 217 merges, run nyc-job.sh update on the VPS between runs, then bring pull request 216 up to date with main","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0060","timestamp":"2026-11-15T07:13:14Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"09ee4cdb4865c9d6e699256f577d67a678da4c6224d6b8f099ff6e9f3ef0e60b","request_id":"a2d994a949094771b014912c1894cce6","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0060"} -->

Completed:
- The server branch (conditions, per-hour counts, MTA bus speeds) is up to date with main and first in line

Evidence:
- 72 unit tests pass after merging the bus session's estimator change; the API spec is current

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- When pull request 217 merges, run nyc-job.sh update on the VPS between runs, then bring pull request 216 up to date with main

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
