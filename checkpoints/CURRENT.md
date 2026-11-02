# Current repository checkpoint

<!-- continuity:current {"active_task": "NMA-0005", "active_task_file": "tasks/TASK-NMA-0005-line-status-eval.md", "protocol_version": "0.1.0-draft", "schema": "project-continuity.current.v1"} -->

Older state: [`history/2026-11.md`](history/2026-11.md) and earlier months in `history/`.

## Current projection

*Updated 2026-11-01, 11:45 UTC. Read this first; it says where the work stands so a new agent does not have to rebuild that from branches and pull requests.*

GitHub Issues own task scope and progress; this file is a projection of them, not task authority. The only open Project Continuity Modules (PCM) task is `tasks/TASK-NMA-0005-line-status-eval.md` (#629). The other five records (#614, #618, #625, #627, #634) describe work GitHub closed on 2026-11-01, and each now says `completed` with no next action. The build plan is [`docs/PDD.md`](../docs/PDD.md) (the product design document): what is built, what remains, how to check it and how to ship it. The design rules every screen must follow are in [`docs/DESIGN_RULES.md`](../docs/DESIGN_RULES.md).

**Where it runs.** The app runs on the VPS (`ssh vps`). Komodo deploys main there: the `nyc-map-agent-deploy-on-push` action checks every 5 minutes and runs `deploy/vps/autodeploy.sh`, which builds `nyc-map-agent:<12-char sha>` and rolls back if the health check fails. The first deploy, main at #613 (`0cb74693be46`), went live on 2026-11-01. Since 2026-11-01 nyc.design-bakery.com reaches it through Cloudflare tunnel A (`octo-cloudflared` on the VPS, rule to `http://nyc-map-web:8080`); its DNS record used to point at the dead gravebuster tunnel. The live site answers 200 on `/healthz`, and the repository variable `NYC_PUBLIC_URL` is set, so CI's contract job runs against it after each main deploy. See `deploy/README.md`.

**Voice runs on the owner's own machines.** The microphone records one turn, converts it to a 16 kHz WAV in the browser and posts it to `/api/stt`. That route passes the clip to the copilot speech server on the MacBook Pro (Whisper large-v3-turbo), which the Pro reaches over a tunnel; nothing goes to an outside company and no copy is kept. A Spanish clip posted to the live site came back transcribed with its language in 3.2 seconds on 2026-11-01. `docs/PRIVACY.md` now describes that path.

**What the project is now.** An agent-first map of New York City: a chat and voice assistant over a clean map that helps people get around (restrooms, landmarks, subway exits, readable MTA disruptions). The realignment is described in [`PROJECT.md`](../PROJECT.md). Work from before the realignment (3D city, street view extras, datasets) was closed on 2026-10-25; those pull requests keep their branches on GitHub if any of it comes back (#376).

## In flight

**The pull request backlog was sorted on 2026-10-25 (#376, closed).** 51 old pull requests were closed: 35 whose work is already on main, and 16 from the direction before the realignment. Each has a comment saying why. Only two pull requests are open now:

| Pull request | What it is | State |
|---|---|---|
| #378 | Docs: realign the project, hackathon writeup and research sources | Open for review; GitHub reports its merge state as unknown, so it needs a rebase before it can merge |
| #232 | The release bot's release pull request | Left to the bot; blocked on the release it would cut |

**The line status eval loop is the work in progress, and it lives on an issue, not a pull request.** #629 is open and is task NMA-0005. The loop, its rules and its ledger are in `docs/eval/line-status/`; the handoff for running it alone is `HANDOFF_DEEPSEEK.md` there. Iteration 1 (#632) is merged. Iteration 2 is unstarted.

**`feat/place-readback` is a leftover branch, not work in flight.** Its work merged as #602 on 2026-11-01 and its content is on main; the ref is a squash-merge artifact and can be deleted. The same is true of `docs/614-public-route-live` and the other `docs/614-*` branches whose checkpoints merged.

## Next

0. **Iteration 3 of the line status loop (#629, task NMA-0005), and it needs a clean baseline first.** Iteration 2 was tried and rejected on 2026-11-01: dropping the shuttle bus from the prompt cut invented shuttles from 67 trials to 5 but sent held-out clean trials from 49.0% down to 23.5%, and moved the failure into "denies trouble" (3 trials to 28). It is written up in `LEDGER.md` and the change was dropped. The two runs either side of it were also polluted by dropped connections, which the runner used to record as empty replies; that is fixed, so start iteration 3 with a fresh baseline on the fixed runner and change one prompt line at a time rather than two.
1. **New issue logs from 2026-10-29, filed in the form's shape:** a scorecard that compares our help with Google and Apple Maps on 17 tasks (#586), reading exit signs with the camera offline (#587), the problem tour that flies spot to spot while the agent talks (#588), photos of entrances and destinations (#589), and app labels in the rider's language (#590).
2. **Finish the remaining-work list in `docs/PDD.md`** (items 1 to 9: menu row, the dropdowns, quick bar, memory summary, task-screen restyle, dead ends). Item 10, the screen-space rules, is done.
3. **Underground help that never lets you miss your exit or get lost inside a station:** count stops from the saved trip and timetable when there is no signal, and keep exit guidance ready before going down (#373).
