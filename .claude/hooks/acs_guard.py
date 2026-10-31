#!/usr/bin/env python3
"""Claude Code hooks that enforce the stack's rules instead of only stating them.

``acs_install.py`` copies this file to ``.claude/hooks/acs_guard.py`` in every
adopter and wires it into ``.claude/settings.json``. Claude Code runs it; the
model cannot skip it. Text in ``AGENTS.md`` and ``CLAUDE.md`` competes with
Claude Code's own defaults and loses often enough to matter (#37).

    acs_guard.py session-start   SessionStart: fetch, warn when the checkout is
                                 behind or off the default branch, and hand
                                 Claude the default branch's AGENTS.md when the
                                 local copy differs
    acs_guard.py pre-tool        PreToolUse: block (exit 2) work without an
                                 owning issue, pushes to the default branch,
                                 force pushes, worktrees outside
                                 <project>/worktrees/<TASK-ID>, issue logs not
                                 in the OIO form's shape, pull requests that
                                 name no issue, and edits that remove this guard
    acs_guard.py stop            Stop: block ending a turn with unpushed commits,
                                 or pushed without a PCM checkpoint
    acs_guard.py link <N>        record issue N (or owner/repo#N) as the current
                                 branch's owning issue, after checking it exists

A branch's owning issue is the one recorded by ``link`` or the number in its
name (``fix/37-enforce-rules``); either is checked on GitHub once and cached in
``git config branch.<name>.acs-issue``.

The guard acts only in repositories that adopt the stack (``.coord/hotload.lock.json``
or ``stack-releases.json`` at the top level). The owner can turn it off for a
whole Claude Code process with ``ACS_GUARD=off``; a command cannot.

Stdlib only.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

GUARD_NAME = "acs_guard.py"
ISSUE_FORM = Path(".github/ISSUE_TEMPLATE/observational-issue.yml")
ISSUE_REF_RE = re.compile(r"\b(?:Refs|Closes|Fixes|Resolves)\b:?\s+(?:[\w.-]+/[\w.-]+)?#\d+", re.IGNORECASE)
BRANCH_ISSUE_RE = re.compile(r"(?:^|[/_-])(?:issue-?|gh-?)?(\d{1,7})(?=[/_-]|$)")
LINK_RE = re.compile(r"^(?:([\w.-]+/[\w.-]+))?#?(\d{1,7})$")
CHECKPOINT_PREFIX = "PCM "
SEPARATORS = set(";&|()\n")


# ---------------------------------------------------------------- git / gh


def run(args: list[str], cwd: Path, timeout: float = 15) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            args, cwd=str(cwd), capture_output=True, text=True, timeout=timeout,
            encoding="utf-8", errors="replace", check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 127, str(exc)
    return proc.returncode, (proc.stdout or "").strip()


def git(cwd: Path, *args: str, timeout: float = 15) -> str | None:
    code, out = run(["git", *args], cwd, timeout)
    return out if code == 0 else None


def top_level(cwd: Path) -> Path | None:
    out = git(cwd, "rev-parse", "--show-toplevel")
    return Path(out) if out else None


def is_adopter(top: Path) -> bool:
    return (top / ".coord" / "hotload.lock.json").is_file() or (top / "stack-releases.json").is_file()


def default_branch(top: Path) -> str:
    ref = git(top, "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD")
    return ref.rsplit("/", 1)[-1] if ref else "main"


def current_branch(top: Path) -> str | None:
    return git(top, "symbolic-ref", "--quiet", "--short", "HEAD")


def issue_exists(top: Path, repo: str | None, number: str) -> bool:
    args = ["gh", "issue", "view", number, "--json", "number"]
    if repo:
        args += ["--repo", repo]
    return run(args, top, timeout=20)[0] == 0


def owning_issue(top: Path, branch: str) -> str | None:
    """The branch's owning issue as ``[owner/repo]#N``, checked on GitHub once."""
    cached = git(top, "config", "--get", f"branch.{branch}.acs-issue")
    if cached:
        return cached
    match = BRANCH_ISSUE_RE.search(branch)
    if match and issue_exists(top, None, match.group(1)):
        ref = f"#{match.group(1)}"
        git(top, "config", f"branch.{branch}.acs-issue", ref)
        return ref
    return None


