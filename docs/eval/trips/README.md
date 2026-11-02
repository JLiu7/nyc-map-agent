# Trip suite

This suite plays short trip conversations against the chat agent and checks, turn by turn, whether it used its tools the way a rider needs. It catches the failures people saw on 2026-11-01: a new destination answered with the restroom tool, a trip described in words with nothing drawn, a "yes" that did nothing, one tool called eight times in a row.

It judges tool use, not route quality. Whether OTP picked the best itinerary is a different question.

## Run it

```bash
# In process, on the model in your environment (LFM3 through the Pro, OTP and Valhalla through the VPS):
ssh -f -N -L 18199:127.0.0.1:8099 mac-pro
ssh -f -N -L 18080:<otp container ip>:8080 -L 18002:<valhalla container ip>:8002 vps
INFERHUB_BASE_URL=http://127.0.0.1:18199/v1 INFERHUB_MODEL=lfm3 INFERHUB_API_KEY=local \
OTP_URL=http://127.0.0.1:18080 VALHALLA_URL=http://127.0.0.1:18002 \
  npx tsx scripts/eval-trips.ts --trials 3 --label base-<idea>

# Against the live site instead:
npx tsx scripts/eval-trips.ts --url https://nyc.design-bakery.com --trials 1 --label live
```

Get the container addresses with `ssh vps 'docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" nyc-map-otp nyc-map-valhalla'`. Without `OTP_URL` the app falls back to its subway-only router, which changes the answers, so a run without it can't be compared with one that has it.

Options: `--trials` (per conversation, default 3), `--parallel` (default 2), `--only <case id prefix>`, `--label`, `--out` (default `eval-runs/trips`, not committed).

Rows go to `eval-runs/trips/<run id>.jsonl`, one per turn, with the model, prompt hash, tools hash and commit. The summary prints clean turns overall, per check and per conversation.

## The checks

| Check | Fails when |
| --- | --- |
| `no-plan-without-tool` | A turn asks for a way somewhere and no planner (`transit_plan`, `route_walk`, `drive_plan`) runs. |
| `no-route-drawn` | A trip was planned and nothing was put on the map. |
| `wrong-topic-tool` | The restroom tool runs when no one asked about a restroom. |
| `yes-did-nothing` | The rider says yes to an offer and nothing is planned or drawn. |
| `tool-loop` | One tool runs four or more times in a turn. |
| `empty-reply` | The turn ends with no text. |
| `internal-name-leak` | The reply shows a tool name, a field name such as `tripId`, or an id. |
| `guessed-when-vague` | The request was too vague to plan, and the agent planned a guess without asking. |

When the app asks "Just to check: did you mean ...?" about an ambiguous station, it is doing the right thing. The runner answers "Yes" the way a rider would and scores the turn on everything that happened, the readback included. The row records the question under `observed.readback`.

## The conversations

`scripts/eval/trips/cases.ts` holds 12: a plain trip, a trip then "yes", a trip after a restroom answer, a trip after a line-status question, "I'm hungry", "walk me there", a vague "somewhere in Brooklyn", a trip then a change of destination, a trip then "thanks", a trip in Spanish, a trip in Chinese, and a trip with no known location.

## Changing the agent

Use the same loop as the line-status suite (`docs/eval/line-status/PROGRAM.md`): one change at a time, the same conversations, trials and model on both sides, and every run, kept or dropped, written in [`LEDGER.md`](LEDGER.md). Never edit a check or a conversation to move a number. A wrong check gets its own pull request, with a test that shows the wrong verdict.

There's no train and held-out split yet, and no comparer. With 12 conversations, read the per-check counts, not small changes in the overall rate.
