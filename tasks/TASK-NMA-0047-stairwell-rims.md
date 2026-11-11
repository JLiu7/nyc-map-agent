# TASK-NMA-0047 — Stairwell Rims

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"Give each stairwell cut in a ceiling or floor a clean, closed edge, with no shards and no view of the floor above","id":"NMA-0047","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/111","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Climbing a stair, the ceiling broke into jagged pieces and the floor above showed through (recording of a 4 train trip to Fulton St, 2026-11-11)"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

Give each stairwell cut in a ceiling or floor a clean, closed edge, with no shards and no view of the floor above

## Why

Climbing a stair, the ceiling broke into jagged pieces and the floor above showed through (recording of a 4 train trip to Fulton St, 2026-11-11)

## Allowed files

- `src/lib/map/stationWalk.ts` (where ceilings and floors are cut round a stair, and the rim along it)
- `src/lib/map/three/stationScene.ts` (drawing the rim, closing the wedges at a stair's bends)
- `src/lib/map/stationWalk.test.ts`
- this task record and `checkpoints/CURRENT.md`

## Human outcome

Climbing out of Fulton St in the trip preview, the ceiling overhead and the floor above meet each stair in a clean edge, so the demo recording no longer shows the ceiling breaking into pieces.

## Scope and boundaries

- In scope: the edge where a stairwell is cut in a room's ceiling or in the floor above, and the gaps on the outside of a stair's bends.
- Out of scope: stair widths (widening them broke the 14 St-Union Sq route in the browser test), how people walk through a station, the stepped tops of stair side walls where a parapet meets a full wall.
- Dependencies/uncertainty: checked with fixed camera views in a local build, not by replaying the recorded trip.

## Acceptance criteria

- [x] Looking up from a room beside a stair, the ceiling meets the stair's side walls in a straight line.
- [x] Climbing, no piece of the room's ceiling or of the upper floor hangs inside the stair's walls under its own ceiling.
- [x] Nothing opens on the outside of a stair's bends.
- [x] Steps stay 2 m wide; walking is unchanged.
- [x] A unit test at Fulton St and 14 St-Union Sq fails if a slab cell reaches inside a stair's walls where the stairwell opens it.

## Evidence and sources

- Fixed camera views of Fulton St (station `418`) rendered on the MacBook Pro from a local build, before and after: 26 views of four stairs (foot, middle, climbing, from below on each side, from above) and two climbing views on each of 20 inner stairs.
- A raycast through the remaining shard over one climb hit the upper floor at -5 m, 0.5 m from the stair's line; after the change the same ray hits the head wall.
- `pnpm test`: 1,819 passed, 8 skipped. `pnpm typecheck` and `pnpm lint` pass.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none):
- Primary writer / branch / source issue revision / as-of status:
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-11 06:32:01 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["src/lib/map/stationWalk.ts, src/lib/map/three/stationScene.ts, src/lib/map/stationWalk.test.ts, .size-limit.json"],"completed":["Stairwell edges in ceilings and floors follow the stair's outline, with rims, a floor head strip and filled bends"],"decisions":["no new decisions"],"evidence":["1,819 unit tests passed; typecheck and lint clean; 26 under-stair and climb views at Fulton St compared before and after"],"next_action":"Merge the pull request, then watch the 4 train trip to Fulton St on the live site","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0047","timestamp":"2026-11-11T06:32:01Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"214feab893cf48b6e69cda38dcae97e4b2aefbf5a0170e0b1f1010ec2dd477b2","request_id":"9777fef40d874f189ef29da5baba0625","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0047"} -->

Completed:
- Stairwell edges in ceilings and floors follow the stair's outline, with rims, a floor head strip and filled bends

Evidence:
- 1,819 unit tests passed; typecheck and lint clean; 26 under-stair and climb views at Fulton St compared before and after

Decisions:
- no new decisions

Changed:
- src/lib/map/stationWalk.ts, src/lib/map/three/stationScene.ts, src/lib/map/stationWalk.test.ts, .size-limit.json

Blocked/uncertain:
- none

Next:
- Merge the pull request, then watch the 4 train trip to Fulton St on the live site

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
