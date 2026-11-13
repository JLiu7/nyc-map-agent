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

### 2026-11-13 03:25:10 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["#135 merged and deployed; the live check found Find exit lost the trip once its card closed; PR 140 keeps the last trip for three hours"],"decisions":["no new decisions"],"evidence":["no external evidence recorded"],"next_action":"Let PR 140 merge, then repeat the live check: trip to Fulton St, close the card, Find exit, then offline and in Spanish","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T03:25:10Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"1f60a6be88e7eee55b986eda4f1dbb5db80d3e458d231c53684db551dfa1f974","request_id":"0c832866883047fd80de614e4e0af28a","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- #135 merged and deployed; the live check found Find exit lost the trip once its card closed; PR 140 keeps the last trip for three hours

Evidence:
- no external evidence recorded

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Let PR 140 merge, then repeat the live check: trip to Fulton St, close the card, Find exit, then offline and in Spanish

### 2026-11-13 04:15:43 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["At Fulton St the where-am-I helper asks tap questions and the nearest sign's words, then says where in the station you probably are and the steps to the exit (pull request #144)"],"decisions":["no new decisions"],"evidence":["Placement replays: 65% of spots land in the right stretch with no trip known, 90% on the trip's walk; changed unit tests pass (stationPlace, placeFlow, prompt)"],"next_action":"After #144 merges, pin down a spot inside Fulton St on the live site: Find exit, Yes, answer the questions, then Show me","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T04:15:43Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"81b7560693fa8f3cd17c7f91f75a98454f2a4f1ffafba8fb01343ffa50778b05","request_id":"2b22dbf58640456bab3cb1c89d773391","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- At Fulton St the where-am-I helper asks tap questions and the nearest sign's words, then says where in the station you probably are and the steps to the exit (pull request #144)

Evidence:
- Placement replays: 65% of spots land in the right stretch with no trip known, 90% on the trip's walk; changed unit tests pass (stationPlace, placeFlow, prompt)

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- After #144 merges, pin down a spot inside Fulton St on the live site: Find exit, Yes, answer the questions, then Show me

### 2026-11-13 04:19:28 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["Raised the all-JS size budget from 1171 kB to 1180 kB for the Fulton St questions (#144), whose new code loads only at Fulton St"],"decisions":["no new decisions"],"evidence":["CI size check: all JS was 8.21 kB over 1171 kB; every per-chunk budget passed"],"next_action":"After #144 merges, pin down a spot inside Fulton St on the live site: Find exit, Yes, answer the questions, then Show me","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T04:19:28Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"e60556281916bf533f7557f2839dfe0fbd2f893800df7de6e0c16073de824c4f","request_id":"2f48208b2d4549c3ab2b46d84e764f7e","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- Raised the all-JS size budget from 1171 kB to 1180 kB for the Fulton St questions (#144), whose new code loads only at Fulton St

Evidence:
- CI size check: all JS was 8.21 kB over 1171 kB; every per-chunk budget passed

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- After #144 merges, pin down a spot inside Fulton St on the live site: Find exit, Yes, answer the questions, then Show me

### 2026-11-13 06:50:24 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["Merged main (with the 45-minute e2e limit from #152) into feat/lost-pin-in-station so its checks run again"],"decisions":["no new decisions"],"evidence":["Merge conflicts in CURRENT.md and the all-JS size limit resolved; the changed unit tests pass"],"next_action":"After #144 and #149 merge, run Find exit after a Grand Central to Fulton St trip on the live site and answer the questions","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T06:50:24Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"93789232513d6d143ac9fdc55b97ceae970d076f628aa3d324d7b0bd741f3d49","request_id":"8269d86b09fb4303b24e73aa9ee64c7a","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- Merged main (with the 45-minute e2e limit from #152) into feat/lost-pin-in-station so its checks run again

Evidence:
- Merge conflicts in CURRENT.md and the all-JS size limit resolved; the changed unit tests pass

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- After #144 and #149 merge, run Find exit after a Grand Central to Fulton St trip on the live site and answer the questions

### 2026-11-13 07:54:42 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["Merged main (with #155's pull sheet layout fix) into the Fulton St placement branch; CURRENT.md keeps both entries"],"decisions":["no new decisions"],"evidence":["no external evidence recorded"],"next_action":"Let CI pass and auto-merge #144, then check the placement questions at Fulton St on the live site and post the receipt on #143","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T07:54:42Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"e2bb82b4733769ad87427b8426065948541b864844a5c286d6dabc34a9e6e0f9","request_id":"ad4de3be461648dba30bb2d29413e5db","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- Merged main (with #155's pull sheet layout fix) into the Fulton St placement branch; CURRENT.md keeps both entries

Evidence:
- no external evidence recorded

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Let CI pass and auto-merge #144, then check the placement questions at Fulton St on the live site and post the receipt on #143

