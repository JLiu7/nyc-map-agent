#!/usr/bin/env python3
"""Claude Code hooks that enforce the stack's rules instead of only stating them.

``acs_install.py`` copies this file to ``.claude/hooks/acs_guard.py`` in every
adopter and wires it into ``.claude/settings.json``. Claude Code runs it; the
model cannot skip it. Text in ``AGENTS.md`` and ``CLAUDE.md`` competes with
Claude Code's own defaults and loses often enough to matter (#37).

    acs_guard.py session-start   SessionStart: fetch, warn when the checkout is
                                 behind or off the default branch, hand Claude
                                 the default branch's AGENTS.md when the local
                                 copy differs, and warn when an active task
                                 record is behind its issue on GitHub (closed,
                                 or commented on since), or when that can't be
                                 checked (#68). It never blocks.
    acs_guard.py pre-tool        PreToolUse: block (exit 2) work without an
                                 owning issue, pushes to the default branch,
                                 force pushes, worktrees outside
                                 <project>/worktrees/<TASK-ID>, issue logs not
                                 in the OIO form's shape, pull requests that
                                 name no issue, changes made straight through
                                 GitHub (`gh api` writes, repo, variable,
                                 secret, release, label and workflow changes)
                                 that name no issue, `gh pr merge` on a pull
                                 request whose author is not trusted (#91),
                                 and edits that remove
                                 this guard
    acs_guard.py stop            Stop: block ending a turn while work is not on
                                 GitHub, in every stack checkout the session
                                 worked in (from its transcript): uncommitted
                                 tracked changes, files it wrote that git does
                                 not track, unpushed commits, a push without a
                                 PCM checkpoint, or a pushed branch with no open
                                 pull request, or no auto-merge armed where the
                                 repository allows auto-merge
    acs_guard.py link <N>        record issue N (or owner/repo#N) as the current
                                 branch's owning issue, after checking it exists

Other harnesses run the same checks with ``--harness codex|cursor|gemini``
before the hook name (#83): their hook input is read into the event shape
above, and the answer goes back in each harness's own form.

A branch's owning issue is the one recorded by ``link`` or the number in its
name (``fix/37-enforce-rules``); either is checked on GitHub once and cached in
``git config branch.<name>.acs-issue``. A GitHub-side change can instead name
its issue with an ``ACS_ISSUE=<owner/repo>#N`` prefix on the command (#41).

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
import tempfile
from datetime import datetime, timezone
from pathlib import Path

GUARD_NAME = "acs_guard.py"
ISSUE_FORM = Path(".github/ISSUE_TEMPLATE/observational-issue.yml")
ISSUE_REF_RE = re.compile(r"\b(?:Refs|Closes|Fixes|Resolves)\b:?\s+(?:[\w.-]+/[\w.-]+)?#\d+", re.IGNORECASE)
BRANCH_ISSUE_RE = re.compile(r"(?:^|[/_-])(?:issue-?|gh-?)?(\d{1,7})(?=[/_-]|$)")
LINK_RE = re.compile(r"^(?:([\w.-]+/[\w.-]+))?#?(\d{1,7})$")
CHECKPOINT_PREFIX = "PCM "
SEPARATORS = set(";&|()\n")
ISSUE_ENV = "ACS_ISSUE"
# gh subcommands that change GitHub state outside a pull request (#41).
GH_CHANGES = {
    "repo": {"create", "edit", "delete", "rename", "archive", "unarchive"},
    "variable": {"set", "delete"},
    "secret": {"set", "delete"},
    "release": {"create", "edit", "delete", "upload", "delete-asset"},
    "label": {"create", "edit", "delete", "clone"},
    "workflow": {"enable", "disable"},
}
GH_API_FIELDS = {"-f", "-F", "--field", "--raw-field", "--input"}
GH_API_SWITCHES = {"-i", "--include", "--paginate", "--silent", "--slurp", "--verbose"}
# `gh pr merge` flags that take a value, so the pull request can be told from them.
GH_MERGE_VALUE_FLAGS = {"-R", "--repo", "-b", "--body", "-F", "--body-file", "-t", "--subject", "-A", "--author-email", "--match-head-commit"}
TRUSTED_VAR = "AUTO_MERGE_AUTHORS"
# Recording a decision is never blocked: comments on issues and pull requests.
GH_API_COMMENT_RE = re.compile(r"^/?repos/[^/]+/[^/]+/(?:issues|pulls)/(?:\d+/comments|comments/\d+)$")


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
    return [args for _env, args in segments_with_env(command)]


def segments_with_env(command: str) -> list[tuple[dict[str, str], list[str]]]:
    """Each simple command with its leading ``VAR=value`` assignments."""
    try:
        # A newline ends a command, as `;` does; shlex would read the next line as more arguments.
        lexer = shlex.shlex(command, posix=True, punctuation_chars="();<>|&\n")
        lexer.whitespace = " \t\r"
        lexer.whitespace_split = True
        # shlex would drop everything after any `#`, hiding `ACS_ISSUE=o/r#37 gh ...` and the rest of
        # a command. A real comment then reads as a command named `#`, which no rule matches.
        lexer.commenters = ""
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
        env: dict[str, str] = {}
        while args and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", args[0]):
            name, value = args[0].split("=", 1)  # leading VAR=value assignments
            env[name] = value
            args = args[1:]
        if args:
            out.append((env, args))
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


def github_change(args: list[str]) -> str | None:
    """A name for the GitHub-side change ``gh`` would make, or None for a read."""
    group, sub = args[1], args[2]
    if sub in GH_CHANGES.get(group, ()):
        return f"gh {group} {sub}"
    if group != "api":
        return None
    method, endpoint, fields = "", "", []
    i = 2
    while i < len(args):
        a = args[i]
        name, eq, value = a.partition("=")
        if len(a) > 2 and a[0] == "-" and a[1] != "-" and a[2] != "=":
            name, eq, value = a[:2], "=", a[2:]  # a short flag with its value glued on: -XPOST, -fname=x
        if name in ("-X", "--method"):
            method = (value if eq else (args[i + 1] if i + 1 < len(args) else "")).upper()
        elif name in GH_API_FIELDS:
            fields.append(value if eq else (args[i + 1] if i + 1 < len(args) else ""))
        elif not a.startswith("-") and not endpoint:
            endpoint = a
        if a.startswith("-") and not eq and a not in GH_API_SWITCHES:
            i += 1  # skip the flag's value
        i += 1
    if endpoint == "graphql":
        return "gh api graphql mutation" if any("mutation" in f for f in fields) else None
    if method == "GET" or (not method and not fields):
        return None
    if GH_API_COMMENT_RE.match(endpoint):
        return None
    return f"gh api {method or 'POST'} {endpoint}".rstrip()


def merge_target(args: list[str]) -> tuple[str | None, list[str]]:
    """(pull request selector or None for the current branch's, ``-R`` args) of a ``gh pr merge``."""
    repo = flag_value(args, "--repo", "-R")
    selector, i = None, 3
    while i < len(args):
        a = args[i]
        if a in GH_MERGE_VALUE_FLAGS:
            i += 2
            continue
        if not a.startswith("-") and selector is None:
            selector = a
        i += 1
    return selector, (["-R", repo] if repo else [])


def untrusted_merge(args: list[str], top: Path) -> str | None:
    """Why ``gh pr merge`` must not run: its pull request's author is not trusted (#91).

    Trusted means an admin of the repository (the owner, and the owner's agents,
    which act as the owner) or a login listed in the repository variable
    AUTO_MERGE_AUTHORS. Anything GitHub can't answer lets the command through:
    ``gh`` would fail on it too.
    """
    selector, repo = merge_target(args)
    code, out = run(["gh", "pr", "view", *([selector] if selector else []), *repo,
                     "--json", "author,number,url", "-q", '.author.login+" "+(.number|tostring)+" "+.url'], top, timeout=10)
    parts = out.split() if code == 0 else []
    if len(parts) != 3:
        return None
    login, number, url = parts
    name = "/".join(url.split("/")[3:5])
    code, out = run(["gh", "variable", "get", TRUSTED_VAR, "-R", name], top, timeout=10)
    listed = {x.strip().lower() for x in re.split(r"[,\s]+", out) if x.strip()} if code == 0 else set()
    if login.lower() in listed:
        return None
    code, out = run(["gh", "api", f"repos/{name}/collaborators/{login}/permission", "-q", ".permission"], top, timeout=10)
    if code != 0 or out.strip() == "admin":
        return None
    return (
        f"gh pr merge: pull request #{number} in {name} was opened by `{login}`, who is not trusted to merge "
        f"without review (only the repository's admins and logins in its `{TRUSTED_VAR}` variable are). "
        "Leave it for the owner to review and merge; do not arm auto-merge on it."
    )


def env_issue(top: Path, env: dict[str, str]) -> str | None:
    """The ``ACS_ISSUE=<owner/repo>#N`` a command names, if that issue exists."""
    match = LINK_RE.match(env.get(ISSUE_ENV, "").strip())
    if match and issue_exists(top, match.group(1), match.group(2)):
        return env[ISSUE_ENV]
    return None


def check_gh(args: list[str], cwd: Path, env: dict[str, str] | None = None) -> str | None:
    if len(args) < 3 or Path(args[0]).name != "gh":
        return None
    top = top_level(cwd)
    if top is None or not is_adopter(top):
        project = os.environ.get("CLAUDE_PROJECT_DIR")
        top = top_level(Path(project)) if project else None
        if top is None or not is_adopter(top):
            return None
    if args[1:3] == ["pr", "merge"]:
        return untrusted_merge(args, top)
    change = github_change(args)
    if change:
        if env_issue(top, env or {}):
            return None
        branch = current_branch(top)
        if branch and branch != default_branch(top) and owning_issue(top, branch):
            return None
        return (
            f"{change}: this changes GitHub outside a pull request, so it needs an issue log that records "
            f"the decision. Prefix the command with `{ISSUE_ENV}=<owner/repo>#N` naming that issue (file it "
            "first with `gh issue create`), or run it from a task branch with an owning issue."
        )
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
    for env, args in segments_with_env(command):
        if args[0] == "cd" and len(args) > 1:
            cwd = (cwd / args[1]).expanduser()
            continue
        call = git_call(args, cwd)
        reason = check_git(*call) if call else check_gh(args, cwd, env)
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


# Stop looks at every stack checkout the session worked in, found from its transcript (#69).
TRANSCRIPT_TAIL = 4 * 1024 * 1024
MAX_CHECKOUTS = 15
MAX_LOOKUPS = 60
MAX_STOP_RETRIES = 5  # blocked retried stops per session before the guard lets one through
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}


