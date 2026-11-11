# TASK-NMA-0041 — Street Shop Taps

<!-- continuity:task {"acceptance":["replace this with observable, task-specific acceptance checks"],"depends_on":[],"goal":"Tapping a shop in street view opens that shop, with its photo and its Google Maps page","id":"NMA-0041","issue_url":"https://github.com/pukujan-lab-2/nyc-map-agent/issues/92","next_action":"define scope and observable acceptance checks, then begin bounded work","owner":"unassigned","priority":"P1","protocol_version":"0.1.0-draft","schema":"project-continuity.task.v1","status":"active","why":"A tap on a shop sign opened a bus stop behind the walker, or nothing, and the photo link faced the wrong way"} -->

- Status: active
- Owner: unassigned
- Priority: P1
- Depends on: none

## Goal

Tapping a shop in street view opens that shop, with its photo and its Google Maps page

## Why

A tap on a shop sign opened a bus stop behind the walker, or nothing, and the photo link faced the wrong way

## Allowed files

- `src/lib/map/eyePick.ts`, `src/lib/map/streetPick.ts`, `src/lib/map/storefrontPick.ts`, `src/lib/map/storefrontLinks.ts`, `src/lib/map/three/storefronts.ts`
- `src/components/MapView.tsx` (the tap handler only), `src/components/MapPanel.tsx`, `src/components/StorefrontCard.tsx`, `src/components/StreetMiniMap.tsx`, `src/lib/store/PanelContext.tsx`
- `src/features/transit/TransitLayer.tsx` (the flat bus stop icon's tap only)
- `e2e/street-shops.spec.ts`

## Human outcome

Someone walking a block in street view taps a shop and gets that shop: its name, the real street photo facing it and its Google Maps page, in a card two lines tall that leaves the street in view.

## Scope and boundaries

- In scope: how a street-level tap is matched to a shop, a restroom kiosk, a bus stop pole or a subway entrance; the shop card; the street minimap on phones under 600 px tall.
- Out of scope: which shops the city tiles contain; brand logos on signs (the public OpenStreetMap query service they depend on was not answering on 2026-11-10, recorded in #92); the trip preview and the station scene, which other work in flight owns.
- Dependencies/uncertainty: reproduced in a local build fed by the live API at 375×812, not on a real phone.

## Acceptance criteria

- [x] A tap on a shop's sign or window opens that shop, whatever building it is on and whichever floor its sign hangs at.
- [x] A tap on a bare wall opens nothing, and a bus stop pole behind the walker never answers a tap.
- [x] With a card open on a phone, the next tap still lands where the finger is.
- [x] The card's first view links to the street photo facing the shop and to the shop on Google Maps, and stays under 100 px tall on a phone.
- [x] `e2e/street-shops.spec.ts` taps a shop at 320×568, 375×667, 390×844 and 1280×800 and passes the layout bar with the card open.
- [ ] Tapping a shop on the live site after the deploy opens the right card with a working photo and map link.

## Evidence and sources

Issue #92 lists the eight faults found and the measurements behind them. At Broadway and Fulton Street a tap on the Gong Cha sign opened "Church Street/Liberty Street, Bus stop": the pole is 178 m behind the walker, and the old pick placed it at (24, 1624) on a 375×812 screen, wider and taller than the screen. 27 of the 41 shops within 150 m of the corner sit on buildings without the city data's retail flag, which the tap handler required. With a card open the phone pads the map's bottom by 179 px and taps were aimed 90 px low. Screenshots: branch `pr-assets/street-shops`.

## Reproduction details (only when needed)

Starting revision, material inputs/configuration, runtime, exact command or prompt, observed result, and limitations.

## Related records

- Required leaf owning issue, parent ancestry and dependencies (or explicitly none):
- Primary writer / branch / source issue revision / as-of status:
- Related PR/CI evidence and push receipt (request ID / SHA):

## Checkpoint log

No checkpoints yet.

### 2026-11-10 23:23:10 UTC — claude-code

<!-- continuity:checkpoint {"agent":"claude-code","blocked":["Brand logos on signs still depend on the public OpenStreetMap query service, which was not answering on 2026-11-10 (left open in the record of issue 92)"],"changed":["src/lib/map/streetPick.ts, eyePick.ts, storefrontPick.ts, storefrontLinks.ts, three/storefronts.ts; src/components/MapView.tsx, MapPanel.tsx, StorefrontCard.tsx, StreetMiniMap.tsx"],"completed":["Street-level taps follow the camera's ray: a shop's sign or window opens that shop, and a bus stop pole behind the walker no longer answers","The shop card links to the street photo facing the shop and to the shop on Google Maps"],"decisions":["no new decisions"],"evidence":["e2e/street-shops.spec.ts passes at 320x568, 375x667, 390x844 and 1280x800 with the layout bar; 1,758 unit tests pass"],"next_action":"Merge the pull request, then tap the Gong Cha sign at Broadway and Fulton Street on the live site at phone size","protocol_version":"0.1.0-draft","schema":"project-continuity.checkpoint.v1","task_id":"NMA-0041","timestamp":"2026-11-10T23:23:10Z"} -->
<!-- continuity:checkpoint-operation {"payload_sha256":"46c4d34bc5cd7914a41d4f8573ad32f6d4f71814a8a07e8be15037d8c76ffc6c","request_id":"2eae37d515f7416abe2095302a9eaaee","schema":"project-continuity.checkpoint-operation.v1","task_id":"NMA-0041"} -->

Completed:
- Street-level taps follow the camera's ray: a shop's sign or window opens that shop, and a bus stop pole behind the walker no longer answers
- The shop card links to the street photo facing the shop and to the shop on Google Maps

Evidence:
- e2e/street-shops.spec.ts passes at 320x568, 375x667, 390x844 and 1280x800 with the layout bar; 1,758 unit tests pass

Decisions:
- no new decisions

Changed:
- src/lib/map/streetPick.ts, eyePick.ts, storefrontPick.ts, storefrontLinks.ts, three/storefronts.ts; src/components/MapView.tsx, MapPanel.tsx, StorefrontCard.tsx, StreetMiniMap.tsx

Blocked/uncertain:
- Brand logos on signs still depend on the public OpenStreetMap query service, which was not answering on 2026-11-10 (left open in the record of issue 92)

Next:
- Merge the pull request, then tap the Gong Cha sign at Broadway and Fulton Street on the live site at phone size

## Handoff

Read PROJECT → CURRENT → this task → minimum relevant spec. Checkpoint before stopping.
