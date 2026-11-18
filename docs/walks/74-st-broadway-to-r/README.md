# Changing from the 7 to the R at 74 St-Broadway

A rider got off a Flushing-bound 7 at 74 St-Broadway on Nov 16, 2026 at 9:44 pm and walked to the Queens-bound R at Jackson Hts-Roosevelt Av, filming on an iPhone 16 with Sensor Logger running on the same phone. The walk took 5 min 52 s, about 486 steps and 250 m, and went down about 17 m by the barometer.

The elevator they took lands on the Manhattan-bound platform. To reach the R toward Forest Hills they climbed one flight to the crossover mezzanine and went down the "Forest Hills & Jamaica" stair. Anyone writing directions for this transfer should know that.

## Files here

| File | What it holds |
|---|---|
| `74-st-broadway-to-r-walk.json` | The whole sensor recording in the app's recording format (`docs/RECORDING_FORMAT.md`), made with `pnpm walk:from-sensor-logger`. Steps and `video.startedAt` were added afterwards. `parseRecording` accepts it. |
| `74-st-broadway-to-r-path.geojson` | The placed path as one line, plus a point for each step of the route below. |
| `74-st-broadway-to-r-path.csv` | The same path, one row per step, with epoch time, video time, metres east and north of the Jackson Hts-Roosevelt Av point in `public/transit/subway.json`, longitude, latitude and a `kind` column (walk, stairs_down, stairs_up, elevator). |
| `74-st-broadway-to-r-path.png` | The path drawn on OpenStreetMap, with the 7 platforms in purple and the E F M R platforms in orange. Map © OpenStreetMap contributors. |

The video is not in the repository. It is 700 MB, and the people in it are not blurred.

## The route, by video time

| Video | What happens |
|---|---|
| 0:00 | Off the Flushing-bound 7 on the south platform of 74 St-Broadway, which is elevated. |
| 0:00-1:14 | West along the platform toward "Exit 73 St & 37 Rd", about 70 m. |
| 1:14 | Turns back east. |
| 1:14-2:10 | East along the platform to the stair near the 74/75 St end. |
| 2:10-2:17 | Stair down to a landing beside the elevator. |
| 2:26-2:30 | Stair signed "Buses" down to a passage. |
| 2:30-2:54 | Along the passage. |
| 2:54-3:02 | Stair down into the glass-walled station house above fare control. |
| 3:09 | Through the turnstiles. |
| 3:16-3:28 | Stairs down, signed E F M R, to the lower mezzanine. |
| 3:40-4:38 | E F M R elevator. Its buttons read Upper Mezzanine, Lower Mezzanine and Platform. Waiting and riding take about 50 s. |
| 4:38 | Out on the Manhattan-bound E F M R platform, under a "Roosevelt" sign. |
| 4:38-5:00 | East-southeast along that platform. |
| 5:00-5:12 | Stair up signed "Exit 7" to the crossover mezzanine. At the top a sign points back down to "Manhattan & Brooklyn". |
| 5:18-5:26 | Across the mezzanine ("75 St & Bway" one way, "Exit 74 St, 24 hr booth" the other), past shop windows. |
| 5:28-5:35 | Stair down signed "Forest Hills & Jamaica E F M R", to a "Local / Express" sign at the bottom. |
| 5:36-5:52 | On the Queens-bound platform, express (E, F) on one side and local (M, R) on the other, signed "Forest Hills & Jamaica via Local". |

## How the video and sensors were lined up

The video starts 7.6 s into the sensor log, one second after the file's own start time. We found that by measuring how far each frame shifts sideways, which is the camera panning, and sliding that against the gyroscope's turn rate. They match best at 7.6 s (correlation 0.68). Same phone, so the clocks don't drift.

Steps were counted from bounces in the raw acceleration, at 0.60 m walking and 0.30 m on stairs. Bounces during the elevator ride were dropped. GPS on the elevated platform backs the short stride: 71 m for about 126 steps while filming.

Direction comes from the gyroscope, smoothed over 3 s. North was set from the two straight walks along the 7 platform, whose mapped bearing is 262° west and 82° east. The two walks agree to within 2°.

## How the path was placed

These points are pinned:

- the start and the turnaround, on the 7 platform at the phone's GPS positions, which were good up there (4-7 m)
- the top of the 7 platform stair (OpenStreetMap, -73.891125, 40.746769)
- the turnstiles, at the middle of the MTA's three station-house points for this station (an estimate)
- the elevator at -73.890969, 40.746617, the mapped mezzanine-to-platform elevator nearest the Manhattan-bound platform
- both ends of the stair up from the Manhattan-bound platform and of the stair down to the Queens-bound platform, from Jackson Hts-Roosevelt Av's stairs in `public/transit/xray.json`
- the end, on the Queens-bound platform's centre line

Between pinned points the path keeps the shape the steps and turns give and is stretched to fit. After the elevator that shape met the mapped stairs within 0.5-6 m without help. On the 7 platform the corrections were 5-12 m.

## What to trust less

The stretch inside the 7 station, from the platform stair to the turnstiles (video 2:10-3:09), needed a 24 m correction and draws as loops. The walker turned on landings and in the passage while filming, and the turnstile point is a guess. A plan of the 74 St station would fix it.

The barometer runs about 10 s behind the video, so stair and elevator times come from the video. Underground GPS was 14-85 m off and was not used. Which E F M R platform is which comes from the signs in the video and from trains keeping right: the south island is Queens-bound, the north island Manhattan-bound.

This walk didn't look for an elevator to the Queens-bound platform. Check that before telling a rider who needs step-free access how to make this change.

## Recording the next one

Start Sensor Logger before the camera, and tap the phone once where the camera can see it, which gives the clock offset directly. Pause for a second at the top and bottom of each stair, at the turnstiles and at each elevator door. Say which platform each elevator goes to.