def resolve(path: str, cwd: Path) -> Path:
    p = Path(path).expanduser()
    return p if p.is_absolute() else cwd / p


def transcript_events(path: str) -> list[dict]:
    """The transcript's last few MB as events; missing files and garbled lines are skipped."""
    try:
        with open(path, "rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            fh.seek(max(0, size - TRANSCRIPT_TAIL))
            data = fh.read()
    except (OSError, TypeError):
        return []
    lines = data.decode("utf-8", errors="replace").splitlines()
    if size > TRANSCRIPT_TAIL:
        lines = lines[1:]  # the first line was cut in half
    events = []
    for line in lines:
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict):
            events.append(event)
    return events


def session_paths(event: dict, cwd: Path) -> tuple[list[Path], list[Path]]:
    """(directories the session worked in, files it wrote), from Edit/Write paths and `cd`/`git -C` targets."""
    dirs: list[Path] = []
    written: list[Path] = []
    for entry in transcript_events(event.get("transcript_path") or ""):
        here = Path(entry["cwd"]) if isinstance(entry.get("cwd"), str) else cwd
        content = (entry.get("message") or {}).get("content") if isinstance(entry.get("message"), dict) else None
        for item in content if isinstance(content, list) else []:
            if not isinstance(item, dict) or item.get("type") != "tool_use":
                continue
            tool_input = item.get("input") if isinstance(item.get("input"), dict) else {}
            if item.get("name") in EDIT_TOOLS:
                path = tool_input.get("file_path") or tool_input.get("notebook_path")
                if isinstance(path, str) and path:
                    written.append(resolve(path, here))
                    dirs.append(written[-1].parent)
            elif item.get("name") == "Bash" and isinstance(tool_input.get("command"), str):
                where = here
                for args in segments(tool_input["command"]):
                    if args[0] == "cd" and len(args) > 1 and args[1] != "-":
                        where = resolve(args[1], where)
                        dirs.append(where)
                    elif Path(args[0]).name == "git":
                        i = 1
                        while i < len(args) and args[i].startswith("-"):  # only flags before the subcommand
                            if args[i] == "-C" and i + 1 < len(args):
                                dirs.append(resolve(args[i + 1], where))
                            i += 2 if args[i] in ("-C", "-c", "--git-dir", "--work-tree") else 1
    return dirs, written


