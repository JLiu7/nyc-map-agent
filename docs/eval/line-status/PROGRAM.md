# The loop

Follow this to change one thing, measure it, and keep or drop it. Do not skip a step. Setup and file map are in `HANDOFF_DEEPSEEK.md`.

## Rules of the loop

1. **One change per iteration.** A prompt edit, a tool-result change or a code change, never two. Two together cannot be told apart in the numbers.
2. **Compare like with like.** Same cases, same trials, same model. The runner records the model, `promptHash`, `toolsHash` and git commit in every row; the comparer prints them. If two runs differ in more than your change (a different model, different cases), the comparison means nothing.
3. **Study `train`, judge on `heldout`.** Read the failing replies of `train` cases to decide what to change. Look at `heldout` numbers only to decide keep or reject, and never open its replies to find out what to tune.
4. **Numbers decide.** Keep a change when `eval-line-status-compare` prints `keep`. The rule (`report.ts`): train clean rate up by at least 3 points, held-out down by no more than 3 points, and no single check up by more than 10 points on held-out. With fewer than 30 trials in a split the answer is `inconclusive`: run more trials, do not guess.
5. **Never edit a check or a case to make a number move.** If a check is wrong, change it in its own pull request with a test that shows the wrong verdict, and re-run both sides of the comparison afterwards.
6. **Write every iteration in `LEDGER.md`,** including the ones you reject. A rejected idea saves the next run from repeating it.

## One iteration

```bash
# 0. Be on a branch tied to an issue (python3 .claude/hooks/acs_guard.py link <N>).
# 1. Baseline: run the current code. Use enough trials for the comparer (30 or more per split).
npx tsx scripts/eval-line-status.ts --trials 5 --label base-<idea>

# 2. Read the train failures: which check fails most, and what the replies actually say.
python3 -I - <<'PY'
import glob, json
f = sorted(glob.glob("eval-runs/line-status/*base-<idea>.jsonl"))[-1]
for l in open(f):
    r = json.loads(l)
    if r["split"] == "train" and r["violations"]:
        print(r["caseId"], [v["check"] for v in r["violations"]], "\n   ", r["reply"][:300])
PY

# 3. Make ONE change. Run the offline tests; they must still pass.
npx vitest run server/features/agent scripts/eval

# 4. Measure again with the same trials and label style.
npx tsx scripts/eval-line-status.ts --trials 5 --label try-<idea>

# 5. Decide.
npx tsx scripts/eval-line-status-compare.ts eval-runs/line-status/<base>.jsonl eval-runs/line-status/<try>.jsonl
#    exit 0 keep, 1 reject, 2 inconclusive
```

- **keep:** add a ledger row, commit, open a pull request (`Refs #629`), turn on auto-merge.
- **reject:** add a ledger row, `git checkout -- .`, pick the next idea.
- **inconclusive:** run both sides again with more trials or more cases.

## Rhythm for a long run

- Each iteration costs about 15 minutes at 170 trials. Several ideas can queue overnight; run them one after another, never at once, because the Pro's two model slots are shared.
- `scripts/eval/line-status/soak.sh` repeats the eval on a fixed random sample with a fresh label per pass and records the live alert feed while it goes. Use it to watch for drift after a merge, not to compare changes (its sample changes by label).
- After a merge, wait for Komodo's deploy (about five minutes), then ask the live site the three first questions by hand through `POST https://nyc.design-bakery.com/api/agent` and compare with the eval.

## When to stop

Stop and report to the owner when any of these is true:

- Two iterations in a row end `reject` or `inconclusive` on the same check.
- The `train` clean rate is above 95% and `heldout` is within 3 points of it, on at least 100 trials per split. Then widen the cases (new scenarios, languages, recorded moments), not the prompt.
- You would need to change a fact, a check or the held-out split to go on.
- The change needs a stronger model or fine-tuning. Say what the numbers show; do not start it without the owner.

## The ledger

Add one row per iteration to `LEDGER.md`: date, issue or pull request, the one change, runs compared (labels), train and held-out clean rates before and after, the verdict, and one sentence on what you learned.