# ---------------------------------------------------------------- command parsing


def segments(command: str) -> list[list[str]]:
    """Split a shell command into simple commands (best effort)."""
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        return []
    parts: list[list[str]] = [[]]
    for token in tokens:
        if token and set(token) <= SEPARATORS:
            parts.append([])
        else:
            parts[-1].append(token)
    out = []
    for args in parts:
        while args and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", args[0]):
            args = args[1:]  # leading VAR=value assignments
        if args:
            out.append(args)
    return out


def git_call(args: list[str], cwd: Path) -> tuple[str, list[str], Path] | None:
    """(subcommand, its args, working dir) for a ``git`` invocation."""
    if not args or Path(args[0]).name != "git":
        return None
    i = 1
    while i < len(args):
        a = args[i]
        if a == "-C" and i + 1 < len(args):
            cwd = (cwd / args[i + 1]).expanduser()
            i += 2
        elif a in ("-c", "--git-dir", "--work-tree") and i + 1 < len(args):
            i += 2
        elif a.startswith("-"):
            i += 1
        else:
            return a, args[i + 1 :], cwd
    return None


def flag_value(args: list[str], *flags: str) -> str | None:
    for i, a in enumerate(args):
        for f in flags:
            if a == f and i + 1 < len(args):
                return args[i + 1]
            if a.startswith(f + "="):
                return a.split("=", 1)[1]
    return None


def body_of(args: list[str], cwd: Path) -> str | None:
    path = flag_value(args, "--body-file", "-F")
    if path is not None:
        if path == "-":
            return None
        try:
            return (cwd / path).expanduser().read_text(encoding="utf-8")
        except OSError:
            return None
    return flag_value(args, "--body", "-b")


def required_headings(top: Path) -> list[str]:
    """Labels of the OIO intake form's required fields."""
    try:
        text = (top / ISSUE_FORM).read_text(encoding="utf-8")
    except OSError:
        return []
    labels, current = [], None
    for line in text.splitlines():
        m = re.match(r"\s*label:\s*(.+?)\s*$", line)
        if m:
            current = m.group(1).strip("'\"")
        elif re.match(r"\s*required:\s*true\s*$", line) and current:
            labels.append(current)
            current = None
    return labels


# ---------------------------------------------------------------- rules


def need_issue(top: Path, branch: str | None, action: str) -> str | None:
    if branch is None:
        return f"{action}: HEAD is detached; work on a task branch that has an owning issue."
    if owning_issue(top, branch):
        return None
    return (
        f"{action}: branch `{branch}` has no owning issue on GitHub. File the issue log first "
        "(`gh issue create --body-file <file>` in the OIO form's shape), then either name the "
        f"branch `<type>/<N>-<slug>` or run `python3 .claude/hooks/{GUARD_NAME} link <N>`."
    )


def check_git(sub: str, args: list[str], cwd: Path) -> str | None:
    top = top_level(cwd)
    if top is None or not is_adopter(top):
        return None
    default = default_branch(top)
    branch = current_branch(top)
    if sub == "commit":
        if branch == default:
            return f"git commit on `{default}`: the default branch takes changes only through a pull request. Make a task branch."
        return need_issue(top, branch, "git commit")
    if sub == "push":
        if any(a in ("-f", "--force", "--force-with-lease", "--mirror") or a.startswith("--force") for a in args):
            return "git push: force pushes are not allowed. Push new commits instead."
        positional = [a for a in args if not a.startswith("-")]
        refspecs = positional[1:]
        targets = []
        for spec in refspecs or ["HEAD"]:
            dst = spec.lstrip("+").split(":", 1)[-1].removeprefix("refs/heads/")
            targets.append(branch if dst == "HEAD" else dst)
        if default in targets:
            return f"git push to `{default}`: the default branch takes changes only through a pull request."
        return need_issue(top, branch, "git push")
    if sub == "worktree" and args[:1] == ["add"]:
        rest = args[1:]
        path, i = None, 0
        while i < len(rest):
            a = rest[i]
            if a in ("-b", "-B", "--reason"):
                i += 2
                continue
            if not a.startswith("-"):
                path = a
                break
            i += 1
        if path is None:
            return None
        common = git(top, "rev-parse", "--path-format=absolute", "--git-common-dir")
        main = Path(common).parent if common else top
        target = (cwd / path).expanduser().resolve()
        allowed = main.parent / "worktrees"
        if main.name == "main" and target.parent == allowed.resolve():
            return None
        return (
            f"git worktree add {path}: worktrees go only at <project>/worktrees/<TASK-ID>, beside the "
            "checkout at <project>/main, made with `continuity worktree`. Never inside the checkout. "
            "If this checkout is not in that layout, work sequentially here or run `continuity worktree migrate`."
        )
    return None