def within(path: Path, top: Path) -> bool:
    try:
        path.resolve().relative_to(top.resolve())
    except ValueError:
        return False
    return True


def session_checkouts(project: Path, event: dict) -> tuple[list[Path], list[Path]]:
    """(stack checkouts to check, project folder first; files the session wrote)."""
    dirs, written = session_paths(event, project)
    tops: list[Path] = []
    seen: list[Path] = []
    lookups = 0
    for d in [project, *dirs]:
        if len(tops) >= MAX_CHECKOUTS or lookups >= MAX_LOOKUPS:
            break
        if any(within(d, s) for s in seen):
            continue
        lookups += 1
        top = top_level(d)
        if top is None or any(top.resolve() == s.resolve() for s in seen):
            continue
        seen.append(top)
        if is_adopter(top):
            tops.append(top)
    return tops, written


def names(paths: list[str], limit: int = 5) -> str:
    return ", ".join(f"`{p}`" for p in paths[:limit]) + (" …" if len(paths) > limit else "")


def pull_request_problem(top: Path, branch: str) -> tuple[str | None, str | None]:
    """(problem, note) for the branch's open pull request: missing, a draft, or without auto-merge.

    Auto-merge is only asked for when the repository allows it (#89); a
    repository that turns it off merges by hand, so an open, ready pull
    request is all an agent can do there.
    """
    code, out = run(
        ["gh", "pr", "list", "--head", branch, "--state", "open", "--json", "number,isDraft,autoMergeRequest", "--limit", "1"],
        top, timeout=10,
    )
    try:
        pulls = json.loads(out) if code == 0 else None
    except ValueError:
        pulls = None
    if not isinstance(pulls, list):
        # gh is missing, signed out or offline: say so, but don't block on it.
        return None, f"Could not check `{branch}`'s pull request on GitHub (gh failed or is offline); make sure it has an open pull request with auto-merge armed."
    if not pulls:
        if merged_at_tip(top, branch):
            return None, None  # its pull request merged with this exact tip; nothing is left to do here
        return (
            f"Branch `{branch}` is pushed but has no open pull request. Open one (`gh pr create` with `Refs #N`, "
            "or `Closes #N` when the merge finishes the issue) and arm auto-merge (`gh pr merge <N> --auto --squash`).",
            None,
        )
    pr = pulls[0]
    number = pr.get("number")
    if pr.get("isDraft"):
        return f"Pull request #{number} for `{branch}` is a draft, so nothing will merge it. Mark it ready (`gh pr ready {number}`) and arm auto-merge.", None
    if not pr.get("autoMergeRequest"):
        if not auto_merge_allowed(top):
            return None, f"This repository turns auto-merge off, so the owner merges pull request #{number} by hand; the work is not delivered until it merges."
        return f"Pull request #{number} for `{branch}` has no auto-merge armed. Run `gh pr merge {number} --auto --squash`.", None
    return None, None


