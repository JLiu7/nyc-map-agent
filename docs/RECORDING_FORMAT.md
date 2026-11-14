# Station walk recording format

One JSON file per walk through a station. The types and the checker are in `src/features/recorder/format.ts` (`Recording`, `parseRecording`). Version 1; the field names are fixed.

Every `t` is epoch milliseconds. Every list can be empty: a phone browser has no barometer, and GPS is often off underground.

| Field | What it is | Unit |
|---|---|---|
| `v` | Format version, always `1` | |
| `station` | Station name, if known (optional) | text |
| `startedAt` | When the recording started | epoch ms |
| `device` | Phone model | text |
| `motion` | Rows of `[t, ax, ay, az, rx, ry, rz]`: acceleration including gravity, and rotation rate | m/s², deg/s |
| `heading` | Rows of `[t, alpha, beta, gamma]`: the phone's orientation, as the browser's DeviceOrientation event gives it (alpha 0 to 360, beta -180 to 180, gamma -90 to 90) | degrees |
| `gps` | Rows of `[t, lat, lon, accuracyM]`: a location fix and how far off it may be | degrees, metres |
| `baro` | Rows of `[t, relativeAltitudeM]`: height relative to where the recording started | metres |
| `steps` | Rows of `[t, count]`: steps counted since the recording started | steps |
| `marks` | Things the walker flagged: `{ t, kind, note? }` with `kind` one of `sign`, `stairs`, `elevator` | |
| `video` | The camera file and when it started: `{ file, startedAt }` (optional; the video itself never goes in this file) | text, epoch ms |

## Conventions worth knowing

- **Acceleration sign.** The converter keeps the iPhone's own sign: a phone lying face up reads about -9.8 on `az`. A browser on Android reports the opposite sign, so the reader should check the sign of gravity before using it.
- **Heading has no north.** `alpha` is measured from wherever the phone's reference frame started, not from magnetic north.
- **Orientation range.** When the phone is tipped past upright, `beta` can pass 90 and `gamma` stays within -90 to 90, like the browser's own values.

## Converting a Sensor Logger export

The iPhone app Sensor Logger writes one CSV per sensor. To turn an export (a folder or the `.zip`) into one recording:

```bash
pnpm walk:from-sensor-logger <export folder or .zip> <out.json> --station "Fulton St"
```

It prints each list's row count and time span. `Location.csv` is missing when GPS was off, which leaves `gps` empty. `marks` stays empty: Sensor Logger annotations are not converted. Keep the raw export and the video out of the repository.
