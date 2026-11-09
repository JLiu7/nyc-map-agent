# TASK-NMA-0021 — Alert Diagram

<!-- continuity:task {"acceptance": ["Skip-stop, part-suspension, shuttle-bus and run-local notices open as a line diagram built from subway.json (alertDiagram.test.ts)", "A notice with no usable stations shows its first sentence or two", "Tapping a notice reads the steps aloud and lights each step's stations; Stop and a voice toggle work", "No Other ways button anywhere; e2e line-notices case passes expectLayout at all four sizes", "A shuttle notice says where to leave the train, the shuttle bus corner from the feed's station notes, and where to get back on; says plainly when the notice gives no corner", "Travel-tip buses and the notice's dates become steps", "The map frames each step's stations and labels the bus corners while the voice speaks, starting from the station nearest a rider who shares their location", "Steps are shown and spoken in the app language, translated by the agent's model, falling back to English with a note"], "depends_on": [], "goal": "Show an open service notice as a small diagram of its stretch of line and read it aloud step by step", "id": "NMA-0021", "issue_url": "https://github.com/pukujan-lab-2/nyc-map-agent/issues/55", "next_action": "after pull request #61 deploys, open a shuttle notice on a phone with the voice on, then again in Spanish", "owner": "claude-code", "priority": "medium", "protocol_version": "0.1.0-draft", "schema": "project-continuity.task.v1", "status": "active", "why": "The owner finds the notice paragraphs hard to read and never uses the Other ways button"} -->

- Status: active
- Owner: claude-code
- Priority: medium
- Depends on: none

## Goal

Show an open service notice as a small diagram of its stretch of line and read it aloud step by step

## Why

The owner finds the notice paragraphs hard to read and never uses the Other ways button

## Allowed files

- src/features/transit/{alertDiagram.ts,alertDiagram.test.ts,alertDiagram.fixtures.json,NoticeDiagram.tsx,LinePanel.tsx,TransitCard.tsx}
- src/lib/voice/{say.ts,useSpeech.ts}
- src/features/transit/{alertFocus.ts,TransitLayer.tsx,noticeLang.ts,hooks.ts}
- server/features/transit/{alerts.ts,alerts.test.ts}, server/features/agent/{translate.ts,translate.test.ts,routes.ts}, server/{app.ts,openapi.ts}, openapi.json, src/lib/api/schema.d.ts
- e2e/line-notices.spec.ts, .size-limit.json, checkpoints/CURRENT.md

## Human outcome

A rider sees which stations a notice touches at a glance and can hear it read out, instead of reading the MTA's paragraph.

## Scope and boundaries

- In scope: subway notices in the line panel.
- Out of scope: bus and rail notices, routing around the change (the chat agent does that).
- Dependencies/uncertainty:

## Acceptance criteria

- [x] Skip-stop, part-suspension, shuttle-bus and run-local notices open as a line diagram built from subway.json (alertDiagram.test.ts)
- [x] A notice with no usable stations shows its first sentence or two
- [x] Tapping a notice reads the steps aloud and lights each step's stations; Stop and a voice toggle work
- [x] No Other ways button anywhere; e2e line-notices case passes expectLayout at all four sizes
- [x] A shuttle notice says where to leave the train, the shuttle bus corner from the feed's station notes, and where to get back on; says plainly when the notice gives no corner
- [x] Travel-tip buses and the notice's dates become steps
- [x] The map frames each step's stations and labels the bus corners while the voice speaks, starting from the station nearest a rider who shares their location
- [x] Steps are shown and spoken in the app language, translated by the agent's model, falling back to English with a note

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

### 2026-11-08 05:20:11 UTC — agent:claude-code/39bc49e4-4388-4090-97d5-748e0ac5c5f3