def auto_merge_allowed(top: Path) -> bool:
    """False only when GitHub says the repository turns auto-merge off; unknown counts as allowed."""
    code, out = run(["gh", "repo", "view", "--json", "autoMergeAllowed", "-q", ".autoMergeAllowed"], top, timeout=10)
    return not (code == 0 and out.strip() == "false")


def merged_at_tip(top: Path, branch: str) -> bool:
    """True when a merged pull request for the branch has the branch's tip as its head.

    A squash merge leaves the branch's own commits off the default branch, so ancestry can't tell.
    """
    code, out = run(["gh", "pr", "list", "--head", branch, "--state", "merged", "--json", "headRefOid", "--limit", "5"], top, timeout=10)
    try:
        pulls = json.loads(out) if code == 0 else []
    except ValueError:
        pulls = []
    tip = git(top, "rev-parse", "HEAD")
    return bool(tip) and isinstance(pulls, list) and any(isinstance(p, dict) and p.get("headRefOid") == tip for p in pulls)


def session_began(event: dict) -> float | None:
    """When the session's transcript starts (seconds since the epoch), or None without one."""
    for entry in transcript_events(event.get("transcript_path") or ""):
        stamp = entry.get("timestamp")
        if isinstance(stamp, str):
            try:
                return datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
            except ValueError:
                continue
    return None