### 2026-11-13 08:34:15 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["#144 merged; merged main into fix/lost-guess-trip-without-subway again. The task record takes main's copy; this branch's earlier entries (the M15 trip that ended at Fulton St station with no subway exit, and the destination-station guess) are in #149's commits"],"decisions":["no new decisions"],"evidence":["no external evidence recorded"],"next_action":"Let CI pass and auto-merge #149, then ask for the 4 train trip to Fulton St on the live site, close the card, tap Find exit and read the guess","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T08:34:15Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"89e22e4aeaeafd761be92abf6e7a8b40edf10242b198e63a6b0bdb83cf5d2bd4","request_id":"cc4d21d2a132479f85e2a473476a8c9c","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- #144 merged; merged main into fix/lost-guess-trip-without-subway again. The task record takes main's copy; this branch's earlier entries (the M15 trip that ended at Fulton St station with no subway exit, and the destination-station guess) are in #149's commits

Evidence:
- no external evidence recorded

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Let CI pass and auto-merge #149, then ask for the 4 train trip to Fulton St on the live site, close the card, tap Find exit and read the guess

### 2026-11-13 09:13:39 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["#144 and #149 merged and deployed. Live check at Fulton St found two faults, fixed on fix/lost-place-live-answers: a passage answer lost to a miscounted flight, and typed Exit sign words matched nothing when the map had no Fulton St street names"],"decisions":["no new decisions"],"evidence":["Replay of the live answers (passage, one up, none down) now ends in a passage; 'Exit Fulton St & Nassau St' matches with no tiles; placement replays still 65% and 90%"],"next_action":"Let CI pass and auto-merge the fix, then repeat the live steps and post the receipt on #143","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T09:13:39Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"b9bffdd532cafa4455a005792d62292d203185e37315e1617694cff044e36dbc","request_id":"f9741f9c655d42fe9bb7b7207909544b","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- #144 and #149 merged and deployed. Live check at Fulton St found two faults, fixed on fix/lost-place-live-answers: a passage answer lost to a miscounted flight, and typed Exit sign words matched nothing when the map had no Fulton St street names

Evidence:
- Replay of the live answers (passage, one up, none down) now ends in a passage; 'Exit Fulton St & Nassau St' matches with no tiles; placement replays still 65% and 90%

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Let CI pass and auto-merge the fix, then repeat the live steps and post the receipt on #143

### 2026-11-13 12:33:10 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["Not quite at Fulton St now starts the placement questions instead of passing the rider to the agent"],"decisions":["no new decisions"],"evidence":["src/features/agent/lost tests pass (18); eslint clean on changed files"],"next_action":"After deploy, repeat the 4 train trip, Find exit, Not quite on the live site","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T12:33:10Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"533743e758f5e52d77d68c11bf574adca18872a6e34c1cf0b5278444eaa1c6f9","request_id":"e142e36ebde3486f87c37fcc102dd919","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- Not quite at Fulton St now starts the placement questions instead of passing the rider to the agent

Evidence:
- src/features/agent/lost tests pass (18); eslint clean on changed files

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- After deploy, repeat the 4 train trip, Find exit, Not quite on the live site

### 2026-11-13 13:14:01 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["Trip steps name stations by GTFS stop id, so the helper knows a train trip ends at Fulton St"],"decisions":["no new decisions"],"evidence":["otp, portal and routes tests pass (31); eslint clean on changed files"],"next_action":"After deploy, the 4 or 5 train trip, Find exit, Yes and Not quite on the live site","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T13:14:01Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"60465b44beafa829f5a7bf0eb7ac9798079e5b8729109a0c24598fd6be355b01","request_id":"def74646ebca4b0daa6023f96b3cf864","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- Trip steps name stations by GTFS stop id, so the helper knows a train trip ends at Fulton St

Evidence:
- otp, portal and routes tests pass (31); eslint clean on changed files

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- After deploy, the 4 or 5 train trip, Find exit, Yes and Not quite on the live site

### 2026-11-13 14:29:55 UTC — agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84

<!-- continuity:checkpoint {"agent":"agent:claude-code/397c2044-1060-40b6-b357-708ed173fd84","blocked":[],"changed":["none"],"completed":["Find exit at Fulton St checked live after a train trip; Yes and Not quite both ask where you are"],"decisions":["no new decisions"],"evidence":["Live run 2026-11-13, receipt on #143 (comment 6855852902)"],"next_action":"Check the passage steps' stair flights against the real Fulton St station","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0056","timestamp":"2026-11-13T14:29:55Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"12006ea6eba8a1b7cd0a8182d9c67fdea90bbfdd59e3a4aea7975f83d71ef568","request_id":"e53d32a3567647e185333db6f4c00193","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0056"} -->

Completed:
- Find exit at Fulton St checked live after a train trip; Yes and Not quite both ask where you are

Evidence:
- Live run 2026-11-13, receipt on #143 (comment 6855852902)

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Check the passage steps' stair flights against the real Fulton St station

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
