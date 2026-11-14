#!/usr/bin/env bash
# Picks which end-to-end specs a change needs, so a small change does not wait
# for all 200 tests (34 minutes on the shared VPS on 2026-11-14).
# Prints one line: "all", "none", or the spec files to run.
#
#   none  only writing changed (Markdown, docs/, checkpoints/, tasks/).
#   some  only one or more feature folders listed in e2e/slices.txt changed,
#         with their specs and the few files every feature has to touch.
#         Runs those features' specs, any spec the change edits, and the smoke spec.
#   all   anything else, and whenever this script cannot tell.
#
# It compares HEAD with its first parent: the base branch on a pull request's
# merge commit, the previous commit on a squash merge to main. The checkout
# therefore needs fetch-depth 2. Pass BEFORE (the push's previous head) to make
# a push of several commits run everything.
# Used by .github/workflows/ci.yml (e2e job).
set -uo pipefail

git() { command git -c safe.directory='*' "$@"; }
all() { echo all; exit 0; }

parent=$(git rev-parse -q --verify 'HEAD^1' 2> /dev/null) || all
if [ -n "${BEFORE:-}" ] && [ "$BEFORE" != "$parent" ]; then all; fi
files=$(git diff --name-only "$parent" HEAD 2> /dev/null) || all
[ -n "$files" ] || all

slices=$(dirname "$0")/../../e2e/slices.txt
[ -f "$slices" ] || all

specs=" e2e/smoke.spec.ts "
add() { case "$specs" in *" $1 "*) ;; *) [ -f "$1" ] && specs+="$1 " ;; esac; }
code=0

while IFS= read -r f; do
  case "$f" in
    *.md | docs/* | checkpoints/* | tasks/*) ;;
    e2e/*.spec.ts) code=1; add "$f" ;;
    # What every new feature has to touch: its loader, its flag, its size budget, its own public files, the script that bakes its data.
    src/features/index.ts | src/lib/flags/registry.ts | .size-limit.json | public/walks/* | public/replay/* | scripts/derive-*) code=1 ;;
    src/features/*/*)
      code=1
      name=${f#src/features/}
      name=${name%%/*}
      line=$(grep -E "^$name:" "$slices") || all
      for s in ${line#*:}; do add "e2e/$s"; done
      ;;
    *) all ;;
  esac
done <<< "$files"

if [ "$code" = 0 ]; then echo none; else echo "${specs# }" | sed 's/ $//'; fi
