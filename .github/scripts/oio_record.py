#!/usr/bin/env python3
"""Write one OIO issue-log record (schema oio.issue-log-record.v1) for the repository it runs in.

The destination and the project come from the checkout's GitHub remote, and the
ontology versions from its installed `.oio/ontology/project.json`, never from
constants: an adopter's hand-written writer stamped every record with another
repository and a made-up author (#98). The filer is passed in, as
`agent:<harness>/<session id>` for an agent or a GitHub login for a person, and
the stack's guard checks an agent stamp against the session running the command.

The record is printed, or written with `--out`. It is the machine form of an
issue log, not a filing: file the log itself as a GitHub issue with the form.

    python .github/scripts/oio_record.py --filer agent:codex/<session id> \\
        --consequence "Release notes skip the second commit" --affected "release job"

Stdlib only; validates against the installed schema when `jsonschema` is present.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

SCHEMA_VERSION = "oio.issue-log-record.v1"
SCHEMA_RELS = (Path(".oio/schemas/v1/issue-log-record.schema.json"), Path("oio/schemas/v1/issue-log-record.schema.json"))
PROJECT_REL = Path(".oio/ontology/project.json")
REMOTE_RE = re.compile(r"github\.com[:/]+([^/\s]+/[^/\s]+?)(?:\.git)?/?$")
FILER_RE = re.compile(r"^(agent:[a-z0-9-]+/\S+|[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))$")
ORIGINS = ("human-direct", "human-via-agent", "agent-proposed", "agent-initiated")
LIFECYCLE = ("open", "resolved", "superseded", "obsolete", "wontfix")
CHOICES = {
    "impact_band": ("critical", "high", "moderate", "low", "informational"),
    "likelihood": ("observed", "likely", "plausible", "unlikely", "unknown"),
    "exposure": ("active-production", "intermittent-production", "limited-test-or-preview", "not-currently-exposed", "unknown"),
    "recoverability": ("automatic-recovery", "documented-recovery", "manual-recovery", "difficult-or-irreversible", "unknown"),
    "evidence_confidence": ("confirmed", "supported", "uncertain", "unknown"),
    "relation": ("blocks", "affects", "supports", "unrelated", "unknown"),
}


class RecordError(Exception):
    pass


def git(top: Path, *args: str) -> str:
    try:
        done = subprocess.run(["git", *args], cwd=top, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return ""
    return done.stdout.strip() if done.returncode == 0 else ""


def repository(top: Path) -> str:
    """`owner/name` of the checkout's GitHub remote."""
    url = git(top, "remote", "get-url", "origin")
    match = REMOTE_RE.search(url)
    if not match:
        raise RecordError(f"cannot tell the destination: `origin` is not a GitHub remote ({url or 'no remote'})")
    return match.group(1)