def unpushed_branches(top: Path, branch: str | None, since: float | None) -> list[tuple[str, int]]:
    """(branch, count) for local branches with commits no remote branch has.

    The checked-out branch always counts; another branch, the default one included, counts when its
    tip was committed during this session, so old local branches (squash-merged, remote deleted)
    don't block every session.
    """
    found = []
    for line in (git(top, "for-each-ref", "--format=%(refname:short) %(committerdate:unix)", "refs/heads") or "").splitlines():
        name, _, when = line.rpartition(" ")
        if name != branch and (since is None or not when.isdigit() or int(when) < since):
            continue
        count = git(top, "rev-list", "--count", f"refs/heads/{name}", "--not", "--remotes")
        if count and int(count) > 0:
            found.append((name, int(count)))
    return found


def checkout_problems(top: Path, written: list[Path], local_only: bool = False, since: float | None = None) -> tuple[list[str], list[str]]:
    """(problems, notes) that keep one checkout's work off GitHub.

    ``local_only`` keeps to work that exists only on this machine and skips the checkpoint and
    pull-request checks, which an agent may not be able to fix.
    """
    problems: list[str] = []
    notes: list[str] = []
    branch = current_branch(top)
    default = default_branch(top)
    if branch is None:
        where, fix = "a detached HEAD", "switch to a task branch (`git switch -c <type>/<N>-<slug>`), then commit and push them"
    elif branch == default:
        where, fix = f"`{default}`", "move them to a task branch (`git switch -c <type>/<N>-<slug>` keeps them), then commit, push and open a pull request"
    else:
        where, fix = f"`{branch}`", "commit, checkpoint and push them"
    # `run` strips the output, so the first line may have lost its leading status column; split instead of slicing.
    tracked = [line.split(None, 1)[-1] for line in (git(top, "status", "--porcelain", "--untracked-files=no") or "").splitlines() if line.strip()]
    if tracked:
        problems.append(f"{len(tracked)} uncommitted change(s) to tracked files on {where} ({names(tracked)}): {fix}.")
    mine = [str(p.resolve().relative_to(top.resolve())) for p in written if within(p, top)]
    if mine:
        status = git(top, "status", "--porcelain", "--untracked-files=all", "--", *sorted(set(mine))) or ""
        untracked = [line[3:] for line in status.splitlines() if line.startswith("?? ")]
        if untracked:
            problems.append(
                f"{len(untracked)} file(s) this session wrote are not in git ({names(untracked)}): `git add` them, "
                f"then {fix}; or delete them if they were scratch."
            )
    unpushed = unpushed_branches(top, branch, since)
    for name, count in unpushed:
        fix = (f"move them to a task branch (`git switch -c <type>/<N>-<slug> {name}`), then push it and open a pull request"
               if name == default else "checkpoint and push them (and open or update the pull request)")
        problems.append(
            f"Branch `{name}` has {count} commit(s) that are not on GitHub. The rules say work is not "
            f"done while it exists only locally: {fix}."
        )
    if branch is None and not unpushed:
        ahead = git(top, "rev-list", "--count", "HEAD", "--not", "--remotes")
        if ahead and int(ahead) > 0:
            problems.append(
                f"The detached HEAD has {ahead} commit(s) that no branch or remote holds: "
                "put them on a task branch (`git switch -c <type>/<N>-<slug>`), then push it."
            )
    if local_only or unpushed or branch is None or branch == default:
        return problems, notes
    upstream = git(top, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    on_branch = git(top, "rev-list", "--count", f"origin/{default}..HEAD")
    if not (upstream and on_branch and int(on_branch) > 0):
        return problems, notes
    pcm = (top / "checkpoints" / "CURRENT.md").is_file()
    subject = git(top, "log", "-1", "--format=%s") or ""
    if pcm and not subject.startswith(CHECKPOINT_PREFIX):
        problems.append(
            f"Branch `{branch}` was pushed without a PCM checkpoint after its last change. Run "
            "`continuity checkpoint` (it commits and pushes the checkpoint)."
        )
        return problems, notes
    problem, note = pull_request_problem(top, branch)
    problems += [problem] if problem else []
    notes += [note] if note else []
    return problems, notes


def retries(event: dict) -> int:
    """How many retried stops this session has had blocked, counting this one."""
    session = re.sub(r"[^\w.-]", "_", str(event.get("session_id") or "unknown"))[:80]
    path = Path(tempfile.gettempdir()) / "acs-guard" / f"stop-{session}"
    try:
        count = int(path.read_text(encoding="utf-8").strip() or 0) + 1
    except (OSError, ValueError):
        count = 1
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(count), encoding="utf-8")
    except OSError:
        pass
    return count