<!-- continuity:checkpoint {"agent":"agent:claude-code/39bc49e4-4388-4090-97d5-748e0ac5c5f3","blocked":[],"changed":["none"],"completed":["Subway notices in the line panel open as a diagram of their stretch of line with spoken, lit steps; Other ways removed"],"decisions":["no new decisions"],"evidence":["Unit suite passes (231 files, 1658 tests); tsc and eslint clean; line-notices e2e passes at all four layout sizes; size-limit passes"],"next_action":"After deploy, open a notice on a phone and listen to the walk","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0021","timestamp":"2026-11-08T05:20:11Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"3e52105b2de47996ba6a1f0869bf90b4731e45b1eae16ef6f2de7eb0f16d0f7b","request_id":"7df8f4a499c94847b823a1eda13d187c","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0021"} -->

Completed:
- Subway notices in the line panel open as a diagram of their stretch of line with spoken, lit steps; Other ways removed

Evidence:
- Unit suite passes (231 files, 1658 tests); tsc and eslint clean; line-notices e2e passes at all four layout sizes; size-limit passes

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- After deploy, open a notice on a phone and listen to the walk

### 2026-11-08 05:45:14 UTC — agent:claude-code/39bc49e4-4388-4090-97d5-748e0ac5c5f3

<!-- continuity:checkpoint {"agent":"agent:claude-code/39bc49e4-4388-4090-97d5-748e0ac5c5f3","blocked":[],"changed":["New route POST /api/agent/translate; notice chunk budget 10 kB, whole-app JS limit 1114 kB"],"completed":["A tapped subway notice guides the rider: where to leave the train, the shuttle bus corner from the feed's station notes, where to get back on, travel-tip buses and dates","The map frames each step's stations and labels the bus corners while the voice speaks; steps are translated into the app language through POST /api/agent/translate"],"decisions":["Bus corners are marked at the station, since the geocoder cannot place intersections"],"evidence":["After rebasing on main: unit suite passes (1679 tests); tsc, eslint and size-limit pass; line-notices, line-chooser and responsive e2e passed 72 of 72 at all four layout sizes"],"next_action":"After pull request #61 deploys, open a shuttle notice on a phone with the voice on, then again in Spanish","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0021","timestamp":"2026-11-08T05:45:14Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"63dc07b0658180f376031c8b3b0083beb23eaa6ab30d9d2ac6b71bd4e0cae6a6","request_id":"8c629753c9584d6aa4d14ec7251fdf28","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0021"} -->

Completed:
- A tapped subway notice guides the rider: where to leave the train, the shuttle bus corner from the feed's station notes, where to get back on, travel-tip buses and dates
- The map frames each step's stations and labels the bus corners while the voice speaks; steps are translated into the app language through POST /api/agent/translate

Evidence:
- After rebasing on main: unit suite passes (1679 tests); tsc, eslint and size-limit pass; line-notices, line-chooser and responsive e2e passed 72 of 72 at all four layout sizes

Decisions:
- Bus corners are marked at the station, since the geocoder cannot place intersections

Changed:
- New route POST /api/agent/translate; notice chunk budget 10 kB, whole-app JS limit 1114 kB

Blocked/uncertain:
- none

Next:
- After pull request #61 deploys, open a shuttle notice on a phone with the voice on, then again in Spanish

### 2026-11-08 23:10:37 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["none"],"completed":["Merged main (with #63) into the branch; kept both CURRENT entries and raised the all-JS budget to 1119 kB for both changes"],"decisions":["no new decisions"],"evidence":["size-limit passes; 1,689 unit tests pass; types clean"],"evidence_class":"observed","next_action":"auto-merge lands it when CI passes; then open a shuttle notice on a phone with the voice on","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0021","timestamp":"2026-11-08T23:10:37Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"03e861b84198a860455dd7c01c5ed5e79cf04474740d11f5308f3df386494da7","request_id":"d703bcd44bdc4dee88ec64a7c38dfa24","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0021"} -->

Completed:
- Merged main (with #63) into the branch; kept both CURRENT entries and raised the all-JS budget to 1119 kB for both changes

Evidence:
- size-limit passes; 1,689 unit tests pass; types clean

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- auto-merge lands it when CI passes; then open a shuttle notice on a phone with the voice on

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
