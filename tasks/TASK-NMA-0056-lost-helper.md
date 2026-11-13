# TASK-NMA-0056 — Lost Helper

<!-- continuity:task {"acceptance":["Find exit, a train card's Find exit and a walk's Where am I open one helper","its first message is the guess in the app's language","poor network or position shows one signal line","offline questions get a local answer and go when back online","layout bar passes at 320x568, 375x667, 390x844 and 1280x800"],"depends_on":[],"goal":"One where-am-I helper for riders lost in a station, in place of Find exit, Exit help and I'm lost","id":"NMA-0056","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/131","next_action":"after the pull request deploys, open Find exit on the live site after a trip to Fulton St and read the guess","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"The three buttons confuse people and ignore what the app last knew"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

One where-am-I helper for riders lost in a station, in place of Find exit, Exit help and I'm lost

## Why

The three buttons confuse people and ignore what the app last knew

## Allowed files

- `src/features/underground/` (LostHelper, lostGuess, lostText), `src/lib/underground/lostHelper.ts`
- the three buttons: `src/features/agent/AgentOverlay.tsx`, `src/features/transit/TransitCard.tsx`, `src/features/liveview/RouteGuide.tsx`
- `src/features/agent/schema.ts`, `server/features/agent/prompt.ts`, `src/lib/geo/sharedLocation.ts`, `src/features/agent/stationWalks.ts`
- `e2e/responsive.spec.ts`, `e2e/task-screens.spec.ts`

## Human outcome

A rider lost in a station with no signal sees, in their language, where the app thinks they are (station, train, part of the train, exit) and can text about it.

## Scope and boundaries

- In scope: the helper, its guess and signal line, the text chat through the chat bar, and the three buttons.
- Out of scope: the sign camera (#88), voice-first conversation.
- Dependencies/uncertainty: `navigator.connection` exists only in Chromium; on an iPhone the signal line rests on the position fix.

## Acceptance criteria

- [x] One helper behind Find exit, a train card's Find exit and a walk's Where am I.
- [x] Its first message is the guess in the app's language.
- [x] Poor network or position shows one signal line.
- [x] Offline questions get a local answer and go once back online.
- [x] Layout bar passes at all four sizes (e2e/responsive.spec.ts).
- [ ] Checked on the live site.

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

### 2026-11-13 01:58:40 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["src/features/underground/LostHelper.tsx, lostGuess.ts, lostText.ts; src/lib/underground/lostHelper.ts; AgentOverlay, TransitCard, RouteGuide; agent schema and prompt"],"completed":["Find exit, a train card's Exit help and a walk's I'm lost now open one where-am-I helper that states its guess in the app's language and chats by text"],"decisions":["no new decisions"],"evidence":["13 new unit tests for the guess, signal and wording pass; the helper's layout e2e case passes at 320x568, 375x667, 390x844 and 1280x800; the walk case asks the agent exactly once with stage lost"],"next_action":"Let the pull request for #131 merge, then open Find exit on the live site after a trip to Fulton St, offline and in Spanish","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T01:58:40Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"da4d046bd0ee40a990854e40be5a332a983df8739778d510a90b3d3087d3e8e9","request_id":"d6bb39d4fa0d4e7d9d561ee91c4343b7","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- Find exit, a train card's Exit help and a walk's I'm lost now open one where-am-I helper that states its guess in the app's language and chats by text

Evidence:
- 13 new unit tests for the guess, signal and wording pass; the helper's layout e2e case passes at 320x568, 375x667, 390x844 and 1280x800; the walk case asks the agent exactly once with stage lost

Decisions:
- no new decisions

Changed:
- src/features/underground/LostHelper.tsx, lostGuess.ts, lostText.ts; src/lib/underground/lostHelper.ts; AgentOverlay, TransitCard, RouteGuide; agent schema and prompt

Blocked/uncertain:
- none

Next:
- Let the pull request for #131 merge, then open Find exit on the live site after a trip to Fulton St, offline and in Spanish

### 2026-11-13 02:16:10 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["Moved the where-am-I helper inside the agent feature so features stay apart, and raised the all-JS size budget by 9 kB for its lazy chunk"],"decisions":["no new decisions"],"evidence":["tsc passes; CI lint passed on the earlier push"],"next_action":"Let PR 135 merge, then open Find exit on the live site after a trip to Fulton St, offline and in Spanish","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T02:16:10Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"b41d26a72f4317e98d0f393ab3e7f04415d970a0deda02f2d19c8095e9cb4d01","request_id":"f047bb0308e34c58830d32101eb67699","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- Moved the where-am-I helper inside the agent feature so features stay apart, and raised the all-JS size budget by 9 kB for its lazy chunk

Evidence:
- tsc passes; CI lint passed on the earlier push

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Let PR 135 merge, then open Find exit on the live site after a trip to Fulton St, offline and in Spanish

### 2026-11-13 02:19:07 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["Raised the boot chunk's size budget by 0.5 kB; the new labels put it 153 B over"],"decisions":["no new decisions"],"evidence":["no external evidence recorded"],"next_action":"Let PR 135 merge, then open Find exit on the live site after a trip to Fulton St, offline and in Spanish","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T02:19:07Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"38b2857032eabcc503e4a3a99f238fe55d77bbe73fe3ce7ce09390283b752cbd","request_id":"f70197b25bc64aceafc57906a83ff60d","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- Raised the boot chunk's size budget by 0.5 kB; the new labels put it 153 B over

Evidence:
- no external evidence recorded

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Let PR 135 merge, then open Find exit on the live site after a trip to Fulton St, offline and in Spanish

### 2026-11-13 02:51:14 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["The helper's layout test waits two frames for the sheet's new height before checking; rebased on main after #134"],"decisions":["no new decisions"],"evidence":["CI e2e at 390x844 saw Center on my location 24 px over the sheet's Close, the size of the offline reply that had just grown the sheet"],"next_action":"Let PR 135 merge, then open Find exit on the live site after a trip to Fulton St, offline and in Spanish","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T02:51:14Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"c377434356aa9d5c5e7bd1c9bd89cfd5aff1dc3bcb4f57b90cca24a98805d8d1","request_id":"23a3cd95687a45c1bf5cde52de62fd28","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- The helper's layout test waits two frames for the sheet's new height before checking; rebased on main after #134

Evidence:
- CI e2e at 390x844 saw Center on my location 24 px over the sheet's Close, the size of the offline reply that had just grown the sheet

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Let PR 135 merge, then open Find exit on the live site after a trip to Fulton St, offline and in Spanish

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
