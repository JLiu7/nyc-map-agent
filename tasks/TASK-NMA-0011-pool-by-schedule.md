# TASK-NMA-0011 — Pool By Schedule

<!-- continuity:task {"acceptance":["segment lookups pool over the MTA schedule and a time-of-day band","subway and bus both use the pool","the pooled SQL runs on the real table and yields more usable segments"],"depends_on":[],"goal":"Learned train and bus times pool by MTA schedule and time of day.","id":"NMA-0011","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/20","next_action":"after #650 deploys, spot-check /api/transit-segments/all on the live site; score pooled vs per-hour accuracy once #594 exists","owner":"claude-code","priority":"P2","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"Per-hour-of-week buckets rarely had 3 samples, so learned times seldom applied (#648)."} -->

- Status: active
- Owner: claude-code
- Priority: P2
- Depends on: none

## Goal

Learned train and bus times pool by MTA schedule and time of day.

## Why

Per-hour-of-week buckets rarely had 3 samples, so learned times seldom applied (#648).

## Allowed files

- `server/features/transit/segments.ts`, `busSegments.ts`, `segments.test.ts`, `checkpoints/`, this file.

## Human outcome

Learned times apply in many more places.

## Scope and boundaries

- In scope: the read side (API SQL).
- Out of scope: the recorder, holidays, accuracy scoring (#594).
- Dependencies/uncertainty: medians are averaged by count, an approximation.

## Acceptance criteria

- [ ] Pooled lookups for subway and bus.
- [ ] Tests pass.
- [ ] More usable segments on real data.

## Evidence and sources

Real table (60,664 rows, 92,316 samples): Wed 8am 0 to 1,352 usable segments; weekday 3am 0 to 846; Sat 10pm 17 to 298. MTA GTFS calendars: Weekday, Saturday, Sunday only. vitest server/features/transit: 44 passed.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none): #648, related #594, no parent.
- Primary writer / branch / source issue revision / as-of status:
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-01 17:46:30 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["none"],"changed":["server/features/transit/segments.ts, busSegments.ts, segments.test.ts"],"completed":["Pooled learned subway and bus times by MTA schedule and time of day; opened #650 with auto-merge"],"decisions":["no new decisions"],"evidence":["real table: Wed 8am 0 to 1352 usable segments, weekday 3am 0 to 846, Sat 10pm 17 to 298; vitest server/features/transit 44 passed; tsc, eslint clean"],"evidence_class":"observed","next_action":"after #650 deploys, spot-check the live endpoint; score accuracy once #594 has an error score","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0011","timestamp":"2026-11-01T17:46:30Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"93b6245f670b5703f9a0bdafc0edbda1d9d21f41599421f58c2dd3c690cad67e","request_id":"511de3f7b2b143df90b18a8c4ca6414c","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0011"} -->

Completed:
- Pooled learned subway and bus times by MTA schedule and time of day; opened #650 with auto-merge

Evidence:
- real table: Wed 8am 0 to 1352 usable segments, weekday 3am 0 to 846, Sat 10pm 17 to 298; vitest server/features/transit 44 passed; tsc, eslint clean

Decisions:
- no new decisions

Changed:
- server/features/transit/segments.ts, busSegments.ts, segments.test.ts

Blocked/uncertain:
- none

Next:
- after #650 deploys, spot-check the live endpoint; score accuracy once #594 has an error score

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
