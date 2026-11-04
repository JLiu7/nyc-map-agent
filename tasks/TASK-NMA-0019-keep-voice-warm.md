# TASK-NMA-0019 — Keep Voice Warm

<!-- continuity:task {"acceptance":["the speech server default stack is multilingual","the app asks the speech server to load its stack at start and every four minutes","a new sentence starts within a second when the stack is loaded"],"depends_on":[],"goal":"Keep the speech server on this app's voice stack so the first spoken answer does not wait for a model swap","id":"NMA-0019","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/48","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"claude-code","priority":"medium","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"A swap costs the next rider about 6 s of silence whenever the copilot demo used the shared server"} -->

- Status: active
- Owner: claude-code
- Priority: medium
- Depends on: none

## Goal

Keep the speech server on this app's voice stack so the first spoken answer does not wait for a model swap

## Why

A swap costs the next rider about 6 s of silence whenever the copilot demo used the shared server

## Allowed files

- `server/features/agent/tts.ts`, its test, `server/app.ts`
- On the Pro: `speech/stacks.json` default (backed up as `stacks.json.bak-2026-11-04`)

## Human outcome

The first spoken answer starts at once instead of after a six-second model swap.

## Scope and boundaries

- In scope:
- Out of scope:
- Dependencies/uncertainty:

## Acceptance criteria

- [x] Default stack on the Pro is multilingual; after loading it, new sentences started in about 1 ms and took 0.65 s.
- [x] `warmVoice` and `startVoiceKeeper` with tests (200, error, refused, no server set).

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

### 2026-11-04 16:26:40 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["tts.ts keeper, app start, stacks.json default on the Pro"],"completed":["The speech server on the Pro now defaults to the Whisper and Kokoro stack and has it loaded, and the app keeps it loaded by asking every four minutes"],"decisions":["no new decisions"],"evidence":["New sentences started in about 1 ms and took 0.65 s after the swap; 464 server tests pass"],"evidence_class":"observed","next_action":"Open the pull request, then watch the speech server's last_swap on /health to see whether the copilot demo pulls it back","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0019","timestamp":"2026-11-04T16:26:40Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"5456bf0f004bf6592bec4b9a079ba99263c9ee1f325f5bbf99dfcd446fc00dc9","request_id":"e6d1838c89144715ae6231307bd2bfe0","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0019"} -->

Completed:
- The speech server on the Pro now defaults to the Whisper and Kokoro stack and has it loaded, and the app keeps it loaded by asking every four minutes

Evidence:
- New sentences started in about 1 ms and took 0.65 s after the swap; 464 server tests pass

Decisions:
- no new decisions

Changed:
- tts.ts keeper, app start, stacks.json default on the Pro

Blocked/uncertain:
- none

Next:
- Open the pull request, then watch the speech server's last_swap on /health to see whether the copilot demo pulls it back

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