def ontology_versions(top: Path) -> dict:
    try:
        project = json.loads((top / PROJECT_REL).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RecordError(f"no readable {PROJECT_REL.as_posix()}; install OIO here first ({exc})") from None
    return {"default_version": str(project["extends"]["version"]), "project_version": str(project["version"])}


def ontology(top: Path) -> dict:
    """The installed project ontology: the source of every priority path and its concept ID."""
    try:
        return json.loads((top / PROJECT_REL).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RecordError(f"no readable {PROJECT_REL.as_posix()}; install OIO here first ({exc})") from None


def priority_entry(top: Path, path: str) -> dict:
    """The concept this repository defines for `path`.

    The record names the concept ID the project ontology declares for the path, never one derived from the path
    itself: triage (`oio_triage.py`) compares the two and labels the issue `needs-priority-definition` when they
    disagree, and the ontology is the only place that knows whether a path is defined at all. Writing `None` here
    (the old behaviour) made every ranked record fail its own schema, which requires a string whenever the status is
    `resolved` — so `--priority` could never produce a valid record.
    """
    project = ontology(top)
    entry = next((p for p in project.get("priorities", []) if str(p.get("path")) == str(path)), None)
    if entry is None:
        defined = ", ".join(str(p.get("path")) for p in project.get("priorities", [])[:12]) or "none"
        raise RecordError(
            f"--priority {path!r} is not a priority path this repository defines; use one of {defined}"
            + (" …" if len(project.get("priorities", [])) > 12 else "")
        )
    concept_id = str(entry.get("concept_id") or "").strip()
    if not concept_id:
        raise RecordError(f"--priority {path!r} has no concept_id in {PROJECT_REL.as_posix()}")
    return {"status": "resolved", "path": str(path), "concept_id": concept_id}


def build(top: Path, args: argparse.Namespace) -> dict:
    # Required for a record, optional on the command line so `--self-test` can run on its own.
    missing = [n for n in ("filer", "consequence", "affected") if not getattr(args, n)]
    if missing:
        raise RecordError("a record needs " + ", ".join("--" + n for n in missing))
    if not FILER_RE.match(args.filer):
        raise RecordError(f"--filer `{args.filer}` is neither `agent:<harness>/<session id>` nor a GitHub login")
    is_agent = args.filer.startswith("agent:")
    origin = args.origin or ("agent-initiated" if is_agent else "human-direct")
    if origin == "human-via-agent" and not args.directing_human:
        raise RecordError("--origin human-via-agent needs --directing-human, the person who asked for it")
    destination = repository(top)
    project = args.project or destination
    return {
        "schema_version": SCHEMA_VERSION,
        "issue_type": args.issue_type,
        "project": {"id": project, "repository": project},
        "ontology": ontology_versions(top),
        "filer": {
            "origin": origin,
            "authenticated_actor": args.actor,
            "content_author": args.filer,
            "directing_human": args.directing_human,
            # A record is a claim; only a separate authorized GitHub action attests an account.
            "authorization_state": "claimed",
            "authorization_evidence": None,
            "session_reference": args.filer if is_agent else None,
            "destination_repository": destination,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "priority": priority_entry(top, args.priority) if args.priority is not None else {"status": "unresolved", "path": None, "concept_id": None},
        "impact": {
            "affected": args.affected,
            "consequence": args.consequence,
            "breadth": args.breadth,
            "workaround": args.workaround,
            "impact_band": args.impact_band,
            "likelihood": args.likelihood,
            "exposure": args.exposure,
            "recoverability": args.recoverability,
            "evidence_confidence": args.evidence_confidence,
            "unresolved_risk": args.unresolved_risk,
            "change_risk": args.change_risk,
        },
        "release_relevance": {
            "relation": args.relation,
            "product_outcome": args.product_outcome,
            "delay_cost": args.delay_cost,
            "smallest_useful_slice": args.smallest_useful_slice,
        },
        "lifecycle": {"status": args.status},
    }


def missing_fields(record: dict, schema: dict, where: str = "") -> list[str]:
    """Required fields the record lacks, when jsonschema is not installed."""
    out = [f"{where}{key}" for key in schema.get("required", []) if key not in record]
    for key, sub in schema.get("properties", {}).items():
        if isinstance(sub, dict) and isinstance(record.get(key), dict):
            out += missing_fields(record[key], sub, f"{where}{key}.")
    return out


def validate(top: Path, record: dict) -> None:
    path = next((top / rel for rel in SCHEMA_RELS if (top / rel).is_file()), None)
    if path is None:
        raise RecordError("no issue-log record schema here; install OIO first")
    schema = json.loads(path.read_text(encoding="utf-8"))
    try:
        import jsonschema
    except ImportError:
        if missing := missing_fields(record, schema):
            raise RecordError("record is missing " + ", ".join(missing)) from None
        return
    try:
        jsonschema.validate(record, schema)
    except jsonschema.ValidationError as exc:
        raise RecordError(f"record does not match the schema: {exc.message}") from None


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--filer", help="agent:<harness>/<session id>, or the person's GitHub login")
    ap.add_argument("--consequence")
    ap.add_argument("--affected", action="append", help="who or what is affected; repeat for several")
    ap.add_argument("--issue-type", choices=("observational", "operational"), default="observational")
    ap.add_argument("--origin", choices=ORIGINS)
    ap.add_argument("--directing-human", help="the person who asked for this log, when one did")
    ap.add_argument("--actor", default="unknown", help="the GitHub account the log is filed with")
    ap.add_argument("--project", help="what the log is about, when that is not this repository")
    ap.add_argument("--priority", help="a priority path from this repository's project ontology")
    ap.add_argument("--status", choices=LIFECYCLE, default="open")
    for name, values in CHOICES.items():
        ap.add_argument("--" + name.replace("_", "-"), choices=values, default="unknown" if "unknown" in values else "low")
    for name in ("breadth", "workaround", "unresolved_risk", "change_risk", "product_outcome", "delay_cost", "smallest_useful_slice"):
        ap.add_argument("--" + name.replace("_", "-"), default="unknown")
    ap.add_argument("--out", type=Path, help="write the record here instead of printing it")
    ap.add_argument("--self-test", action="store_true", help="check priority handling against this repository's ontology, then exit")
    return ap


def self_test(top: Path) -> int:
    """Check the priority handling against this repository's own ontology, without filing anything.

    `--priority` used to write `concept_id: None`, so every ranked record failed its own schema
    (`None is not of type 'string'`) and could never be written. This pins the three cases that matter: a defined
    path resolves to the ontology's concept, an undefined one is refused with a message, and no path stays unresolved.
    """
    project = ontology(top)
    failures: list[str] = []
    defined = [str(p.get("path")) for p in project.get("priorities", []) if p.get("concept_id")]
    if not defined:
        failures.append("the project ontology defines no priority with a concept_id")
    for path in defined[:3]:
        entry = priority_entry(top, path)
        if entry["status"] != "resolved" or not entry["concept_id"]:
            failures.append(f"priority {path!r} did not resolve to a concept")
        expected = next(p["concept_id"] for p in project["priorities"] if str(p["path"]) == path)
        if entry["concept_id"] != expected:
            failures.append(f"priority {path!r} resolved to {entry['concept_id']!r}, ontology says {expected!r}")
    for bad in ("999999", "1.999999", "  "):
        try:
            priority_entry(top, bad)
        except RecordError:
            continue
        failures.append(f"priority {bad!r} was accepted but the ontology does not define it")
    # No --priority means an unresolved priority: null path and concept, which the schema requires of that branch.
    unresolved = build(top, parser().parse_args([
        "--filer", "agent:selftest/0", "--consequence", "x", "--affected", "y"]))["priority"]
    if unresolved != {"status": "unresolved", "path": None, "concept_id": None}:
        failures.append(f"an unranked record wrote {unresolved!r}, expected null path and concept")
    if failures:
        for line in failures:
            print(f"oio_record: self-test: {line}", file=sys.stderr)
        return 2
    print(f"oio_record: self-test ok ({len(defined)} priority paths, {min(3, len(defined))} checked)")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    top = Path(git(Path.cwd(), "rev-parse", "--show-toplevel") or Path.cwd())
    if args.self_test:
        try:
            return self_test(top)
        except RecordError as exc:
            print(f"oio_record: {exc}", file=sys.stderr)
            return 2
    try:
        record = build(top, args)
        validate(top, record)
    except RecordError as exc:
        print(f"oio_record: {exc}", file=sys.stderr)
        return 2
    text = json.dumps(record, indent=2) + "\n"
    if args.out:
        args.out.write_text(text, encoding="utf-8")
        print(f"oio_record: wrote {args.out}")
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
