# Handoff for DeepSeek: make the line status answers right

You are taking over a measured improvement loop. Read this file, then `PROGRAM.md` (the loop you follow), then `LEDGER.md` (what has been tried). Everything you need to run it is in this repository. The owning issue is [#629](https://github.com/Pukujan-lab/nyc-map-agent/issues/629). The reading mistake that started it is [#627](https://github.com/Pukujan-lab/nyc-map-agent/issues/627).

## The problem in one paragraph

NYC Map has a chat assistant. When a rider asks "Is the A train running near Times Square?", the app calls a tool, `line_status`, that returns correct facts from the MTA's alert feed. A small model, LFM3 (1.7 billion parameters, running on the owner's MacBook Pro), then has to say those facts in one or two sentences. It makes reading mistakes: it tells people to change trains at stops the train skips, invents a shuttle bus, says "both directions" when the alert names one, and ends with "Want to start?" when there is no trip. The tool is right; the retelling is wrong. Your job is to find the change that makes the retelling right most often, and to prove it with numbers.

## What is already built

| Piece | File | What it does |
|---|---|---|
| Runner | `scripts/eval-line-status.ts` | Asks the real agent each case several times, with the MTA feed and the clock replaced by the case's recorded moment, and scores every reply. Writes one JSON line per trial to `eval-runs/line-status/`. |
| Checks | `scripts/eval/line-status/checks.ts` | Rule checks that compare the reply with the tool's structured facts. Offline tests in `checks.test.ts`, including the real wrong reply from #627. |
| Cases | `scripts/eval/line-status/cases.ts` | Six scenarios (A train trouble, N/Q delay, a quiet L, a quiet 4 with a named station, G suspended, a quiet 7), each asked several ways, with the feed reordered and with an unrelated alert added. Four scenarios are `train`, two are `heldout`. |
| Comparer | `scripts/eval-line-status-compare.ts` | Compares two runs and says keep, reject or inconclusive. The rule is in `report.ts`. |
| Recorder | `scripts/record-alert-snapshot.ts` | Saves the live MTA alert feed with a timestamp so a past moment can be replayed. |
| Generator | `scripts/eval-line-status-generate.ts` | Asks you (DeepSeek) to write new rider questions for saved feeds. Invented text only. |
| Soak loop | `scripts/eval/line-status/soak.sh` | Runs the recorder and the eval over and over unattended. Stop it with `touch eval-runs/STOP`. |

`eval-runs/`, `eval-snapshots/` and `eval-cases/` are not committed (they are in `.gitignore`). `LEDGER.md` is committed and is the permanent record.

## Set up

You need Node 22 or later, `pnpm install` done, and a model endpoint.

**On the MacBook Pro** (`ssh mac-pro`, user `teresaguajardo`), LFM3 already runs under launchd as `com.pukujan.lfm3`: `llama-server` on `127.0.0.1:8099`, alias `lfm3`, two slots. Run the eval on the Pro itself:

```bash
export INFERHUB_BASE_URL=http://127.0.0.1:8099/v1 INFERHUB_MODEL=lfm3 INFERHUB_API_KEY=local
npx tsx scripts/eval-line-status.ts --trials 3 --label baseline
```

**From another machine** (the Mac Air, or the Windows machine), tunnel to the Pro first, then use the same three variables with port 18199:

```bash
ssh -f -N -L 18199:127.0.0.1:8099 teresaguajardo@100.79.248.88
export INFERHUB_BASE_URL=http://127.0.0.1:18199/v1 INFERHUB_MODEL=lfm3 INFERHUB_API_KEY=local
```

On Windows PowerShell, set the three variables with `$env:NAME = "value"`. The eval uses only Node and the network, so it runs there too. `soak.sh` needs Git Bash or WSL; otherwise run the two `tsx` commands inside it in a loop of your own.

LFM3 has two slots, so `--parallel 2` is the most it can use. A trial takes 5 to 35 seconds. About 170 trials take about 15 minutes.

**Your own key** goes in `DEEPSEEK_API_KEY` (also `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`). Secrets live in `~/Documents/projects/.env` on the Air and `~/.hack_env` on the Pro. Never print them or commit them.

## What counts as an error

Every check compares the reply with facts the app itself computed (`src/lib/transit/trouble.ts`), so no one has to judge wording.

| Check | A reply fails it when |
|---|---|
| `switch-at-skipped-stop` | It says to change, switch, board or transfer at a stop the line skips. |
| `advice-names-skipped-stops` | It gives advice (take, catch, board, switch) naming two or more skipped stops. |
| `invented-station` | It names a station the tool did not give and the rider did not name. |
| `invented-shuttle` | It mentions a shuttle bus when the alerts announce none. |
| `widened-direction` | It says "both directions" when the alert names one. |
| `trouble-at-unaffected-station` | The rider named a station no alert touches and the reply reports trouble there. |
| `claims-trouble-when-none` | The feed is quiet for these lines and the reply reports trouble. |
| `denies-trouble` | An alert is active and the reply says nothing is wrong. |
| `offer-without-trip` | It ends with "Want to start?" and no trip was planned. |
| `empty-reply` | Nothing came back. |