def check_gh(args: list[str], cwd: Path) -> str | None:
    if len(args) < 3 or args[0] != "gh":
        return None
    top = top_level(cwd)
    if top is None or not is_adopter(top):
        return None
    if args[1:3] == ["issue", "create"]:
        repo = flag_value(args, "--repo", "-R")
        if repo:  # another repository has its own form; check this one's only
            origin = git(top, "remote", "get-url", "origin") or ""
            if repo.lower().removesuffix(".git") not in origin.lower():
                return None
        labels = required_headings(top)
        if not labels:
            return None
        body = body_of(args, cwd)
        if body is None:
            return "gh issue create: give the issue log as `--body-file <file>` in the OIO form's shape."
        missing = [label for label in labels if not re.search(rf"^###\s+{re.escape(label)}\s*$", body, re.MULTILINE)]
        if missing:
            return (
                "gh issue create: this issue log is not in the OIO form's shape. Missing required "
                f"headings: {', '.join(missing[:6])}{' …' if len(missing) > 6 else ''}. "
                f"Use the headings in {ISSUE_FORM}."
            )
        return None
    if args[1:3] == ["pr", "create"]:
        body = body_of(args, cwd)
        if body is None or not ISSUE_REF_RE.search(body):
            return (
                "gh pr create: the body must name its owning issue with `Refs #N` (or `Closes #N` when "
                "the merge resolves it). Pass the body with `--body` or `--body-file`."
            )
        return need_issue(top, current_branch(top), "gh pr create")
    return None


def check_bash(command: str, cwd: Path) -> str | None:
    for args in segments(command):
        if args[0] == "cd" and len(args) > 1:
            cwd = (cwd / args[1]).expanduser()
            continue
        call = git_call(args, cwd)
        reason = check_git(*call) if call else check_gh(args, cwd)
        if reason:
            return reason
    return None


def removes_guard(tool: str, tool_input: dict) -> bool:
    path = str(tool_input.get("file_path") or "")
    if path.endswith(GUARD_NAME):
        return True
    if not path.endswith(os.path.join(".claude", "settings.json")):
        return False
    if tool == "Write":
        return GUARD_NAME not in str(tool_input.get("content") or "")
    edits = tool_input.get("edits") or [tool_input]
    return any(
        GUARD_NAME in str(e.get("old_string") or "") and GUARD_NAME not in str(e.get("new_string") or "")
        for e in edits
    )


def pre_tool(event: dict) -> str | None:
    tool = event.get("tool_name") or ""
    tool_input = event.get("tool_input") or {}
    cwd = Path(event.get("cwd") or os.getcwd())
    if tool == "Bash":
        return check_bash(str(tool_input.get("command") or ""), cwd)
    top = top_level(cwd)
    if top is None or not is_adopter(top):
        return None
    if tool == "EnterWorktree":
        return "EnterWorktree makes a worktree inside the checkout. Use <project>/worktrees/<TASK-ID> via `continuity worktree`, or work here."
    if tool in ("Agent", "Task") and tool_input.get("isolation") == "worktree":
        return "A subagent with worktree isolation makes a worktree inside the checkout. Run it without isolation."
    if tool in ("Edit", "Write", "MultiEdit") and removes_guard(tool, tool_input):
        return f"This edit removes or changes the stack's guard ({GUARD_NAME}). Only the ACS installer changes it."
    return None