def stop(event: dict) -> str | None:
    # A retried stop (Claude Code sets stop_hook_active once a Stop hook has blocked) still blocks on
    # work that is only local, but skips the checkpoint and pull-request checks so the agent can finish.
    retry = bool(event.get("stop_hook_active"))
    project = Path(os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or os.getcwd())
    tops, written = session_checkouts(project, event)
    since = session_began(event)
    problems: list[str] = []
    notes: list[str] = []
    for top in tops:
        found, noted = checkout_problems(top, written, local_only=retry, since=since)
        problems += [f"- `{top}`: {p}" for p in found]
        notes += [f"- `{top}`: {n}" for n in noted]
    if not problems:
        return None  # a check gh couldn't make is not a reason to block
    if retry and retries(event) > MAX_STOP_RETRIES:
        # Give up rather than loop forever when the agent truly can't push (offline, no permission).
        sys.stderr.write(f"acs guard: letting the stop through after {MAX_STOP_RETRIES} blocked retries; work is still only local:\n"
                         + "\n".join(problems) + "\n")
        return None
    return "\n".join([
        "Work is not done while it is not on GitHub with a pull request that will merge itself. Before you stop:",
        *problems, *notes,
    ])


# ---------------------------------------------------------------- task records vs GitHub (#68)

TASK_MARKER_RE = re.compile(r"<!--\s*continuity:task\s+(\{.*?\})\s*-->", re.S)
ISSUE_URL_RE = re.compile(r"^https://github\.com/([\w.-]+/[\w.-]+)/issues/(\d+)$")
NAMED_ISSUE_RE = re.compile(r"(?<![\w/#])(?:([\w.-]+/[\w.-]+))?#(\d{1,7})\b")
ORIGIN_RE = re.compile(r"github\.com[:/]([\w.-]+/[\w.-]+?)(?:\.git)?/?$")
MAX_RECORD_ISSUES = 60  # one GraphQL query; beyond this, say so instead of checking
MAX_RECORD_NOTES = 12
# A comment this soon after the record, or a PCM receipt, is the same work reporting itself, not news.
SAME_SESSION_SECONDS = 15 * 60
RECEIPT_RE = re.compile(r"^\s*<!--\s*pcm:receipt")


def active_tasks(top: Path) -> list[dict]:
    """Active PCM task records, each with the issues it depends on: its own, then any its next action names."""
    tasks = []
    for path in sorted([*top.glob("tasks/TASK-*.md"), *top.glob("*/tasks/TASK-*.md")]):
        try:
            m = TASK_MARKER_RE.search(path.read_text(encoding="utf-8"))
            meta = json.loads(m.group(1)) if m else None
        except (OSError, ValueError):
            continue
        own = ISSUE_URL_RE.match(str(meta.get("issue_url", ""))) if isinstance(meta, dict) else None
        if not own or meta.get("status") != "active":
            continue
        issues = [(own.group(1), int(own.group(2)))]
        next_action = str(meta.get("next_action", ""))
        for repo, number in NAMED_ISSUE_RE.findall(next_action):
            ref = (repo or own.group(1), int(number))
            if ref not in issues:
                issues.append(ref)
        tasks.append({"id": str(meta.get("id") or path.stem), "path": path.relative_to(top).as_posix(),
                      "next_action": next_action, "issues": issues})
    return tasks