A **group** is a set of cases that mean the same thing: one question over a reordered feed, one with an unrelated alert added, or one feed asked in different words. Their facts are identical, so they should pass at similar rates. The report lists groups where they do not. This is metamorphic testing: it needs no answer key, only the rule that the answer should not change.

## The first things to fix

A baseline on LFM3 with the prompt as merged in [#628](https://github.com/Pukujan-lab/nyc-map-agent/pull/628) found these, so start here. `LEDGER.md` has the exact numbers.

1. **"Want to start?" after a status answer.** The prompt tells the model to end trip and place answers with it (`server/features/agent/prompt.ts`, several lines), and the model copies it to status answers. The rule added in #628 did not stop it. `routes.ts` already strips the model's own "Want to start?" when the app adds its own follow-up (`hold.rest`); the same mechanism could drop it when no trip was planned. A code fix beats another prompt line.
2. **Invented shuttle and "take the C from those stations".** The tool's key `otherLinesThatStillStopAtSkippedStations` lists lines that still stop at each skipped station. The model reads it as a shuttle or a place to board. Try removing that key unless the rider asked for alternatives, or move the information into a short sentence in the tool's `summary`.
3. **Trouble placed at the station the rider named** when the alert says "throughout Manhattan".

After those, widen the cases (see "Growing the cases").

## What you may change, and what you may not

You may change: `server/features/agent/prompt.ts`, the shape of what `line_status` returns in `server/features/agent/tools.ts`, code in `server/features/agent/routes.ts` that post-processes the model's text, and the model settings the app passes (temperature and the like).

You may not change: the facts (`src/lib/transit/trouble.ts` parsing, the MTA data), the checks to make a run pass, or the `heldout` split to make a change look good. If a check is wrong, fix it in its own pull request with a test, and say so in the ledger.

Real rider questions are not in the cases and must not be added until `docs/PRIVACY.md` and `docs/DESIGN_RULES.md` say they are collected. The owner decided on 2026-11-01 that accuracy matters more than privacy for a few months (review or delete by 2027-02-01), on condition that those documents change first, only the question text is saved, and it is masked the way `server/lib/tracing.ts` masks Phoenix traces. Until that pull request merges, use only invented and recorded-feed cases.

## Repository rules you must follow

These come from `AGENTS.md` and `CLAUDE.md`; read both.

- GitHub is the authority. Work on a branch with an owning issue: `python3 .claude/hooks/acs_guard.py link <issue number>`. Never push to `main`.
- Open a pull request whose description opens with one problem sentence and ends with `Closes #N` or `Refs #N`. `gh pr create` and `gh issue create` need `--body-file` with a literal path.
- Checkpoint with `continuity` (run as `uvx --from ~/.cache/acs/deps/agent-stack-train/pcm continuity ...`). It refuses while untracked files exist, so move them aside first; the owner's untracked files (`HANDOFF.md`, `reports/`, and others) must come back untouched.
- Turn on auto-merge for your pull request. Merges to `main` reach the VPS through Komodo within about five minutes.
- Before writing any pull request, issue or commit text, load `~/.cache/acs/deps/agent-stack-train/cgm/modules/human-sounding-writing/SKILL.md`.
- Do not stop dev servers or processes that belong to other projects.

## Growing the cases

1. **Recorded moments.** `tsx scripts/record-alert-snapshot.ts --every 300 --count 288` saves a day of real feeds. Each snapshot becomes one "Is the X running?" case per line it mentions. Leave the recorder running whenever the Pro is awake: the more days, the more unusual service changes get captured.
2. **Generated questions.** `tsx scripts/eval-line-status-generate.ts --per 8` asks you for rider questions in several languages, with typos and station names the alerts do not mention. Whole feeds, not single questions, go to the held-out half (`splitOf` in `cases.ts`).
3. **Hand-written scenarios.** Add to `SCENARIOS` in `cases.ts`. Use the MTA's own alert wording. Put a scenario in `heldout` only if you will not tune against it.
4. **Past moments with outcomes.** Octo holds recorded travel-time observations (about one to one and a half hours a day). They support scoring estimates against what trains did, not alert wording. Look at what is stored before designing around it (issue #594).

## Next suites, once line status is steady

- **Trips.** `transit_plan` asks MOTIS (`server/features/agent/motis.ts`, container `nyc-map-motis` on the VPS) for itineraries. A trip suite would check that the reply matches the itinerary: lines, transfer stations, times, exit. The same runner and groups work; write new checks beside `checks.ts`. The existing `scripts/eval-trip-questions.ts` shows the style.
- **Training LFM3.** Only after the checks are trusted. Take cases where your answer passes and LFM3's fails, fine-tune with LoRA, and test on `heldout` cases LFM3 never saw. Check the licences of LFM3 and of your own outputs first.
- **Phoenix.** Agent turns are traced into Phoenix through Octo (`server/lib/tracing.ts`). Phoenix datasets and experiments can hold these runs next to live traces. The rows already carry model, prompt hash, tools hash and commit.

## Not worth doing here

TLA+ and Lean 4: every property above is a set check on one reply, which plain code decides exactly. Retrieval (RAG, hybrid or dense): the tool already fetches the right facts; the mistake is in the retelling.
