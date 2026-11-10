# Current repository checkpoint

<!-- continuity:current {"active_task": "NMA-0005", "active_task_file": "tasks/TASK-NMA-0005-line-status-eval.md", "protocol_version": "0.1.0-draft", "schema": "project-continuity.current.v1"} -->

Older state: [`history/2026-11.md`](history/2026-11.md) and earlier months in `history/`.

## Current projection

*Updated 2026-11-10, 23:00 UTC. Read this first; it says where the work stands so a new agent does not have to rebuild that from branches and pull requests.*

## In flight

**A subway notice now guides the rider instead of repeating the MTA paragraph (#55, pull request #61, branch `feat/55-alert-diagram`).** Tapping a notice in the line panel draws the stretch of line it touches and reads short steps aloud while the map frames each step's stations: what is happening, where to leave the train, the street corner the shuttle bus stops at (from the feed's per-station notes), where to get back on, bus alternatives from the travel tips, and when it applies. With the rider's location shared it starts from the nearest closed station. Steps are translated into the app language by the agent's model through `POST /api/agent/translate`, with station names kept as on the map. Other ways is gone. Not done: nobody has listened to it on a phone.

**A rider below the street has no position the app can trust, so a camera mode that reads station signs is being tried (#88, task NMA-0040, branch `feat/sign-camera`).** Words read off a sign are matched to the signs the app hangs in its own model of the station (`src/lib/map/signMatch.ts`); a match that fits one place gives the spot and the facing, and an arrow to the exit. The screen is a prototype behind `?flags=+signCamera`, in the phone's one sheet with the map still in view. Two limits found: the app's signs mostly say the same words all over a station (Fulton St has 218 signs and six wordings), so a read usually names only the station until Exit signs carry their corner (pull request #87); and the text reader, Tesseract.js, missed every dim rendered sign and some clean ones. Not done: nothing was tried on a phone, and no photo of a real sign was read.

## Next

- **Try the sign camera on a phone at Fulton St (#88).** Underground the app cannot tell where a rider stands. Open `/?flags=+signCamera`, point at an Exit sign and check the corner it names and the arrow. Take about 15 photos of real signs while there, to test the text reader on.
- **Walk Fulton St in a trip preview once #86's pull request deploys.** Station signs did not say where an exit leads or which way trains go, and the floor, platform and ceiling were flat greys (task NMA-0038). Exit signs should now be red with an up arrow and, on the stair to the street, the corner it comes up at; Manhattan platforms should say Uptown or Downtown with their lines; and the floor, platform and ceiling should each have their own texture. Check one direction sign against the real platform: the rule assumes trains keep right.
- **Watch a subway trip preview on a phone once #84's pull request deploys.** The preview hid the walk through the station under its panel and showed an empty street (task NMA-0037). Pressing Play should now leave one bar (the step in words, back, pause, next, progress), the street should have standing buildings going in and coming out, and the station walk should last longer than the ride. Still to do for the hackathon demo on 2026-11-14: which car to board, landmark callouts at Fulton St, and station signs like the real ones.
- **Walk a station on a phone once #71's and #73's pull requests deploy.** Stations below the street now have white tile walls with a trim band and MTA-style signs (name, Exit, line bullets; task NMA-0031), and floors, ceilings and track beds reach every wall, so the jagged gaps along wall tops and feet are gone (NMA-0032). Still open: uptown and downtown labels (they need the MTA station list), and stair treads that show small steps against the sloping stair walls.
- **Walk under the FDR at South St and along a side street on a phone once #67's pull request deploys.** The deck should sit overhead on columns and the sidewalks should reach the buildings.
- **Watch a subway trip preview on a phone once #65's pull request deploys.** The walk in should show the walls and the cyan line, the train should pull in beside the platform, and the step text should read in full above the controls.
- **After #62 merges, walk into Fulton St and an elevated station on a phone.** Check that the stairs feel right with the on-screen pad, and that the view below the street keeps up on a mid-range phone.
- **After #53 merges, try station, line chip, Back and Close on a phone.** Check the drag between peek, half and full on the station sheet too, since it no longer uses vaul.
- **After pull request #61 deploys, open a shuttle notice on a phone with the voice on (#55).** Check that the steps say where to leave the train, which corner the shuttle bus stops at and where to get back on, that the map moves to each step's stations and labels the bus corners while the voice speaks, and that Kokoro starts without a long silence. Then switch the app to Spanish and check the steps come back translated.
- **After #44 deploys, check sleep and wake on the VPS.** Both containers should show `Exited (0)` 10 minutes after the last request, the first trip after that should come from OTP rather than the built-in router, and OTP's real cold start should be written into `deploy/README.md` and server-management's `vps/services.toml`.
