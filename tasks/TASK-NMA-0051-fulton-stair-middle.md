# TASK-NMA-0051 — Fulton Stair Middle

<!-- continuity:task {"acceptance":["Every route point partway down a stair at an angle to the station data's 0.5 m grid sits on that stair's line, within 5 cm","Replaying the trip preview's camera along the live walk to the E exit, the eye goes down the stair from the mezzanine to the hall on the middle of its treads, the same distance from each side wall, looking down the stair","The other stairs on the walk get no closer to a wall; unit tests, typecheck and lint pass"],"depends_on":[],"goal":"The trip to the E exit on Fulton Street goes down the middle of the stair from the mezzanine to the hall, looking down it","id":"NMA-0051","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/119","next_action":"Merge the pull request, then record the 4 train trip to Fulton St on the live site and check 60 to 70 s","owner":"claude-code","priority":"high","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"The live recording after #118 showed mostly wall for about two seconds going down that stair, because the walk ran off its middle"} -->

- Status: active
- Owner: claude-code
- Priority: high
- Depends on: none

## Goal

The trip to the E exit on Fulton Street goes down the middle of the stair from the mezzanine to the hall, looking down it

## Why

The live recording after #118 showed mostly wall for about two seconds going down that stair, because the walk ran off its middle

## Allowed files

- src/lib/map/stationRoute.ts
- src/lib/map/stationRoute.test.ts
- checkpoints/CURRENT.md
- tasks/TASK-NMA-0050-fulton-stair-to-hall.md
- this task record

## Human outcome

Watching the trip to the E exit on Fulton Street, the walk goes down the stair from the mezzanine to the hall in the middle of its treads, with a wall on each side at the same distance, looking down the stair.

## Scope and boundaries

- In scope: where the route through a station runs on a stair whose line it already follows to within 0.3 m.
- Out of scope: where a route steps onto a stair from its side, stair widths, the station data, the scene and the camera rules.
- Dependencies/uncertainty: Fulton St's hall height is approximate (#97).

## Acceptance criteria

- [ ] Every route point partway down a stair at an angle to the station data's 0.5 m grid sits on that stair's line, within 5 cm
- [ ] Replaying the trip preview's camera along the live walk to the E exit, the eye goes down the stair from the mezzanine to the hall on the middle of its treads, the same distance from each side wall, looking down the stair
- [ ] The other stairs on the walk get no closer to a wall; unit tests, typecheck and lint pass

## Evidence and sources

- The live recording after #118: about 64 s in, going down the stair to the hall, one side wall takes most of the screen for about two seconds.
- The player's camera replayed in a local build on the MacBook Pro matches it. The route's points on that stair sat 0.2 to 0.27 m off its line, and the eye ran 0.76 m from one wall and 1.22 m from the other; the heading was already the stair's own, 45 degrees. With the points moved onto the line, the eye is 1 m from each wall.
- Moving points onto a stair's line from up to 1.3 m away made two later stairs worse; only points within 0.3 m move.

## Reproduction details (only when needed)

Starting revision e297663. Ask the live app "take the 4 train from Grand Central to Fulton Street leaving at 9am tomorrow", play the preview, and watch the step "Use the E exit on Fulton Street" down the stair to the hall.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none): #119; follows #117
- Primary writer / branch / source issue revision / as-of status: claude-code / fix/fulton-stair-middle / 2026-11-11
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-11 12:15:35 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["src/lib/map/stationRoute.ts, src/lib/map/stationRoute.test.ts"],"completed":["Route points on a stair within 0.3 m of its line move onto it, so the walk goes down the middle of Fulton St's stair to the hall"],"decisions":["Points further than 0.3 m from a stair's line stay put; moving them made two later stairs worse"],"evidence":["Replaying the player's camera, the eye goes down that stair 1 m from each wall instead of 0.76 and 1.22 m; 1,821 unit tests pass"],"next_action":"Merge the pull request, then record the 4 train trip to Fulton St on the live site and check 60 to 70 s","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0051","timestamp":"2026-11-11T12:15:35Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"0628d10e81ad37e344df0d3dd9442006bbaa546b34485ad3f64ad9ef50c680ed","request_id":"43e41757decb47e0a1f38fa34d6cb081","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0051"} -->

Completed:
- Route points on a stair within 0.3 m of its line move onto it, so the walk goes down the middle of Fulton St's stair to the hall

Evidence:
- Replaying the player's camera, the eye goes down that stair 1 m from each wall instead of 0.76 and 1.22 m; 1,821 unit tests pass

Decisions:
- Points further than 0.3 m from a stair's line stay put; moving them made two later stairs worse

Changed:
- src/lib/map/stationRoute.ts, src/lib/map/stationRoute.test.ts

Blocked/uncertain:
- none

Next:
- Merge the pull request, then record the 4 train trip to Fulton St on the live site and check 60 to 70 s

### 2026-11-11 12:18:20 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["none"],"completed":["work completed"],"decisions":["no new decisions"],"evidence":["no external evidence recorded"],"next_action":"Merge #120, then record the live Fulton trip and check 60-70 s","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0051","timestamp":"2026-11-11T12:18:20Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"3eb789ca64afbf3bc201fbee048c0d3b4bbe55e415efa6d62fbe53c996551fb2","request_id":"d088633373864442977ed6a61f552427","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0051"} -->

Completed:
- work completed

Evidence:
- no external evidence recorded

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- Merge #120, then record the live Fulton trip and check 60-70 s
