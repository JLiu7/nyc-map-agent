# TASK-NMA-0056 — Offline Stations

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"Station data, step translations and spoken steps work without the server once seen","id":"NMA-0056","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/132","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Below the street the signal drops, and the Fulton St walk needed the network to play"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

Station data, step translations and spoken steps work without the server once seen

## Why

Below the street the signal drops, and the Fulton St walk needed the network to play

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

### 2026-11-13 02:38:35 UTC — agent:claude-code/90e3e9c8-8798-441c-bc53-8ed604803638

<!-- continuity:checkpoint {"agent":"agent:claude-code/90e3e9c8-8798-441c-bc53-8ed604803638","blocked":[],"changed":["public/sw.js, src/lib/offline/worker.ts, src/lib/i18n/translateLines.ts, src/lib/voice/kokoro.ts, src/lib/voice/voiceKeep.ts, src/features/agent/usePlayer.ts, e2e/offline-replay.spec.ts"],"completed":["The Fulton St walk replays with the network off: the offline worker is registered for every visit and keeps the station model, and step translations and spoken steps stay on the phone"],"decisions":["no new decisions"],"evidence":["e2e/offline-replay.spec.ts passes locally (loads a Grand Central to Fulton St trip, goes offline, the dollhouse layer appears); unit tests for sw.js, translateLines and the voice store pass (284 in the touched areas); boot chunk 280.49 kB of 280.5 kB"],"next_action":"Let the pull request for #132 merge, then replay the Fulton St walk on the live site with the network off","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T02:38:35Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"d463767d3b6d7fc24b64cae90a29f8f27cd331254e5a60c737630954e7e021df","request_id":"4e07441875124b738ef28e4e81a8db58","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- The Fulton St walk replays with the network off: the offline worker is registered for every visit and keeps the station model, and step translations and spoken steps stay on the phone

Evidence:
- e2e/offline-replay.spec.ts passes locally (loads a Grand Central to Fulton St trip, goes offline, the dollhouse layer appears); unit tests for sw.js, translateLines and the voice store pass (284 in the touched areas); boot chunk 280.49 kB of 280.5 kB

Decisions:
- no new decisions

Changed:
- public/sw.js, src/lib/offline/worker.ts, src/lib/i18n/translateLines.ts, src/lib/voice/kokoro.ts, src/lib/voice/voiceKeep.ts, src/features/agent/usePlayer.ts, e2e/offline-replay.spec.ts

Blocked/uncertain:
- none

Next:
- Let the pull request for #132 merge, then replay the Fulton St walk on the live site with the network off

### 2026-11-13 02:40:49 UTC — agent:claude-code/90e3e9c8-8798-441c-bc53-8ed604803638

<!-- continuity:checkpoint {"agent":"agent:claude-code/90e3e9c8-8798-441c-bc53-8ed604803638","blocked":[],"changed":["public/sw.js, src/lib/offline/worker.ts, src/lib/i18n/translateLines.ts, src/lib/voice/kokoro.ts, src/lib/voice/voiceKeep.ts, src/features/agent/usePlayer.ts, e2e/offline-replay.spec.ts"],"completed":["The Fulton St walk replays with the network off: the offline worker is registered for every visit and keeps the station model, and step translations and spoken steps stay on the phone"],"decisions":["no new decisions"],"evidence":["e2e/offline-replay.spec.ts passes locally on top of #134 (loads a Grand Central to Fulton St trip, goes offline, the dollhouse layer appears in 16 s); unit tests in the touched areas pass (284); boot chunk 280.49 kB of 280.5 kB"],"next_action":"Let the pull request for #132 merge, then replay the Fulton St walk on the live site with the network off","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T02:40:49Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"0d80a9f349b48b4aabd946f26574cffe88ccbff8df8440931962da0d5d3474d4","request_id":"2063b3e3e74840ed9a1c7851fa8fd684","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- The Fulton St walk replays with the network off: the offline worker is registered for every visit and keeps the station model, and step translations and spoken steps stay on the phone

Evidence:
- e2e/offline-replay.spec.ts passes locally on top of #134 (loads a Grand Central to Fulton St trip, goes offline, the dollhouse layer appears in 16 s); unit tests in the touched areas pass (284); boot chunk 280.49 kB of 280.5 kB

Decisions:
- no new decisions

Changed:
- public/sw.js, src/lib/offline/worker.ts, src/lib/i18n/translateLines.ts, src/lib/voice/kokoro.ts, src/lib/voice/voiceKeep.ts, src/features/agent/usePlayer.ts, e2e/offline-replay.spec.ts

Blocked/uncertain:
- none

Next:
- Let the pull request for #132 merge, then replay the Fulton St walk on the live site with the network off

### 2026-11-13 13:06:20 UTC — agent:claude-code/90e3e9c8-8798-441c-bc53-8ed604803638

<!-- continuity:checkpoint {"agent":"agent:claude-code/90e3e9c8-8798-441c-bc53-8ed604803638","blocked":[],"changed":["none"],"completed":["The Fulton St walk plays with no signal once its trip card has shown (#132): #137 kept station files, spoken steps and translations in the offline worker; #154 sent /sw.js with no-cache; #157 steadied the street-shops test; #158 fetched the walk on the trip card; #159 translated its steps there"],"decisions":["Voice is kept once spoken, not fetched ahead of Play, because live speech takes 20 s or more a line"],"evidence":["Live site 2026-11-13 13:00Z, worker uw-2 in control, network off before Play: the dollhouse walk ran from the platform to the E exit on Fulton Street (12 screenshots, steps advancing, no page errors). Origin sends cache-control: no-cache for /sw.js (checked on the nyc-map-web container). e2e/offline-replay.spec.ts passes both cases"],"next_action":"After #159 deploys, repeat the live check in Spanish with the network off before Play; then close #132","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T13:06:20Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"742d69e575c5da4768b467e933220c0e73e990e24f54d313f17e2654b1dd4120","request_id":"11b11a734a0c4db3bc61042b82663c4c","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- The Fulton St walk plays with no signal once its trip card has shown (#132): #137 kept station files, spoken steps and translations in the offline worker; #154 sent /sw.js with no-cache; #157 steadied the street-shops test; #158 fetched the walk on the trip card; #159 translated its steps there

Evidence:
- Live site 2026-11-13 13:00Z, worker uw-2 in control, network off before Play: the dollhouse walk ran from the platform to the E exit on Fulton Street (12 screenshots, steps advancing, no page errors). Origin sends cache-control: no-cache for /sw.js (checked on the nyc-map-web container). e2e/offline-replay.spec.ts passes both cases

Decisions:
- Voice is kept once spoken, not fetched ahead of Play, because live speech takes 20 s or more a line

Changed:
- none

Blocked/uncertain:
- none

Next:
- After #159 deploys, repeat the live check in Spanish with the network off before Play; then close #132

Update 13:30Z: #159 deployed; the live check in Spanish passed twice (steps read in Spanish with the network off, dollhouse walk on screen). One earlier Spanish run showed no preview after Play and its log was cut short; not reproduced. #132 closed.

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
