#!/usr/bin/env bash
# Keeps the owner's machine lean between agent sessions (ACS dev-root rule).
#
# 1. Stops this repository's leftover dev processes (vite, esbuild, Playwright,
#    headless browsers, tsx watchers) whose working folder is this repo or one
#    of its worktrees and that have run longer than AGENT_HYGIENE_MAX_AGE_MIN
#    minutes (default 360). Other projects' processes are never touched.
# 2. Reports what ACS's dev_root_check.py would tidy in the dev root, when the
#    ACS checkout is in the cache.
# 3. Warns when the ACS boss seat in .coord/boss_claim.json is still "held" but
#    its heartbeat is older than the lease. seat_protocol.py status prints OK
#    in that case, so a seat abandoned days ago looks taken to the next agent.
#
# Usage: scripts/agent-hygiene.sh [--yes] [--quiet]
#   without --yes it only lists what it would stop.
set -euo pipefail

yes=0; quiet=0
for a in "$@"; do
  case "$a" in
    --yes) yes=1 ;;
    --quiet) quiet=1 ;;
    *) echo "usage: $0 [--yes] [--quiet]" >&2; exit 2 ;;
  esac
done
say() { [ "$quiet" = 1 ] || echo "$@"; }

max_min=${AGENT_HYGIENE_MAX_AGE_MIN:-360}
common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || { say "agent-hygiene: not in a git repo"; exit 0; }
main_root=$(dirname "$common")
worktrees=$(git -C "$main_root" worktree list --porcelain | awk '/^worktree /{print substr($0,10)}')

# ps etime is [[dd-]hh:]mm:ss; turn it into minutes.
minutes() {
  local t=$1 d=0 h=0 m=0
  case "$t" in *-*) d=${t%%-*}; t=${t#*-} ;; esac
  IFS=: read -r a b c <<<"$t"
  if [ -n "${c:-}" ]; then h=$a; m=$b; else m=$a; fi
  echo $(( 10#$d * 1440 + 10#$h * 60 + 10#$m ))
}

stopped=0
while read -r pid etime cmd; do
  [ -n "$pid" ] || continue
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
  [ -n "$cwd" ] || continue
  ours=0
  while read -r w; do
    [ -n "$w" ] || continue
    case "$cwd/" in "$w"/*) ours=1; break ;; esac
  done <<<"$worktrees"
  [ "$ours" = 1 ] || continue
  age=$(minutes "$etime")
  [ "$age" -ge "$max_min" ] || continue
  if [ "$yes" = 1 ]; then
    kill "$pid" 2>/dev/null && stopped=$((stopped + 1))
    say "agent-hygiene: stopped pid $pid (${age} min) ${cmd:0:80}"
  else
    say "agent-hygiene: would stop pid $pid (${age} min) ${cmd:0:80}"
  fi
done < <(ps -Ao pid=,etime=,command= | awk '{
  # Judge the program and its script only, never the rest of the command line
  # (an agent whose prompt mentions vite is not a dev server).
  prog=$3; script=$4
  if (prog ~ /(esbuild|chrome-headless-shell|headless_shell|Chromium)$/ || \
      (prog ~ /(^|\/)node$/ && script ~ /(vite|playwright|tsx)/)) print
}' || true)

[ "$yes" = 1 ] && [ "$stopped" -gt 0 ] && echo "agent-hygiene: stopped $stopped leftover dev process(es) older than ${max_min} min"

check="${ACS_CACHE_DIR:-$HOME/.cache/acs}/deps/agent-stack-train/acs/modules/coordination/multi-agent-hotload/v0.1.0/scripts/dev_root_check.py"
if [ -f "$check" ] && command -v python3 >/dev/null; then
  report=$({ python3 "$check" --dev-root "$(dirname "$main_root")" 2>/dev/null || true; } | python3 -c 'import json,sys; d=json.load(sys.stdin); print("clean" if d["ok"] else "%d item(s) outside the rule; run dev_root_check.py --clean to review" % len(d["findings"]))' 2>/dev/null || echo "check failed")
  say "agent-hygiene: dev root: $report"
fi

root=$(git rev-parse --show-toplevel 2>/dev/null || echo "$main_root")
if [ -f "$root/.coord/boss_claim.json" ] && command -v python3 >/dev/null; then
  seat=$(python3 - "$root/.coord" <<'PY' 2>/dev/null || true
import json, sys
from datetime import datetime, timezone
from pathlib import Path
coord = Path(sys.argv[1])
claim = json.loads((coord / "boss_claim.json").read_text())
try:
    ttl = float(json.loads((coord / "assignment.json").read_text()).get("boss_failover", {}).get("lease_ttl_minutes", 30))
except Exception:
    ttl = 30.0
beat = claim.get("last_heartbeat")
if claim.get("status") == "held" and beat:
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(beat)).total_seconds() / 60
    if age > ttl:
        print(f"boss seat held by {claim.get('who_is_boss_now')} but its last heartbeat was {age / 60:.0f} h ago "
              f"(lease {ttl:.0f} min); run .coord/bin/seat_protocol.py expire, then take-seat")
PY
)
  [ -n "$seat" ] && say "agent-hygiene: $seat"
fi
exit 0
