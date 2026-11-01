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


def build(top: Path, args: argparse.Namespace) -> dict:
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
        "priority": {"status": "unresolved" if args.priority is None else "resolved", "path": args.priority, "concept_id": None},
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
    ap.add_argument("--filer", required=True, help="agent:<harness>/<session id>, or the person's GitHub login")
    ap.add_argument("--consequence", required=True)
    ap.add_argument("--affected", action="append", required=True, help="who or what is affected; repeat for several")
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
    return ap


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    top = Path(git(Path.cwd(), "rev-parse", "--show-toplevel") or Path.cwd())
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