def live_issues(top: Path, refs: list[tuple[str, int]]) -> dict | None:
    """State, close date and latest comment of each issue, in one GraphQL query; None if GitHub can't be reached."""
    fields = "state closedAt comments(last: 1) { nodes { createdAt body author { login } } }"
    parts = []
    for i, (repo, number) in enumerate(refs):
        owner, name = repo.split("/", 1)
        parts.append(f'i{i}: repository(owner: {json.dumps(owner)}, name: {json.dumps(name)}) '
                     f'{{ issueOrPullRequest(number: {number}) {{ ... on Issue {{ {fields} }} '
                     f'... on PullRequest {{ {fields} }} }} }}')
    # An issue that doesn't exist makes gh exit non-zero but still returns data for the rest.
    _, out = run(["gh", "api", "graphql", "-f", "query={ " + " ".join(parts) + " }"], top, timeout=20)
    try:
        data = json.loads(out).get("data")
    except (ValueError, AttributeError):
        data = None
    if not isinstance(data, dict):
        return None
    live = {}
    for i, ref in enumerate(refs):
        item = ((data.get(f"i{i}") or {}).get("issueOrPullRequest")) or None
        if item:
            last = (item.get("comments") or {}).get("nodes") or [None]
            live[ref] = {"state": item.get("state"), "closed_at": item.get("closedAt"), "last_comment": last[-1]}
    return live


def record_notes(top: Path, tasks: list[dict], live: dict | None, recorded: dict[str, str | None]) -> str | None:
    """What a resuming agent must know before trusting a task record. Silent when every record is current."""
    if not tasks:
        return None
    origin = ORIGIN_RE.search(git(top, "remote", "get-url", "origin") or "")
    here = origin.group(1).casefold() if origin else None

    def name(ref: tuple[str, int]) -> str:
        return f"#{ref[1]}" if ref[0].casefold() == here else f"{ref[0]}#{ref[1]}"

    if live is None:
        ids = ", ".join(t["id"] for t in tasks[:MAX_RECORD_NOTES]) + (" and more" if len(tasks) > MAX_RECORD_NOTES else "")
        return (f"Could not reach GitHub to check the issues behind {len(tasks)} active task record(s) ({ids}). "
                "Their recorded status and next actions are unverified and may be out of date: check the "
                "issue (for example `continuity issue verify <TASK-ID>`) before acting on one.")
    notes = []
    for task in tasks:
        quoted = task["next_action"][:160] + ("…" if len(task["next_action"]) > 160 else "")
        for k, ref in enumerate(task["issues"]):
            issue = live.get(ref)
            if issue is None:
                continue
            if str(issue["state"]).upper() in {"CLOSED", "MERGED"}:
                when = str(issue["closed_at"] or "")[:10]
                what = (f"its issue {name(ref)} closed on {when}, but the record still says active" if k == 0 else
                        f"its next action depends on {name(ref)}, which closed on {when}")
                notes.append(f"- {task['id']} (`{task['path']}`): {what}. The recorded next action "
                             f"(\"{quoted}\") is out of date; read {name(ref)} before acting.")
                break
            comment, since = issue["last_comment"], recorded.get(task["path"])
            if comment and since and _news(comment, since):
                who = (comment.get("author") or {}).get("login", "someone")
                notes.append(f"- {task['id']} (`{task['path']}`): {name(ref)} has a comment from {who} on "
                             f"{comment['createdAt'][:10]}, after this record last changed ({since[:10]}). "
                             f"Read it before acting on the recorded next action (\"{quoted}\").")
                break
    if not notes:
        return None
    more = f"\n- …and {len(notes) - MAX_RECORD_NOTES} more." if len(notes) > MAX_RECORD_NOTES else ""
    return ("These task records are behind GitHub, which is the authority. Do not act on their recorded "
            "next action until you have read the issue:\n" + "\n".join(notes[:MAX_RECORD_NOTES]) + more)


def check_records(top: Path) -> str | None:
    tasks = active_tasks(top)
    refs = list(dict.fromkeys(ref for t in tasks for ref in t["issues"]))
    if not refs:
        return None
    if len(refs) > MAX_RECORD_ISSUES:
        return (f"{len(tasks)} active task records name {len(refs)} issues, too many to check at startup. "
                "Check a task's issue on GitHub before acting on its recorded next action.")
    recorded = {t["path"]: _utc(git(top, "log", "-1", "--format=%cI", "--", t["path"])) for t in tasks}
    return record_notes(top, tasks, live_issues(top, refs), recorded)