def stop(event: dict) -> str | None:
    if event.get("stop_hook_active"):
        return None
    top = top_level(Path(os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or os.getcwd()))
    if top is None or not is_adopter(top):
        return None
    branch = current_branch(top)
    default = default_branch(top)
    if branch is None or branch == default:
        return None
    upstream = git(top, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    base = upstream or f"origin/{default}"
    ahead = git(top, "rev-list", "--count", f"{base}..HEAD")
    if ahead and int(ahead) > 0:
        return (
            f"Branch `{branch}` has {ahead} commit(s) that are not on GitHub. The rules say work is not "
            "done while it exists only locally: checkpoint and push them (and open or update the pull request) before you stop."
        )
    pcm = (top / "checkpoints" / "CURRENT.md").is_file()
    on_branch = git(top, "rev-list", "--count", f"origin/{default}..HEAD")
    if pcm and on_branch and int(on_branch) > 0:
        subject = git(top, "log", "-1", "--format=%s") or ""
        if not subject.startswith(CHECKPOINT_PREFIX):
            return (
                f"Branch `{branch}` was pushed without a PCM checkpoint after its last change. Run "
                "`continuity checkpoint` (it commits and pushes the checkpoint) before you stop."
            )
    return None


def session_start(event: dict) -> str | None:
    top = top_level(Path(os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or os.getcwd()))
    if top is None or not is_adopter(top):
        return None
    notes = []
    fetched = run(["git", "fetch", "--quiet", "origin"], top, timeout=20)[0] == 0
    default = default_branch(top)
    branch = current_branch(top) or "(detached HEAD)"
    if not fetched:
        notes.append("Could not fetch from GitHub; local state may be stale. GitHub is the authority.")
    behind = git(top, "rev-list", "--count", f"HEAD..origin/{default}")
    if branch != default:
        notes.append(f"This checkout is on `{branch}`, not `{default}`.")
    if behind and int(behind) > 0:
        notes.append(f"It is {behind} commit(s) behind `origin/{default}`.")
    remote_rules = git(top, "show", f"origin/{default}:AGENTS.md")
    try:
        local_rules = (top / "AGENTS.md").read_text(encoding="utf-8")
    except OSError:
        local_rules = None
    if remote_rules and remote_rules.strip() != (local_rules or "").strip():
        notes.append(
            f"The local AGENTS.md differs from `origin/{default}`. The GitHub copy below is the authority; "
            f"follow it over the local one.\n\n<agents-md source=\"origin/{default}\">\n{remote_rules}\n</agents-md>"
        )
    if event.get("source") == "compact":
        notes.append(
            "Context was just compacted. Summaries and earlier briefs are not the owner's words; "
            "AGENTS.md still binds. Put its required steps (owning issue, checks, checkpoint, push, "
            "pull request) back on the task list."
        )
    return "\n\n".join(notes) or None


def link(arg: str) -> int:
    top = top_level(Path.cwd())
    branch = current_branch(top) if top else None
    m = LINK_RE.match(arg.strip())
    if top is None or branch is None or not m:
        print("usage: acs_guard.py link <N|owner/repo#N>  (on a task branch)", file=sys.stderr)
        return 2
    repo, number = m.group(1), m.group(2)
    if not issue_exists(top, repo, number):
        print(f"issue {arg} not found on GitHub", file=sys.stderr)
        return 1
    ref = f"{repo or ''}#{number}"
    git(top, "config", f"branch.{branch}.acs-issue", ref)
    print(f"{branch} -> {ref}")
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        print(__doc__)
        return 2
    if argv[0] == "link":
        return link(argv[1] if len(argv) > 1 else "")
    if os.environ.get("ACS_GUARD", "").lower() == "off":
        return 0
    try:
        event = json.load(sys.stdin)
    except ValueError:
        event = {}
    if argv[0] == "session-start":
        context = session_start(event)
        if context:
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": context}}))
        return 0
    check = {"pre-tool": pre_tool, "stop": stop}.get(argv[0])
    if check is None:
        print(f"unknown hook {argv[0]!r}", file=sys.stderr)
        return 2
    reason = check(event)
    if reason:
        print(f"[stack guard] {reason}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
