# TASK-NMA-0042 — Fulton Floor Outlines

<!-- continuity:task {"acceptance":["A corridor written as a closed outline is a room in the walkable station, the reachability check, the x-ray view and the fallback path finder","Fulton St holds nine traced rooms placed on real positions, with every platform still reachable","The Grand Central to Fulton St preview is recorded before and after at 390x844"],"depends_on":[],"goal":"Give Fulton St's mezzanines, passages and the Fulton Center hall their real floor shapes, traced from a reference model and placed on real positions","id":"NMA-0042","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/97","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"The station data holds only centre lines, so every room is a 3 m strip and the hall beside the 4/5 platform is missing"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

Give Fulton St's mezzanines, passages and the Fulton Center hall their real floor shapes, traced from a reference model and placed on real positions

## Why

The station data holds only centre lines, so every room is a 3 m strip and the hall beside the 4/5 platform is missing

## Allowed files

- `scripts/xray-overrides/fulton.json`, `scripts/xray-overrides.ts`, `public/transit/xray.json`
- `src/lib/map/stationWalk.ts`, `src/features/transit/xray.ts`, `src/features/agent/stationStairs.ts`, and their tests

## Human outcome

Walking out of Fulton St in a trip preview, you step from the 4/5 platform into the Fulton Center hall and see rooms the shape of the real ones, instead of 3 m passages.

## Scope and boundaries

- In scope: the Fulton Center hall, the two mezzanines west of the 4/5, the Dey St passage block, the 4/5 exit passage, the two south exit rooms, the A/C mezzanine, the 2/3 mezzanine; reading a closed corridor as a room.
- Out of scope: the J/Z area, the long passages south-east of the 4/5, street stairs the reference draws where our real entrances are not.
- Dependencies/uncertainty: the reference model is a diagram, so each part was fitted to real positions by itself; levels are whole storeys of 5 m.

## Acceptance criteria

- [x] A closed corridor outline fills as a room, with unit tests in the four places that read corridors.
- [x] Nine traced rooms are in the Fulton St layout; the six platform outlines and the 52 earlier stair lines are unchanged; the build's reachability check passes.
- [x] Misfit reported per part: about 1 m at the 4/5 platform ends, 0.3 to 1.5 m at the 2/3 platform stairs; 33 of the 52 stair lines end on a traced floor or within 2.4 m of one.
- [ ] Watched on the live site after the deploy.

## Evidence and sources

Straight-down and tilted pictures of the reference model, taken through its viewer's own controls at about 0.1 m a pixel, were traced with OpenCV and kept outside the repository. `pnpm build:xray-overrides` passes its check that every platform is reachable. Floor on the first level down went from 2,415 to 6,376 square metres and on the second from 1,772 to 2,512; the joins the app adds by itself fell from 42 to 28.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none): #97; follows #95.
- Primary writer / branch / source issue revision / as-of status: Claude Code / `feat/fulton-floor-outlines` / as of 2026-11-11.
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-11 01:41:04 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["scripts/xray-overrides/fulton.json, public/transit/xray.json, src/lib/map/stationWalk.ts, scripts/xray-overrides.ts, src/features/transit/xray.ts, src/features/agent/stationStairs.ts"],"completed":["Fulton St has nine traced rooms and a closed corridor outline is read as a room"],"decisions":["no new decisions"],"evidence":["pnpm build:xray-overrides passes its reachability check; 656 unit tests for the map, assistant, transit and scripts pass; preview recorded at 390x844 before and after in a local build"],"next_action":"Merge the pull request, then watch the Fulton St walk on the live site","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0042","timestamp":"2026-11-11T01:41:04Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"30042d7ecab7ab1d7417f15ee2291ad13a95e8c8314442506e8838e6a62f48dd","request_id":"2e85476c86e446e7b060659c75c9649c","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0042"} -->

Completed:
- Fulton St has nine traced rooms and a closed corridor outline is read as a room

Evidence:
- pnpm build:xray-overrides passes its reachability check; 656 unit tests for the map, assistant, transit and scripts pass; preview recorded at 390x844 before and after in a local build

Decisions:
- no new decisions

Changed:
- scripts/xray-overrides/fulton.json, public/transit/xray.json, src/lib/map/stationWalk.ts, scripts/xray-overrides.ts, src/features/transit/xray.ts, src/features/agent/stationStairs.ts

Blocked/uncertain:
- none

Next:
- Merge the pull request, then watch the Fulton St walk on the live site

### 2026-11-11 01:41:14 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["scripts/xray-overrides/fulton.json, public/transit/xray.json, src/lib/map/stationWalk.ts, scripts/xray-overrides.ts, src/features/transit/xray.ts, src/features/agent/stationStairs.ts"],"completed":["Fulton St has nine traced rooms and a closed corridor outline is read as a room"],"decisions":["no new decisions"],"evidence":["pnpm build:xray-overrides passes its reachability check; 656 unit tests for the map, assistant, transit and scripts pass; preview recorded at 390x844 before and after in a local build"],"next_action":"Merge the pull request, then watch the Fulton St walk on the live site","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0042","timestamp":"2026-11-11T01:41:14Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"30042d7ecab7ab1d7417f15ee2291ad13a95e8c8314442506e8838e6a62f48dd","request_id":"ee698ed38f144c0c9d89ad854742f80c","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0042"} -->

Completed:
- Fulton St has nine traced rooms and a closed corridor outline is read as a room

Evidence:
- pnpm build:xray-overrides passes its reachability check; 656 unit tests for the map, assistant, transit and scripts pass; preview recorded at 390x844 before and after in a local build

Decisions:
- no new decisions

Changed:
- scripts/xray-overrides/fulton.json, public/transit/xray.json, src/lib/map/stationWalk.ts, scripts/xray-overrides.ts, src/features/transit/xray.ts, src/features/agent/stationStairs.ts

Blocked/uncertain:
- none

Next:
- Merge the pull request, then watch the Fulton St walk on the live site

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