def _news(comment: dict, since: str) -> bool:
    """Whether a comment came after the record and is not the record's own work reporting itself."""
    try:
        posted = datetime.fromisoformat(str(comment.get("createdAt", "")).replace("Z", "+00:00"))
        recorded = datetime.fromisoformat(since.replace("Z", "+00:00"))
    except ValueError:
        return False
    if RECEIPT_RE.match(str(comment.get("body", ""))):
        return False
    return (posted - recorded).total_seconds() > SAME_SESSION_SECONDS


def _utc(stamp: str | None) -> str | None:
    """A git ISO date as UTC ``YYYY-MM-DDTHH:MM:SSZ``, so it compares as text with GitHub's dates."""
    if not stamp:
        return None
    try:
        return datetime.fromisoformat(stamp).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
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
    records = check_records(top)
    if records:
        notes.append(records)
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


# ---------------------------------------------------------------- other harnesses (#83)

HARNESSES = ("claude", "codex", "cursor", "gemini")
# Gemini CLI's tool names, as the Claude Code tools the checks know.
GEMINI_TOOLS = {"run_shell_command": "Bash", "write_file": "Write", "replace": "Edit"}


def normalize(harness: str, hook: str, event: dict) -> dict:
    """The harness's hook input in the shape pre_tool, stop and session_start take."""
    if harness in ("claude", "codex"):  # Codex sends Claude Code's fields; its shell tool is `Bash`
        return event
    event = dict(event)
    if harness == "cursor":
        roots = event.get("workspace_roots") or []
        if not event.get("cwd"):  # stop and sessionStart send no cwd
            event["cwd"] = os.environ.get("CURSOR_PROJECT_DIR") or (roots[0] if roots else None)
        if hook == "pre-tool" and "command" in event:  # beforeShellExecution
            event.update(tool_name="Bash", tool_input={"command": event["command"]})
        if hook == "stop":
            event["stop_hook_active"] = bool(event.get("loop_count"))
        event.setdefault("session_id", event.get("conversation_id"))
    elif harness == "gemini" and event.get("tool_name") in GEMINI_TOOLS:
        event["tool_name"] = GEMINI_TOOLS[event["tool_name"]]
    return event


def answer(harness: str, hook: str, text: str | None) -> int:
    """Give the harness the guard's verdict (a reason to block, or context) in its own form."""
    def out(data: dict) -> int:
        print(json.dumps(data))
        return 0

    if hook == "session-start":
        if not text:
            return 0
        if harness == "cursor":
            return out({"additional_context": text})
        return out({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": text}})
    if harness == "cursor" and hook == "pre-tool":
        # A permission hook must answer; empty output is not an allow.
        if not text:
            return out({"permission": "allow"})
        return out({"permission": "deny", "agent_message": f"[stack guard] {text}", "user_message": f"[stack guard] {text}"})
    if not text:
        return 0
    if harness == "cursor":
        return out({"followup_message": f"[stack guard] {text}"})
    if harness == "gemini":
        return out({"decision": "deny", "reason": f"[stack guard] {text}"})
    if harness == "codex" and hook == "stop":
        return out({"decision": "block", "reason": f"[stack guard] {text}"})
    print(f"[stack guard] {text}", file=sys.stderr)
    return 2


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    harness = "claude"
    if "--harness" in argv:
        i = argv.index("--harness")
        harness = argv[i + 1] if i + 1 < len(argv) else ""
        del argv[i:i + 2]
        if harness not in HARNESSES:
            print(f"unknown harness {harness!r}; one of {', '.join(HARNESSES)}", file=sys.stderr)
            return 2
    if not argv:
        print(__doc__)
        return 2
    if argv[0] == "link":
        return link(argv[1] if len(argv) > 1 else "")
    known = argv[0] in ("session-start", "pre-tool", "stop")
    if os.environ.get("ACS_GUARD", "").lower() == "off":
        return answer(harness, argv[0], None) if known else 0
    if not known:
        print(f"unknown hook {argv[0]!r}", file=sys.stderr)
        return 2
    try:
        event = json.load(sys.stdin)
    except ValueError:
        event = {}
    event = normalize(harness, argv[0], event if isinstance(event, dict) else {})
    check = {"session-start": session_start, "pre-tool": pre_tool, "stop": stop}[argv[0]]
    return answer(harness, argv[0], check(event))


if __name__ == "__main__":
    sys.exit(main())
