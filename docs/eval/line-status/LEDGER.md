# Line status eval ledger

One row per iteration, newest at the bottom. Rates are the share of trials with no check violated. Details of how to read this are in `PROGRAM.md`.

| Date | Change | Runs (labels) | Train before to after | Held-out before to after | Verdict | What it taught us |
|---|---|---|---|---|---|---|
| 2026-11-01 | None: baseline of the prompt merged in #628 | `baseline-after-628` (3 trials per case, 58 cases, 174 trials) | 14.6% (18 of 123) | 25.5% (13 of 51) | Baseline | Most failures are two things: the model's own closing "Want to start?" (92 trials) and an invented shuttle bus (63). Also: "nothing is wrong" despite an alert (22), advice naming skipped stops (17), change at a skipped stop (6), no reply at all (6). The same question passes 100% worded one way and 0% worded another (`a-trouble/wording`). Run on LFM3 via the Pro, commit `b17e6ce7f88a`, prompt hash `ad15707b466e`. |
| 2026-11-01 | Code: the model's own "Want to start?" is dropped when no trip set a follow-up (`server/features/agent/routes.ts`) | `baseline-after-628` to `try-no-own-close` (3 trials per case, 58 built-in cases, 174 trials each) | 14.6% (18 of 123) to 43.9% (54 of 123) | 25.5% (13 of 51) to 39.2% (20 of 51) | keep | Most of the unwanted offer came from the app, not the prompt: dropping one exact sentence cleared 87 of the 92 trials that failed it. The 5 that remain word it differently ("Want to start planning your trip?"), so the next change is the shape of what the route holds back, not another prompt rule. |
