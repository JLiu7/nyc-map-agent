# Trip suite ledger

One row per run that decides something, newest at the bottom. Rates are the share of turns with no check broken. How to run and read the suite is in [`README.md`](README.md).

| Date | Change | Run (label) | Clean turns | Verdict | What it taught us |
|---|---|---|---|---|---|
| 2026-11-01 | None: first baseline | `baseline` (12 conversations, 3 trials each, 51 turns) | 41.2% (21 of 51) | Baseline | Most failures come from the app's code, not the model. The fast path for a plain trip question plans without the model and sends the trip as a button, so nothing is drawn (14 turns). It also answers a Spanish question in English (3) and asks "Where are you starting from?" when the question named the start (3, Penn Station to JFK). Every empty reply (7) stopped at the 8-step cap after 8 tool calls, before any text. The model's own failures: a trip id shown to the rider (3), the restroom tool answering a new destination (4), and a Chinese place name (法拉盛, Flushing) it could not find (3). Run on LFM3 1.7B via the Pro, with OTP and Valhalla on the VPS, prompt hash `ad15707b466e`, code at `d372526` (the runner recorded `d0795df` because the readback change was not yet committed). |
