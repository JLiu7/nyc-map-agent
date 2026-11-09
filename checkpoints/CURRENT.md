# Current repository checkpoint

<!-- continuity:current {"active_task": "NMA-0005", "active_task_file": "tasks/TASK-NMA-0005-line-status-eval.md", "protocol_version": "0.1.0-draft", "schema": "project-continuity.current.v1"} -->

Older state: [`history/2026-11.md`](history/2026-11.md) and earlier months in `history/`.

## Current projection

*Updated 2026-11-09, 07:00 UTC. Read this first; it says where the work stands so a new agent does not have to rebuild that from branches and pull requests.*

## In flight

**A subway notice now guides the rider instead of repeating the MTA paragraph (#55, pull request #61, branch `feat/55-alert-diagram`).** Tapping a notice in the line panel draws the stretch of line it touches and reads short steps aloud while the map frames each step's stations: what is happening, where to leave the train, the street corner the shuttle bus stops at (from the feed's per-station notes), where to get back on, bus alternatives from the travel tips, and when it applies. With the rider's location shared it starts from the nearest closed station. Steps are translated into the app language by the agent's model through `POST /api/agent/translate`, with station names kept as on the map. Other ways is gone. Not done: nobody has listened to it on a phone.

## Next

- **Ask the live site for a subway trip to Fulton Street once #79's pull request deploys.** After #77's fix the map flew to Fulton St station, but the trip still ended at 14 Fulton St, because the model named the destination "Fulton Street Station, Fulton Street & Broadway, Manhattan" and only whole names matched (task NMA-0035). The trip should now end at the station.
- **Walk a station on a phone once #71's and #73's pull requests deploy.** Stations below the street now have white tile walls with a trim band and MTA-style signs (name, Exit, line bullets; task NMA-0031), and floors, ceilings and track beds reach every wall, so the jagged gaps along wall tops and feet are gone (NMA-0032). Still open: uptown and downtown labels (they need the MTA station list), and stair treads that show small steps against the sloping stair walls.
- **Walk under the FDR at South St and along a side street on a phone once #67's pull request deploys.** The deck should sit overhead on columns and the sidewalks should reach the buildings.
- **Watch a subway trip preview on a phone once #65's pull request deploys.** The walk in should show the walls and the cyan line, the train should pull in beside the platform, and the step text should read in full above the controls.
- **After #62 merges, walk into Fulton St and an elevated station on a phone.** Check that the stairs feel right with the on-screen pad, and that the view below the street keeps up on a mid-range phone.
- **After #53 merges, try station, line chip, Back and Close on a phone.** Check the drag between peek, half and full on the station sheet too, since it no longer uses vaul.
- **After pull request #61 deploys, open a shuttle notice on a phone with the voice on (#55).** Check that the steps say where to leave the train, which corner the shuttle bus stops at and where to get back on, that the map moves to each step's stations and labels the bus corners while the voice speaks, and that Kokoro starts without a long silence. Then switch the app to Spanish and check the steps come back translated.
- **After #44 deploys, check sleep and wake on the VPS.** Both containers should show `Exited (0)` 10 minutes after the last request, the first trip after that should come from OTP rather than the built-in router, and OTP's real cold start should be written into `deploy/README.md` and server-management's `vps/services.toml`.
