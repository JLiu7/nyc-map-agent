# TASK-NMA-0017 — Spoken Answers

<!-- continuity:task {"acceptance":["answers show and speak station shorthand in full","Kokoro reads English, Spanish, French and Chinese answers through POST /api/tts","other languages and a down speech server fall back to the browser voice"],"depends_on":[],"goal":"Spell out station and street shorthand in answers and speech, and read answers with Kokoro instead of the browser voice","id":"NMA-0017","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/37","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"claude-code","priority":"medium","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Riders read and hear Sq, Hts, Av and a flat browser voice; the owner asked for full words and a better voice"} -->

- Status: active
- Owner: claude-code
- Priority: medium
- Depends on: none

## Goal

Spell out station and street shorthand in answers and speech, and read answers with Kokoro instead of the browser voice

## Why

Riders read and hear Sq, Hts, Av and a flat browser voice; the owner asked for full words and a better voice

## Allowed files

- `src/lib/streetName.ts`, `src/lib/voice/{kokoro,useSpeech}.ts`, `src/features/agent/{AgentHome,AgentOverlay}.tsx`
- `server/features/agent/{tts,prompt}.ts`, `server/app.ts`, `server/openapi.ts`, tests and `e2e/responsive.spec.ts`

## Human outcome

Answers read and sound like a person: full words on screen, a natural voice aloud.

## Scope and boundaries

- In scope: station and street names in answers and speech; Kokoro through the copilot speech server STT already uses.
- Out of scope: Russian, Bengali, Haitian Creole and Korean voices; the warning lines in Underground and wrong-way, which still use the browser voice.
- Dependencies/uncertainty: the Pro's speech server must be up behind the VPS tunnel; the first call took 6 s while the model loaded.

## Acceptance criteria

- [x] Full station words in the answer card (e2e at four sizes).
- [x] /api/tts streams the speech server's audio, with tests for 200, 400, 415, 502 and 503.
- [x] Browser voice takes every other language and any failure.

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

### 2026-11-02 00:53:46 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["station formatter, /api/tts, Kokoro player, prompt"],"completed":["Answers now show and speak station shorthand in full, and Kokoro reads English, Spanish, French and Chinese answers through a new voice route"],"decisions":["no new decisions"],"evidence":["1620 unit tests pass; the station-name answer passes the layout check at four sizes; Kokoro answered from the VPS for English and Spanish"],"evidence_class":"observed","next_action":"Open the pull request, then listen to it on the phone once the PR is deployed","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0017","timestamp":"2026-11-02T00:53:46Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"aa06b06a628c878666b934868fe98e2bd532eb265ad7fed30889671d9da4b57d","request_id":"d7dc546f04e5469d949994c71d457f7a","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0017"} -->

Completed:
- Answers now show and speak station shorthand in full, and Kokoro reads English, Spanish, French and Chinese answers through a new voice route

Evidence:
- 1620 unit tests pass; the station-name answer passes the layout check at four sizes; Kokoro answered from the VPS for English and Spanish

Decisions:
- no new decisions

Changed:
- station formatter, /api/tts, Kokoro player, prompt

Blocked/uncertain:
- none

Next:
- Open the pull request, then listen to it on the phone once the PR is deployed

### 2026-11-02 01:25:22 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["e2e expectations, size limits, generated API files"],"completed":["The voice branch is rebased onto the merged model switch, three end-to-end checks now expect the spelled-out street names, and the size limits fit both changes"],"decisions":["no new decisions"],"evidence":["After the rebase: 1634 unit tests pass, no module-boundary violations, every size limit met; the four spelled-out-name specs passed locally before it"],"evidence_class":"observed","next_action":"Wait for the pull request's checks to pass and auto-merge, then listen to the Kokoro voice on a phone once deployed","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0017","timestamp":"2026-11-02T01:25:22Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"309c59ca4de1386c0f104c412883a1384dd6c76dcd8f476db2afb7c5c8b96fa9","request_id":"186e4491163c4a36adb4247ee4755530","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0017"} -->

Completed:
- The voice branch is rebased onto the merged model switch, three end-to-end checks now expect the spelled-out street names, and the size limits fit both changes

Evidence:
- After the rebase: 1634 unit tests pass, no module-boundary violations, every size limit met; the four spelled-out-name specs passed locally before it

Decisions:
- no new decisions

Changed:
- e2e expectations, size limits, generated API files

Blocked/uncertain:
- none

Next:
- Wait for the pull request's checks to pass and auto-merge, then listen to the Kokoro voice on a phone once deployed

### 2026-11-03 21:24:31 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["checkpoints/CURRENT.md"],"completed":["CURRENT.md now says the model switch and the spoken answers are merged, that the four smart keys are in the VPS env, and what is still open"],"decisions":["no new decisions"],"evidence":["Only checkpoints/CURRENT.md changed; the pull request has auto-merge on"],"evidence_class":"observed","next_action":"Wait for the pull request to merge, then listen to the Kokoro voice on a phone once the build deploys","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0017","timestamp":"2026-11-03T21:24:31Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"faa9a1f32d77806999f2d2cee832f118cf08b25dcf0f54f701530d96859c5fa3","request_id":"4e5af9f826ce490f8bc115145f1d86c2","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0017"} -->

Completed:
- CURRENT.md now says the model switch and the spoken answers are merged, that the four smart keys are in the VPS env, and what is still open

Evidence:
- Only checkpoints/CURRENT.md changed; the pull request has auto-merge on

Decisions:
- no new decisions

Changed:
- checkpoints/CURRENT.md

Blocked/uncertain:
- none

Next:
- Wait for the pull request to merge, then listen to the Kokoro voice on a phone once the build deploys

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
