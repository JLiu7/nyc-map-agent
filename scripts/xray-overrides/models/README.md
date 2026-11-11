# Station models (not loaded by the app yet)

Blender exports of the hand-made station layouts in `scripts/xray-overrides/`, kept for a later change that teaches the x-ray view to load a `.glb` (see #101). Nothing in the app reads this folder today, so it is not under `public/` and is not deployed.

| File | Station | Built from |
|---|---|---|
| `jackson-hts-roosevelt-av.glb` | Jackson Hts-Roosevelt Av (G14) | `../jackson-hts-roosevelt-av.json` |

Each model follows #101's spec: one `.glb` under 2 MB, in metres, origin at the station's point in `public/transit/subway.json`, +X east, +Y north, +Z up (exported without glTF's Y-up conversion), street level at 0, mezzanine at -5 m and platforms at -10 m (one OpenStreetMap level = 5 m, as `LEVEL_M` in `src/features/transit/model.ts`). Floors, platforms, stairs, passages and elevator shafts are separate named objects, for example `Mezzanine (level -1)` and `Stair 4 (level -2 to -1)`.

The geometry is derived from OpenStreetMap data, © OpenStreetMap contributors, available under the Open Database License (https://www.openstreetmap.org/copyright), like the rest of `public/transit/xray.json`.
