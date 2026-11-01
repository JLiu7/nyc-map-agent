# Current repository checkpoint

<!-- continuity:current {"active_task": null, "active_task_file": null, "protocol_version": "0.1.0-draft", "schema": "project-continuity.current.v1"} -->

Older state: [`history/2026-11.md`](history/2026-11.md) and earlier months in `history/`.

## Current projection

*Updated 2026-11-01. Read this first; it says where the work stands so a new agent does not have to rebuild that from branches and pull requests.*

GitHub Issues own task scope and progress; this file is a projection of them, not task authority. The one Project Continuity Modules (PCM) task file is `tasks/TASK-NMA-0001-public-route.md`, for #614. The build plan is [`docs/PDD.md`](../docs/PDD.md) (the product design document): what is built, what remains, how to check it and how to ship it. The design rules every screen must follow are in [`docs/DESIGN_RULES.md`](../docs/DESIGN_RULES.md).

**Where it runs.** The app runs on the VPS (`ssh vps`). Komodo deploys main there: the `nyc-map-agent-deploy-on-push` action checks every 5 minutes and runs `deploy/vps/autodeploy.sh`, which builds `nyc-map-agent:<12-char sha>` and rolls back if the health check fails. The first deploy, main at #613 (`0cb74693be46`), went live on 2026-11-01. Since 2026-11-01 nyc.design-bakery.com reaches it through Cloudflare tunnel A (`octo-cloudflared` on the VPS, rule to `http://nyc-map-web:8080`); its DNS record used to point at the dead gravebuster tunnel. See `deploy/README.md`.

**What the project is now.** An agent-first map of New York City: a chat and voice assistant over a clean map that helps people get around (restrooms, landmarks, subway exits, readable MTA disruptions). The realignment is described in [`PROJECT.md`](../PROJECT.md). Work from before the realignment (3D city, street view extras, datasets) was closed on 2026-10-25; those pull requests keep their branches on GitHub if any of it comes back (#376).

## In flight

**The pull request backlog was sorted on 2026-10-25 (#376, closed).** 51 old pull requests were closed: 35 whose work is already on main, and 16 from the direction before the realignment. Each has a comment saying why. The ones kept were rebased onto main with auto-merge on:

| Pull request | What it is | State |
|---|---|---|
| #602 | The agent reads an unclear place back before answering ("86 St" has six stations) | Open, checks green |
| #378 | Docs: realign the project, hackathon writeup and research sources | Open for review |
| #232 | The release bot's release pull request | Left to the bot |
| branch `feat/place-readback` (not pushed) | The agent picked one of six "86 St" stations without asking. Now a place several stations share, a near spelling, or a turn speech-to-text was unsure of is read back before any answer; the plan for porting the website copilot's other safety rules is `docs/PLAN-copilot-port.md` | Committed locally, 2026-10-31 |

#416 (app text follows the asked language), #415 (held trains and feed-skipped stops), #359 (Live View camera scaffold) and #417 (menu row language) merged on 2026-10-25.

Merged from the sort: #209, #348, #349, #394, #408, #414.

After pulling main, run `pnpm install`: main now needs `xstate`, and #349 changes vite and vitest.

## Next

- **Ferries are missing on the live map (#618):** `/api/v1/ferry` answers 502 because the ferry layer still asks OpenTripPlanner, which does not run on the VPS. Read ferries from MOTIS or run OTP there.
- **Turn on CI's live contract check (#614):** set the repository variable `NYC_PUBLIC_URL` to `https://nyc.design-bakery.com` once #618 is fixed; until then the check fails on the ferry endpoint.
0. **New issue logs from 2026-10-29, filed in the form's shape:** a scorecard that compares our help with Google and Apple Maps on 17 tasks (#586), reading exit signs with the camera offline (#587), the problem tour that flies spot to spot while the agent talks (#588), photos of entrances and destinations (#589), and app labels in the rider's language (#590).
1. **Finish the remaining-work list in `docs/PDD.md`** (items 1 to 9: menu row, the dropdowns, quick bar, memory summary, task-screen restyle, dead ends). Item 10, the screen-space rules, is done.
2. **Underground help that never lets you miss your exit or get lost inside a station:** count stops from the saved trip and timetable when there is no signal, and keep exit guidance ready before going down (#373).
