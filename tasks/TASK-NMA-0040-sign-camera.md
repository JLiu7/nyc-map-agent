# TASK-NMA-0040 — Sign Camera

<!-- continuity:task {"acceptance":["matchSign finds the right sign from partial and misread words, unit tested","the sign camera opens behind ?flags=+signCamera and passes the layout bar at four sizes","issue #88 records what was and was not tested on a phone"],"depends_on":[],"goal":"Tell a rider where they are in a station and which way they face from a sign the camera reads","id":"NMA-0040","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/88","next_action":"try /?flags=+signCamera on a phone at Fulton St and read about 15 photos of real signs with the text reader","owner":"unassigned","priority":"P2","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"GPS is weak below the street and slow to settle at the top of the exit stairs"} -->

- Status: active
- Owner: unassigned
- Priority: P2
- Depends on: none (pull request #87, which names the corner on Exit signs, has merged)

## Goal

Tell a rider where they are in a station and which way they face from a sign the camera reads

## Why

GPS is weak below the street and slow to settle at the top of the exit stairs

## Allowed files

- `src/lib/map/signMatch.ts` and its test
- `src/features/signcam/`
- `e2e/sign-camera.spec.ts`
- `src/lib/flags/registry.ts`, `src/features/index.ts`, `vite.config.ts`, `.size-limit.json`, `package.json`

## Human outcome

Someone standing in a station points their phone at a sign and the app says where that is and which way the exit lies, without waiting for GPS.

## Scope and boundaries

- In scope: the matching function, a minimal screen behind the `signCamera` flag, a feasibility check of what a phone browser can do.
- Out of scope: a button for it in the normal app, saving the text reader for use without signal, step counting, anything that sends camera frames to a server.
- Dependencies/uncertainty: nothing was tried on a phone, and no photo of a real sign was read. Issue #88 has the measurements and the limits.

## Acceptance criteria

- [x] `matchSign` finds the right sign from partial and misread words, with unit tests that include text the reader really produced.
- [x] The sign camera opens with `?flags=+signCamera`, in the app's eight languages, and passes the layout bar at 320, 375, 390 and 1280 wide.
- [x] Issue #88 says what a phone browser offers and what was only tested on a desktop.
- [ ] Tried on an iPhone and an Android phone in a station.

## Evidence and sources

- `pnpm exec vitest run src/lib/map/signMatch.test.ts`: the matching, including eight misreads from the feasibility run.
- `pnpm exec playwright test e2e/sign-camera.spec.ts`: the screen at four sizes, and in Spanish.
- Issue #88: how many rendered signs the reader got right, by condition, and how few of the app's signs are worded differently from each other.

## Related records

- Owning issue #88; parent #7; depends on #86 and pull request #87 for corner names on Exit signs.
- Primary writer: Claude Code session 42f88aa6, branch `feat/sign-camera`, from `main` at 3187870.

## Checkpoint log

No checkpoints yet.

### 2026-11-10 23:06:51 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["Not tested on any phone or on photos of real signs"],"changed":["src/lib/map/signMatch.ts, src/features/signcam/, e2e/sign-camera.spec.ts, flag registry, size limits, vite chunk name, tesseract.js 7.0.0"],"completed":["The sign matching function with 29 unit tests, and a camera screen behind the signCamera flag that passes the layout bar at four sizes"],"decisions":["Ship the screen behind a flag that is off by default, because the text reader missed every dim rendered sign and nothing was tried on a phone"],"evidence":["Unit tests, typecheck, boundary, licence and size checks pass locally; e2e/sign-camera.spec.ts passes at 320, 375, 390 and 1280 px; issue #88 holds the reader's results on rendered signs"],"next_action":"Try /?flags=+signCamera on a phone at Fulton St and read about 15 photos of real signs with the text reader","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0040","timestamp":"2026-11-10T23:06:51Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"f16f80e7101655cf0d55fb6158fe6b8f88c903c6217f6ea2ea810a98f4b68b1a","request_id":"e120224005354230acf4828770b07272","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0040"} -->

Completed:
- The sign matching function with 29 unit tests, and a camera screen behind the signCamera flag that passes the layout bar at four sizes

Evidence:
- Unit tests, typecheck, boundary, licence and size checks pass locally; e2e/sign-camera.spec.ts passes at 320, 375, 390 and 1280 px; issue #88 holds the reader's results on rendered signs

Decisions:
- Ship the screen behind a flag that is off by default, because the text reader missed every dim rendered sign and nothing was tried on a phone

Changed:
- src/lib/map/signMatch.ts, src/features/signcam/, e2e/sign-camera.spec.ts, flag registry, size limits, vite chunk name, tesseract.js 7.0.0

Blocked/uncertain:
- Not tested on any phone or on photos of real signs

Next:
- Try /?flags=+signCamera on a phone at Fulton St and read about 15 photos of real signs with the text reader
