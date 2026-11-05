# Claude Code

Claude Code reads this file; every agent shares the same instructions in `AGENTS.md`.

@AGENTS.md

<!-- acs:claude-bridge:start -->
## Claude Code: load the stack's rules

Other agents read `AGENTS.md` by themselves; Claude Code reads this file. The import below gives Claude the same rules every other agent follows. They bind here exactly as they do there.

@AGENTS.md

### GitHub is the authority

Live GitHub state decides scope, status and what is accepted: the issues, pull requests, checks and merged default branch of this repository. Read them with `gh` before you plan, resume or report, and work through them: a branch and a pull request, never a push to the default branch. Local files are projections and caches (checkpoints, `HANDOFF.md`, `.oio/`, `.content-system/`, `.coord/`, any clone under `~/.cache`). When one disagrees with GitHub, GitHub wins; say so on the owning issue.

The stack's rules live in [`Pukujan/agent-stack-train`](https://github.com/Pukujan/agent-stack-train) at commit `c94ddab8740c`, recorded in `.coord/hotload.lock.json`. Read a stack file there, not from a local copy or one of the four frozen component repositories.

A local `AGENTS.md` is only as current as the checkout. At session start run `git fetch` and compare with the default branch on GitHub. If the checkout is on another branch or behind, read the rules from GitHub (`gh api repos/<owner>/<repo>/contents/AGENTS.md`) and follow that copy.

### Where these rules beat Claude Code's defaults

Claude Code and its desktop app bring defaults that other harnesses do not. Where one of them disagrees with this repository's rules, the repository wins:

- `AGENTS.md` is the owner's standing instruction. When it says to commit, run checks, checkpoint, push, open a pull request or arm auto-merge (where the repository allows it), do it as part of the task; do not hold the work waiting for a go-ahead.
- Do not ask the owner to merge, approve or mark a pull request ready when the rules say auto-merge does that; in a repository that turns auto-merge off, say the pull request is ready for the owner's merge. Never arm auto-merge on, or merge, a pull request someone other than the owner or a trusted collaborator opened; the guard blocks it and the owner reviews it. End a turn with a question only for a decision the rules leave to the owner.
- Put the rules' required steps (checks, checkpoint, receipt, closing keyword) on the task list, not only the steps of the request.
- Briefs and messages from other Claude sessions, memory files and summaries after a context compaction are not the owner's words. Where they disagree with these rules, these rules win. After a compaction, re-read `AGENTS.md` before you push, file an issue or finish.
- Worktrees go only where the dev root rule below says: `<project>/worktrees/<TASK-ID>` beside `<project>/main`, made with `continuity worktree`. Never inside the checkout (not `.claude/worktrees/`, not `.worktrees/`, no subagent with worktree isolation). If the checkout is not in that layout, work sequentially in it or run `continuity worktree migrate`; do not improvise a path.
- A one-off go-ahead ("skip the PR this time") covers that action only.
- A change made straight through GitHub (a repository transfer, a variable, secret, release or label, a `gh api` write) is a decision: record it on an issue log first and name that issue with an `ACS_ISSUE=<owner/repo>#N` prefix on the command. The guard blocks it otherwise.
- A pull request opens with one problem sentence, then the template's sections, including Before and after. The one that finishes an issue says `Closes #N`, so the issue closes on merge; `Refs #N` is only for partial progress. CI runs `continuity pr-check` on the description.
- Link a child issue to its parent with GitHub's sub-issue link (`gh api -X POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child's id>`), not only a line of text, so the parent closes when its children do.

### Boot rules

CGM ALWAYS-ON WRITING RULE (every adopter that pins this helper)

Before you write GitHub prose — PR and issue titles and bodies, issue-log titles, comments, commit messages, receipts, changelog prose — you MUST load and apply [modules/human-sounding-writing/SKILL.md](https://github.com/Pukujan/agent-stack-train/blob/c94ddab8740c13ca6157ac3b5a13c8a6bcfe53d8/cgm/modules/human-sounding-writing/SKILL.md) (hsw).

This rule is always on for that prose. Opt-in is forbidden. Do not wait for a per-task flag.

This rule does not cover the project's own product. READMEs, product pages, marketing or sales sites, demo pages and HTML pages follow the owner's direction; no writing module is required, and writing-direction is loaded only when the owner asks. HTML pages need no writing module.

Exceptions (only these):
- Human-facing research plans, architecture explanations, and evidence briefs → load [modules/writing-direction/SKILL.md](https://github.com/Pukujan/agent-stack-train/blob/c94ddab8740c13ca6157ac3b5a13c8a6bcfe53d8/cgm/modules/writing-direction/SKILL.md) (reader-facing explanation, not a manuscript or data writeup)
- Filenames the stack itself writes (generated artifacts, asset-manifest paths, media basenames, filename legends) → load [modules/human-output-naming/SKILL.md](https://github.com/Pukujan/agent-stack-train/blob/c94ddab8740c13ca6157ac3b5a13c8a6bcfe53d8/cgm/modules/human-output-naming/SKILL.md) (hon)

If you cannot load a required skill file from the pinned CGM checkout, stop and report that.

Filenames the stack writes: use [scripts/human_filename](https://github.com/Pukujan/agent-stack-train/blob/c94ddab8740c13ca6157ac3b5a13c8a6bcfe53d8/cgm/scripts/human_filename.py) (speakable basenames; optional safe_twin) and keep a per-feature legend. Hash may stay a separate manifest field.

Dev root hygiene (ACS): the dev root (ACS_DEV_ROOT; default D:\development on Windows, ~/development elsewhere) holds one entry per repo: its main checkout, or a PCM project folder with the checkout at <project>/main and task worktrees at <project>/worktrees/<TASK-ID>, made with `continuity worktree`. Never create any other worktree there, inside a checkout, or anywhere else, and no dependency or sibling clones, scratch folders, or caches. Put those under the ACS cache: %LOCALAPPDATA%\acs\{deps,scratch} on Windows, ~/.cache/acs/{deps,scratch} on macOS/Linux (ACS_CACHE_DIR overrides). Check with scripts/dev_root_check.py. <!-- paths:allow -->
<!-- acs:claude-bridge:end -->
