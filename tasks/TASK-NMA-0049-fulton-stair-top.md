# TASK-NMA-0049 — Fulton Stair Top

<!-- continuity:task {"acceptance":["Replaying the trip preview's camera to the E exit on Fulton Street, no frame is filled by a stair's side wall at arm's length","Where the way steps off a stair's side near its top, no parapet stands across it","Steps stay 2 m wide, routes and the camera outside stations are unchanged; unit tests, typecheck and lint pass"],"depends_on":[],"goal":"The trip to the E exit on Fulton Street climbs out of the hall facing up the stair and steps off at the top without passing a wall","id":"NMA-0049","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/115","next_action":"Merge the pull request, then record the 4 train trip to Fulton St on the live site","owner":"claude-code","priority":"high","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"The live recording after #114 still showed the camera in a wall near the top of the stair out of the hall"} -->

- Status: active
- Owner: claude-code
- Priority: high
- Depends on: none

## Goal

The trip to the E exit on Fulton Street climbs out of the hall facing up the stair and steps off at the top without passing a wall

## Why

The live recording after #114 still showed the camera in a wall near the top of the stair out of the hall

## Allowed files

- src/features/agent/flythrough.ts
- src/lib/map/three/stationScene.ts
- checkpoints/CURRENT.md
- tasks/TASK-NMA-0048-fulton-hall-stairs.md
- this task record

## Human outcome

Watching the trip to the E exit on Fulton Street, the climb out of the hall faces up the stair until the top, then turns onto the floor beside it with nothing in the way.

## Scope and boundaries

- In scope: how far ahead the trip preview's eye looks inside a station; a stair's side walls over its last half metre of rise where a floor runs beside them.
- Out of scope: routes (they still step off a stair's side near its top), stair widths, the station data, and the camera on streets and rides.
- Dependencies/uncertainty: Fulton St's hall height is approximate (#97).

## Acceptance criteria

- [x] Replaying the trip preview's camera to the E exit on Fulton Street, no frame is filled by a stair's side wall at arm's length
- [x] Where the way steps off a stair's side near its top, no parapet stands across it
- [x] Steps stay 2 m wide, routes and the camera outside stations are unchanged; unit tests, typecheck and lint pass

## Evidence and sources

- The live recording after #114: about 60 s in, a tiled wall fills the screen near the top of the stair out of the hall.
- The player's camera replayed in a local build on the MacBook Pro matches it: the eye's heading looked 4 m ahead and reached 184 degrees on a stair running at 225, 2.5 m before the top. Looking 1.5 m ahead, it stays on the stair's line until 1 m before the top, and no frame is filled by a wall.
- The route steps off the stair 0.7 to 1 m before its top, 1.5 m off its middle line, through the parapet; with that stretch open the replay shows no wall across the way.
- 26 fixed views of Fulton St stairs: the only change is each parapet beside a stair ending about a metre short of the top.
- Unit tests passed (1,819); typecheck and lint clean.

## Reproduction details (only when needed)

Starting revision 5c0934e. Ask the live app "take the 4 train from Grand Central to Fulton Street leaving at 9am tomorrow", play the preview, and watch the step "Use the E exit on Fulton Street" up the stair out of the hall.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none): #115; follows #113
- Primary writer / branch / source issue revision / as-of status: claude-code / fix/fulton-stair-head / 2026-11-11
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-11 08:14:34 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["src/features/agent/flythrough.ts, src/lib/map/three/stationScene.ts"],"completed":["The trip preview's eye looks 1.5 m ahead inside a station, and a stair's side is open over its last half metre of rise where a floor runs beside it"],"decisions":["no new decisions"],"evidence":["Replaying the player's camera up the stair out of Fulton St's hall shows no wall at arm's length; 1,819 unit tests pass"],"next_action":"Merge the pull request, then record the 4 train trip to Fulton St on the live site","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0049","timestamp":"2026-11-11T08:14:34Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"0e11fbf4635f5829eefca002e4e33d49badea10e87a49efda77199e86814bc38","request_id":"2cbc865ee5f9432293e68d7d9a8e373d","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0049"} -->

Completed:
- The trip preview's eye looks 1.5 m ahead inside a station, and a stair's side is open over its last half metre of rise where a floor runs beside it

Evidence:
- Replaying the player's camera up the stair out of Fulton St's hall shows no wall at arm's length; 1,819 unit tests pass

Decisions:
- no new decisions

Changed:
- src/features/agent/flythrough.ts, src/lib/map/three/stationScene.ts

Blocked/uncertain:
- none

Next:
- Merge the pull request, then record the 4 train trip to Fulton St on the live site
