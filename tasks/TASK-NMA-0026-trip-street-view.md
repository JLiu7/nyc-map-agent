# TASK-NMA-0026 — Trip Street View

<!-- continuity:task {"acceptance": ["on the default Map view, every street walk in the trip preview is seen from a 1.7 m eye facing along the route", "boarding eases back to the overhead camera and getting off eases into the eye again", "where the station's x-ray ways connect, the walk in goes down the mapped steps to the platform by the train and the walk out climbs to the exit; elsewhere the plain overhead switch stays", "unit tests cover the path picking, the eye rig and the stair timing"], "depends_on": [], "goal": "Trip preview walks at street level and goes down the station's real stairs", "id": "NMA-0026", "issue_url": "https://github.com/pukujan-lab-2/nyc-map-agent/issues/52", "next_action": "merge the pull request, then watch a trip preview on a phone", "owner": "claude-code", "priority": "medium", "protocol_version": "0.1.0-draft", "schema": "project-continuity.task.v1", "status": "active", "why": "The preview showed walks from above and slid the marker through walls into the station"} -->

- Status: active
- Owner: claude-code
- Priority: medium
- Depends on: none

## Goal

Trip preview walks at street level and goes down the station's real stairs

## Why

The preview showed walks from above and slid the marker through walls into the station

## Allowed files

- `src/features/agent/` (usePlayer, flythrough, stationStairs, tripCamera and their tests), `src/lib/transit/stationXray.ts`, `src/features/transit/xray.ts` (re-export only), `tasks/`, `checkpoints/CURRENT.md`

## Human outcome

Pressing Play on a subway trip shows the walk to the station from the rider's eyes, goes down the station's real stairs with the station drawn in x-ray, rides overhead, then climbs out and walks to the door at eye level.

## Scope and boundaries

- In scope: the trip preview's camera on foot and its path through stations.
- Out of scope: the x-ray data and its hand-made station layouts (another pull request), the real street view mode, a view picked from Change view (still wins).
- Dependencies/uncertainty: 77 of 273 stations with x-ray data connect an entrance to a platform today; the rest fall back.

## Acceptance criteria

- [x] on the default Map view, every street walk in the trip preview is seen from a 1.7 m eye facing along the route
- [x] boarding eases back to the overhead camera and getting off eases into the eye again
- [x] where the station's x-ray ways connect, the walk in goes down the mapped steps to the platform by the train and the walk out climbs to the exit; elsewhere the plain overhead switch stays
- [x] unit tests cover the path picking, the eye rig and the stair timing

## Evidence and sources

Link repository state at a revision and cite external factual claims directly. Record commands and results for claims that need verification.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none):
- Primary writer / branch / source issue revision / as-of status:
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-08 05:11:22 UTC — agent:claude-code/707af18f-ccd3-4e8f-917c-cd07000185b4

<!-- continuity:checkpoint {"agent":"agent:claude-code/707af18f-ccd3-4e8f-917c-cd07000185b4","blocked":[],"changed":["src/features/agent (usePlayer, flythrough, stationStairs, tripCamera), src/lib/transit/stationXray.ts, .size-limit.json"],"completed":["The trip preview walked overhead and slid through walls into the station; it now walks at eye level, goes down the mapped stairs with x-ray, and eases to and from the overhead camera at board and alight"],"decisions":["no new decisions"],"evidence":["unit tests (stationStairs.test.ts, tripCamera.test.ts) pass; a headless run of the e2e trip fixture showed an 85 degree eye on the walks, the Union Sq stairs in x-ray, an overhead ride and a plain switch at Grand Central"],"next_action":"merge the pull request, then watch a trip preview on a phone","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0026","timestamp":"2026-11-08T05:11:22Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"7fd17d50a0f6a9a356ea9f6f642b35597e24e88533b7248e9513fb3ff7db8ffe","request_id":"4f0c6464299141c2847a1c81a11761aa","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0026"} -->

Completed:
- The trip preview walked overhead and slid through walls into the station; it now walks at eye level, goes down the mapped stairs with x-ray, and eases to and from the overhead camera at board and alight

Evidence:
- unit tests (stationStairs.test.ts, tripCamera.test.ts) pass; a headless run of the e2e trip fixture showed an 85 degree eye on the walks, the Union Sq stairs in x-ray, an overhead ride and a plain switch at Grand Central

Decisions:
- no new decisions

Changed:
- src/features/agent (usePlayer, flythrough, stationStairs, tripCamera), src/lib/transit/stationXray.ts, .size-limit.json

Blocked/uncertain:
- none

Next:
- merge the pull request, then watch a trip preview on a phone

### 2026-11-08 23:10:43 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":[],"changed":["none"],"completed":["Fixed the PR title to a Conventional Commit and merged main (with #63); all-JS budget 1111 kB"],"decisions":["no new decisions"],"evidence":["size-limit passes; 1,687 unit tests pass; types clean"],"evidence_class":"observed","next_action":"auto-merge lands it when CI passes; if #61 lands first, merge main again for the size budget and CURRENT.md","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0026","timestamp":"2026-11-08T23:10:43Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"6734f3bcb548d34c8ea55c9b68eab32ee32543f5bd4a96460f16f33913276e49","request_id":"e7ae3b7e84a4485c98afe8f991fafcc7","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0026"} -->

Completed:
- Fixed the PR title to a Conventional Commit and merged main (with #63); all-JS budget 1111 kB

Evidence:
- size-limit passes; 1,687 unit tests pass; types clean

Decisions:
- no new decisions

Changed:
- none

Blocked/uncertain:
- none

Next:
- auto-merge lands it when CI passes; if #61 lands first, merge main again for the size budget and CURRENT.md

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
