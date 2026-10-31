# Current repository checkpoint

<!-- continuity:current {"active_task": null, "active_task_file": null, "protocol_version": "0.1.0-draft", "schema": "project-continuity.current.v1"} -->

Older state: [`history/2026-10.md`](history/2026-10.md) and earlier months in `history/`.

## Current projection

*Updated 2026-10-29. Read this first; it says where the work stands so a new agent does not have to rebuild that from branches and pull requests.*

GitHub Issues own task scope and progress; this file is a projection of them, not task authority. No Project Continuity Modules (PCM) task file is active, so `tasks/` is still empty. The build plan is [`docs/PDD.md`](../docs/PDD.md) (the product design document): what is built, what remains, how to check it and how to ship it. The design rules every screen must follow are in [`docs/DESIGN_RULES.md`](../docs/DESIGN_RULES.md).

**What the project is now.** An agent-first map of New York City: a chat and voice assistant over a clean map that helps people get around (restrooms, landmarks, subway exits, readable MTA disruptions). The realignment is described in [`PROJECT.md`](../PROJECT.md). Work from before the realignment (3D city, street view extras, datasets) was closed on 2026-10-25; those pull requests keep their branches on GitHub if any of it comes back (#376).

## Completed recently

Everything completed up to 2026-10-31 is in [`history/2026-10.md`](history/2026-10.md) under "Completed recently". Add new items here as pull requests merge.

## In flight

**The pull request backlog was sorted on 2026-10-25 (#376, closed).** 51 old pull requests were closed: 35 whose work is already on main, and 16 from the direction before the realignment. Each has a comment saying why. The ones kept were rebased onto main with auto-merge on:

| Pull request | What it is | State |
|---|---|---|
| #378 | Docs: realign the project, hackathon writeup and research sources | Open for review |
| #232 | The release bot's release pull request | Left to the bot |

#416 (app text follows the asked language), #415 (held trains and feed-skipped stops), #359 (Live View camera scaffold) and #417 (menu row language) merged on 2026-10-25.

Merged from the sort: #209, #348, #349, #394, #408, #414.

After pulling main, run `pnpm install`: main now needs `xstate`, and #349 changes vite and vitest.

## Next

0. **New issue logs from 2026-10-29, filed in the form's shape:** a scorecard that compares our help with Google and Apple Maps on 17 tasks (#586), reading exit signs with the camera offline (#587), the problem tour that flies spot to spot while the agent talks (#588), photos of entrances and destinations (#589), and app labels in the rider's language (#590).
1. **Finish the remaining-work list in `docs/PDD.md`** (items 1 to 9: menu row, the dropdowns, quick bar, memory summary, task-screen restyle, dead ends). Item 10, the screen-space rules, is done.
2. **Underground help that never lets you miss your exit or get lost inside a station:** count stops from the saved trip and timetable when there is no signal, and keep exit guidance ready before going down (#373).
3. **Refresh the document index:** `docs/CONTINUITY_INDEX.md` marks `AGENTS.md` and `docs/ARCHITECTURE.md` as changed since their last review. Review them, then regenerate the index with the `continuity docs render` command once the tool is installed; the index is generated, so don't edit it by hand.

## Keeping this file current

PCM is a protocol and a writing standard, not a background service: no workflow or hook updates this file (the Checkpoint Reminder workflow only warns on a pull request that changes app code without touching it), and the `continuity` command-line tool is not installed here. The agent that merges a piece of work updates "Completed recently", "In flight" and "Next" in the same pull request, as `AGENTS.md` now asks.
