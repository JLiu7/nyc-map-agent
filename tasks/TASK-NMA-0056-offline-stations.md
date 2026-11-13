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

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
