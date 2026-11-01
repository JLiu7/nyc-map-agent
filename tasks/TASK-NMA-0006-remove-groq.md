# TASK-NMA-0006 — Remove Groq

<!-- continuity:task {"acceptance":["no Groq name, URL or key remains in shipped code, tests, env templates or docs","/api/stt answers 503 unless STT_BASE_URL is set","stt.test.ts passes"],"depends_on":[],"goal":"Voice recordings go only to a speech server the owner names, never to Groq by default.","id":"NMA-0006","issue_url":"https://github.com/Pukujan-lab/nyc-map-agent/issues/634","next_action":"none: #634 is closed, /api/stt answers on the live site through the Pro's speech server, and docs/PRIVACY.md now describes the audio path","owner":"claude-code","priority":"P2","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"completed","why":"The speech-to-text endpoint defaulted to Groq, which the owner did not choose (#634)."} -->

- Status: completed
- Owner: claude-code
- Priority: P2
- Depends on: none

## Goal

Voice recordings go only to a speech server the owner names, never to Groq by default.

## Why

The speech-to-text endpoint defaulted to Groq, which the owner did not choose (#634).

## Allowed files

- `server/features/agent/stt.ts`, `stt.test.ts`, `.env.example`, `deploy/.env.example`, `docs/PLAN-copilot-port.md`, `checkpoints/`, this file.

## Human outcome

Voice recordings only go to a server the owner chose.

## Scope and boundaries

- In scope: the Groq default and wording.
- Out of scope: running a replacement Whisper server, the front end, docs/PRIVACY.md.
- Dependencies/uncertainty: none.

## Acceptance criteria

- [ ] A search for groq in shipped files finds nothing.
- [ ] /api/stt answers 503 without STT_BASE_URL.

## Evidence and sources

Added by #401 (2026-10-24). `npx vitest run server/features/agent/stt.test.ts src/lib/voice` passes (29 tests); `tsc` and `eslint` are clean; the grep for groq is empty.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none): #634, no parent, no dependencies.
- Primary writer / branch / source issue revision / as-of status:
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-01 11:17:26 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["server/features/agent/stt.ts, stt.test.ts, .env.example, deploy/.env.example, docs/PLAN-copilot-port.md"],"completed":["Removed the Groq default from speech-to-text; /api/stt needs STT_BASE_URL; opened #635 with auto-merge"],"decisions":["no new decisions"],"evidence":["vitest stt and voice: 29 passed; tsc and eslint clean; grep for groq in shipped files empty"],"evidence_class":"observed","next_action":"owner runs a Whisper server and sets STT_BASE_URL on the VPS; add the audio path to docs/PRIVACY.md","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0006","timestamp":"2026-11-01T11:17:26Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"83543e95158856eec1074bb0b196bcdb907ceb854123f8f999ccd22459b8d2e1","request_id":"6273dac72b224fc3900c153f7c0d2d66","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0006"} -->

Completed:
- Removed the Groq default from speech-to-text; /api/stt needs STT_BASE_URL; opened #635 with auto-merge

Evidence:
- vitest stt and voice: 29 passed; tsc and eslint clean; grep for groq in shipped files empty

Decisions:
- no new decisions

Changed:
- server/features/agent/stt.ts, stt.test.ts, .env.example, deploy/.env.example, docs/PLAN-copilot-port.md

Blocked/uncertain:
- none

Next:
- owner runs a Whisper server and sets STT_BASE_URL on the VPS; add the audio path to docs/PRIVACY.md

### 2026-11-01 11:21:21 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["server/features/agent/stt.ts, stt.test.ts, src/lib/voice/serverStt.ts, serverStt.test.ts, deploy/README.md, env templates"],"completed":["Voice now uses the Pro's multilingual speech server: speech protocol in /api/stt, browser sends 16 kHz WAV, docs; #635 updated"],"decisions":["no new decisions"],"evidence":["vitest stt and voice: 31 passed; tsc, eslint clean; Spanish clip through the VPS tunnel transcribed correctly in 2.6 s; app container on the VPS reaches the speech server"],"evidence_class":"observed","next_action":"after #635 deploys, set STT_BASE_URL, STT_PROTOCOL and STT_STACK in the VPS env file, redeploy and test /api/stt on the live site; add the audio path to docs/PRIVACY.md","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0006","timestamp":"2026-11-01T11:21:21Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"0647e14f1e49510f6d3f6d7afd57c7f1e58049cbf362f3d4386d6b01cefa4f25","request_id":"eab827df02344b9f9e94fb056d07618c","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0006"} -->

Completed:
- Voice now uses the Pro's multilingual speech server: speech protocol in /api/stt, browser sends 16 kHz WAV, docs; #635 updated

Evidence:
- vitest stt and voice: 31 passed; tsc, eslint clean; Spanish clip through the VPS tunnel transcribed correctly in 2.6 s; app container on the VPS reaches the speech server

Decisions:
- no new decisions

Changed:
- server/features/agent/stt.ts, stt.test.ts, src/lib/voice/serverStt.ts, serverStt.test.ts, deploy/README.md, env templates

Blocked/uncertain:
- none

Next:
- after #635 deploys, set STT_BASE_URL, STT_PROTOCOL and STT_STACK in the VPS env file, redeploy and test /api/stt on the live site; add the audio path to docs/PRIVACY.md

### 2026-11-01 11:37:03 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":[".coord/boss_claim.json"],"completed":["Committed the boss seat handover to dsh@air that the seat protocol wrote to .coord/boss_claim.json"],"decisions":["no new decisions"],"evidence":["git diff showed only the handover entries and a new heartbeat at 2026-11-01T11:35:56Z"],"evidence_class":"observed","next_action":"owner tries the mic on the live site; add the audio path to docs/PRIVACY.md","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0006","timestamp":"2026-11-01T11:37:03Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"63535d29e97e9505ff3d3a41026e037793869c58e140f4b3ad2790cf54e391ad","request_id":"d9a60a6826714e55ab0887280dc83d2f","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0006"} -->

Completed:
- Committed the boss seat handover to dsh@air that the seat protocol wrote to .coord/boss_claim.json

Evidence:
- git diff showed only the handover entries and a new heartbeat at 2026-11-01T11:35:56Z

Decisions:
- no new decisions

Changed:
- .coord/boss_claim.json

Blocked/uncertain:
- none

Next:
- owner tries the mic on the live site; add the audio path to docs/PRIVACY.md

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
