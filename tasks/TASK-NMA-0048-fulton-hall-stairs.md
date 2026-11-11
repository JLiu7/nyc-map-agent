# TASK-NMA-0048 — Fulton Hall Stairs

<!-- continuity:task {"acceptance":["A stair going down from Fulton St's hall shows as an opening with a waist-high parapet, not a box of full-height walls","Walking the route from the 4/5 platform to the E exit on Fulton Street, no view passes through a wall","Steps stay 2 m wide and routes are unchanged; unit tests, typecheck and lint pass"],"depends_on":[],"goal":"Fulton St's hall shows an opening, not a box of walls, at the stair down, and the trip never walks through a stair's side wall","id":"NMA-0048","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/113","next_action":"None: merged in #114; the live recording after it led to #115","owner":"claude-code","priority":"high","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"done","why":"The demo trip's walk out of Fulton St looked broken a little over a minute in, after #112 deployed"} -->

- Status: done
- Owner: claude-code
- Priority: high
- Depends on: none

## Goal

Fulton St's hall shows an opening, not a box of walls, at the stair down, and the trip never walks through a stair's side wall

## Why

The demo trip's walk out of Fulton St looked broken a little over a minute in, after #112 deployed

## Allowed files

- src/lib/map/three/stationScene.ts
- checkpoints/CURRENT.md
- this task record

## Human outcome

Watching the trip to the E exit on Fulton Street, the hall shows a stairwell with a parapet where it showed a broken box, and the walk onto the next stair no longer passes through a wall.

## Scope and boundaries

- In scope: what the station view draws at stairs: room outline walls beside a stair going down, the lowest stretch of a stair's side walls, a stair's head where the room floor carries on.
- Out of scope: walking, routes, stair widths, the station data, and the dark underside of a stair's ceiling seen from above.
- Dependencies/uncertainty: Fulton St's hall height is approximate (#97).

## Acceptance criteria

- [x] A stair going down from Fulton St's hall shows as an opening with a waist-high parapet, not a box of full-height walls
- [x] Walking the route from the 4/5 platform to the E exit on Fulton Street, no view passes through a wall
- [x] Steps stay 2 m wide and routes are unchanged; unit tests, typecheck and lint pass

## Evidence and sources

- Views every 3 m along the route from the 4/5 platform to the E exit, rendered on the MacBook Pro from a local build: the box and the wall at the stair's foot are gone.
- Rays cast in the hall hit the hall's outline walls round the stair's gap, up to 7.4 m below the street (above the parapet).
- The same views from the code before #112 show the same box: #112 did not cause it.
- 26 fixed views of Fulton St stairs: same or cleaner than before.
- Unit tests passed (1,819); typecheck and lint clean.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none): #113; follows #111
- Primary writer / branch / source issue revision / as-of status: claude-code / fix/fulton-hall-stair / 2026-11-11
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-11 07:31:56 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["src/lib/map/three/stationScene.ts"],"completed":["Fulton St's hall shows a stairwell with a parapet where it showed a box, and the walk onto the next stair stays clear of its side walls"],"decisions":["no new decisions"],"evidence":["Views every 3 m along the route to the E exit rendered before and after; 1,819 unit tests passed; typecheck and lint clean"],"next_action":"None: merged in #114; the live recording after it led to #115","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0048","timestamp":"2026-11-11T07:31:56Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"9df0776bb1585462d32e6ec507c86b2d9b4101cb15385b8d2256cc0a29787ba2","request_id":"ab841934cb6c4c9194ef9f46f158fe1b","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0048"} -->

Completed:
- Fulton St's hall shows a stairwell with a parapet where it showed a box, and the walk onto the next stair stays clear of its side walls

Evidence:
- Views every 3 m along the route to the E exit rendered before and after; 1,819 unit tests passed; typecheck and lint clean

Decisions:
- no new decisions

Changed:
- src/lib/map/three/stationScene.ts

Blocked/uncertain:
- none

Next:
- Merge the pull request, then record the 4 train trip to Fulton St on the live site

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
