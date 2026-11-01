#!/usr/bin/env bash
# Long unattended run (#629): records the live alert feed in the background, then asks the agent the
# saved, generated and replayed cases again and again, one labelled run per pass. Stop with:
#   touch eval-runs/STOP
# Needs the model env (INFERHUB_BASE_URL, INFERHUB_MODEL, INFERHUB_API_KEY). Optional: DEEPSEEK_API_KEY
# (new cases are generated once per pass). Run from the repository root.
set -u
mkdir -p eval-runs eval-snapshots
rm -f eval-runs/STOP
npx tsx scripts/record-alert-snapshot.ts --every 300 --count 100000 >> eval-runs/snapshots.log 2>&1 &
RECORDER=$!
trap 'kill $RECORDER 2>/dev/null' EXIT
pass=0
while [ ! -e eval-runs/STOP ]; do
  pass=$((pass + 1))
  label="soak-$(date +%Y%m%d-%H%M)-p$pass"
  if [ -n "${DEEPSEEK_API_KEY:-}" ] && [ $((pass % 6)) -eq 1 ]; then
    npx tsx scripts/eval-line-status-generate.ts --per 6 >> eval-runs/generate.log 2>&1 || true
  fi
  npx tsx scripts/eval-line-status.ts --sample "${SOAK_SAMPLE:-80}" --trials "${SOAK_TRIALS:-3}" --parallel "${SOAK_PARALLEL:-2}" --label "$label" >> "eval-runs/$label.log" 2>&1 || true
done
