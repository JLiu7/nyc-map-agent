# Current repository checkpoint

<!-- continuity:current {"active_task": null, "active_task_file": null, "protocol_version": "0.1.0-draft", "schema": "project-continuity.current.v1"} -->

Older state: [`history/2026-11.md`](history/2026-11.md) and earlier months in `history/`.

## Current projection

*Updated 2026-11-01. Read this first; it says where the work stands so a new agent does not have to rebuild that from branches and pull requests.*

GitHub Issues own task scope and progress; this file is a projection of them, not task authority. No Project Continuity Modules (PCM) task file is active, so `tasks/` is still empty. The build plan is [`docs/PDD.md`](../docs/PDD.md) (the product design document): what is built, what remains, how to check it and how to ship it. The design rules every screen must follow are in [`docs/DESIGN_RULES.md`](../docs/DESIGN_RULES.md).

**Where it runs.** The app runs on the VPS (`ssh vps`) since 2026-10-31, built by hand from `feat/motis-planner`, whose code reached main in #603. Once #613 and Pukujan-lab/server-management#69 merge, a Komodo action deploys main there within 5 minutes of each merge. nyc.design-bakery.com answers 530 until the owner adds its route on Cloudflare tunnel A. See `deploy/README.md`.

**What the project is now.** An agent-first map of New York City: a chat and voice assistant over a clean map that helps people get around (restrooms, landmarks, subway exits, readable MTA disruptions). The realignment is described in [`PROJECT.md`](../PROJECT.md). Work from before the realignment (3D city, street view extras, datasets) was closed on 2026-10-25; those pull requests keep their branches on GitHub if any of it comes back (#376).

## In flight

**The pull request backlog was sorted on 2026-10-25 (#376, closed).** 51 old pull requests were closed: 35 whose work is already on main, and 16 from the direction before the realignment. Each has a comment saying why. The ones kept were rebased onto main with auto-merge on:

| Pull request | What it is | State |
|---|---|---|
| #613 | Komodo deploys main to the VPS (`deploy/vps/autodeploy.sh`); merges before server-management#69 | Open |
| #602 | The agent reads an unclear place back before answering ("86 St" has six stations) | Open, checks green |
| #378 | Docs: realign the project, hackathon writeup and research sources | Open for review |
| #232 | The release bot's release pull request | Left to the bot |

#416 (app text follows the asked language), #415 (held trains and feed-skipped stops), #359 (Live View camera scaffold) and #417 (menu row language) merged on 2026-10-25.

Merged from the sort: #209, #348, #349, #394, #408, #414.

After pulling main, run `pnpm install`: main now needs `xstate`, and #349 changes vite and vitest.

## Next

- **Make the VPS app public:** after the first Komodo deploy, the owner adds nyc.design-bakery.com on Cloudflare tunnel A, pointing at `http://nyc-map-web:8080`; then set the repository variable `NYC_PUBLIC_URL` so CI's contract check runs again.
0. **New issue logs from 2026-10-29, filed in the form's shape:** a scorecard that compares our help with Google and Apple Maps on 17 tasks (#586), reading exit signs with the camera offline (#587), the problem tour that flies spot to spot while the agent talks (#588), photos of entrances and destinations (#589), and app labels in the rider's language (#590).
1. **Finish the remaining-work list in `docs/PDD.md`** (items 1 to 9: menu row, the dropdowns, quick bar, memory summary, task-screen restyle, dead ends). Item 10, the screen-space rules, is done.
2. **Underground help that never lets you miss your exit or get lost inside a station:** count stops from the saved trip and timetable when there is no signal, and keep exit guidance ready before going down (#373).
3. **Refresh the document index:** `docs/CONTINUITY_INDEX.md` marks `AGENTS.md` and `docs/ARCHITECTURE.md` as changed since their last review. Review them, then regenerate the index with the `continuity docs render` command once the tool is installed; the index is generated, so don't edit it by hand.
