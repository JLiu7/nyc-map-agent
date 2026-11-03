#!/usr/bin/env bash
# Runs a command on the N quietest CPUs, each on its own physical core (#31).
# Each org-pool runner caps its jobs at 2 CPUs with a CPU quota, but a job still sees all 12 of the
# VPS's CPUs. Chromium and SwiftShader start threads for all 12, so on an idle VPS the job spends its
# quota in a burst at the start of each 100 ms period and then stands still: e2e ran twice as slow
# on an idle VPS as on a busy one. Pinned to as many CPUs as the quota allows, it cannot burst.
# Usage: scripts/ci/pin-cpus.sh <count> <command...>. Used by .github/workflows/ci.yml (e2e job).
set -euo pipefail
want=$1
shift
if ! command -v taskset > /dev/null; then
  echo "pin-cpus: no taskset here, running unpinned"
  exec "$@"
fi

allowed=" "
for r in $(sed -n 's/^Cpus_allowed_list:[[:space:]]*//p' /proc/self/status | tr , ' '); do
  allowed+="$(seq -s ' ' "${r%-*}" "${r#*-}") "
done
# Busy and total jiffies per CPU (fields: user nice system idle iowait irq softirq steal).
stat() { awk '/^cpu[0-9]/ { print substr($1, 4), $2 + $3 + $4 + $7 + $8 + $9, $2 + $3 + $4 + $5 + $6 + $7 + $8 + $9 }' /proc/stat; }
core() {
  local t=/sys/devices/system/cpu/cpu$1/topology
  echo "$(cat "$t/physical_package_id" 2> /dev/null || echo 0):$(cat "$t/core_id" 2> /dev/null || echo "$1")"
}
first=$(stat)
sleep 1
second=$(stat)
cpus=$(printf '%s\n---\n%s\n' "$first" "$second" |
  awk -v allowed="$allowed" '
    $1 == "---" { late = 1; next }
    !late { busy[$1] = $2; total[$1] = $3; next }
    index(allowed, " " $1 " ") { printf "%d %s\n", ($2 - busy[$1]) * 1000 / ($3 - total[$1] + 1), $1 }' |
  sort -n | while read -r _ cpu; do echo "$cpu $(core "$cpu")"; done |
  awk -v want="$want" '!seen[$2]++ && n < want { printf "%s%s", (n++ ? "," : ""), $1 }')

if [ "$(tr , '\n' <<< "$cpus" | grep -c .)" -lt "$want" ]; then
  echo "pin-cpus: fewer than $want separate cores ($cpus), running unpinned"
  exec "$@"
fi
echo "pin-cpus: CPUs $cpus (quietest $want on separate cores of $(nproc --all)); load average $(cut -d' ' -f1-3 /proc/loadavg)"
exec taskset -c "$cpus" "$@"
