# Agent Instructions

Before changing anything people see in the app, read `docs/DESIGN_RULES.md` (the owner's design preferences: the map stays visible, buttons open dropdowns, no unasked suggestions, memory stays on the phone). The chat agent's runtime rules live in `server/features/agent/prompt.ts`.

To continue the agent-first build, start from `docs/PDD.md`: what is built, what remains, how to check it, and how to ship it. Design frames are in `docs/design/frames/`.

Speech routing and fallbacks (which machine hears and speaks for this app, and what happens when they are all full) are changed only in `voice-agent-research`'s `demo/live-site/speech/gateway/routes.toml` (its `docs/speech-gateway.md`, section "Switch or upgrade routing"), never in this repository. Change them only when the owner asks, and never switch cloud speech on by yourself.

For where the work stands right now (what merged, what is in flight, which worktree belongs to which pull request, what comes next), read `checkpoints/CURRENT.md`. Nothing updates it automatically: any pull request that finishes, starts or abandons a piece of work updates its "Completed recently", "In flight" and "Next" sections in the same pull request.

<!-- acs:boot:start -->
## Agent stack boot (ACS hot-loader, installed 2026-10-21)

This repo runs the agent stack: ACS (Agent Custom Setup, coordination), PCM (Project Continuity Modules, checkpoints and PR gates), CGM (Content Generation Modules, writing rules) and OIO (Observational Issue Ops, issue logs). All four ship together from one repository, [Pukujan/agent-stack-train](https://github.com/Pukujan/agent-stack-train), and `stack-manifest.json` follows its certified release. The checkout lives in the ACS cache at `~/.cache/acs/deps/agent-stack-train`, one folder per component (`acs/`, `pcm/`, `cgm/`, `oio/`). Every agent (Claude Code, Codex, Grok, or a person scripting one) follows these steps; nothing else delivers them.

**At session start**
1. Run `scripts/agent-hygiene.sh --yes`. It stops this repo's dev servers and test browsers that were left running for more than six hours, and reports any dev-root clutter.
2. Check the coordination seat: `python3 .coord/bin/seat_protocol.py status`. Use `join` to take part, and `renew` while you hold the boss seat.
3. Read `checkpoints/CURRENT.md` before choosing work.

**While working**
- **Worktrees, clones and scratch** go under `~/.cache/acs/{worktrees,deps,scratch}`, never in the projects folder or inside this repo. For example: `git worktree add ~/.cache/acs/worktrees/nyc-map-agent-<task> -b <branch>`. Remove a worktree once its branch is pushed and clean.
- **Dev servers and test browsers:** stop every one you start as soon as you are done with it. Never stop another project's processes.
- **Writing rules (CGM, always on):** before any human-facing writing, load and apply `~/.cache/acs/deps/agent-stack-train/cgm/modules/human-sounding-writing/SKILL.md`. That covers PR, issue and commit prose, docs and HTML reports. README and product pages use `modules/writing-direction/SKILL.md` instead; generated file names use `modules/human-output-naming/SKILL.md`. If the file can't be loaded, stop and say so.

**At session end**
1. Update `checkpoints/CURRENT.md` with what changed and the next step (PCM continuity).
2. Stop your dev servers. Run `scripts/agent-hygiene.sh` once more.

Details: `~/.cache/acs/deps/agent-stack-train/acs/modules/coordination/multi-agent-hotload/v0.1.0/HOTLOAD.md`. Why this block exists: Pukujan/agent-custom-setup#112.
<!-- acs:boot:end -->

<!-- oio:issue-log-guidance:start -->
Before filing an observational or operational issue log, read `.oio/ontology/ISSUE_LOG_ONTOLOGY.md`, `.oio/ontology/project.json`, and `.oio/ontology/AGENT_GUIDE.md`. Confirm the exact destination and filing action are authorized. On OIO, ACS, CGM, and PCM, do not submit an issue or write files without explicit human direction for that destination and action. A proposal can remain a local draft until directed. Never treat adoption as permission to write to an adopter or sibling repository.
<!-- oio:issue-log-guidance:end -->

<!-- pcm:issue-log-format:start -->
## Issue log format (issue-log-format 1.3.0)

<!-- pcm:policy {"id":"issue-log-format","policy_version":"1.3.0","protocol_version":"0.1.0-draft"} -->

**The issue-log shape is OIO's.** The canonical shape — required fields, lifecycle status, typed relations, and filer provenance — is defined by [`Pukujan/observational-issue-ops`](https://github.com/Pukujan/observational-issue-ops): [`ontology/ISSUE_LOG_ONTOLOGY.md`](https://github.com/Pukujan/observational-issue-ops/blob/main/ontology/ISSUE_LOG_ONTOLOGY.md) is the semantic definition and [`.github/ISSUE_TEMPLATE/observational-issue.yml`](https://github.com/Pukujan/observational-issue-ops/blob/main/.github/ISSUE_TEMPLATE/observational-issue.yml) is the intake form. PCM does not define a competing form; fill OIO's shape and apply the writing rules below. **PCM owns the writing:** plain language, claim-first evidence, no unexplained acronym or bare identifier on first use, diagrams (mermaid), the reader-first pull-request shape, checkpoint and CURRENT projections, and the closing-keyword rule. **What an investigation record must say** (incidents, failures, research, design issues whose cause is not yet proven): numbered symptoms, each with a bold short name and one observable sentence; hypotheses with **Status** (unverified / confirmed / refuted / inconclusive), **Would confirm**, **Would refute**, and **Experiment**; evidence with provenance that names the hypothesis it supports or undercuts, plus a **Counter-signal** when one exists; an honest caveat; problems kept separate from gaps; and a **Proposal** labelled *(proposal)* that says none of it exists unless named as existing. That is guidance on what the record must say, not a second form schema. **Pull requests open reader-first:** problem and consequence, what changes, how to verify, and what stays unchanged; lineage links; evidence and one next action; long logs collapsed or linked; progress-only references use `Refs #<number>`, and a native closing keyword (`Closes`/`Fixes`/`Resolves #<number>`) only when the merge should resolve the issue. **Diagrams (mermaid):** when a record describes a flow with 4+ ordered steps or 2+ branches, add a fenced mermaid diagram *and* keep an adjacent text list or table so the record survives render failure; default to `graph TD` (vertical) because wide `LR` flows shrink to illegible strips on phones — reserve `LR` for 4 or fewer short nodes; cap 8 nodes and 6-word labels; wrap diagrams that may exceed the container width inside `<details>` (GitHub mounts the renderer lazily on expand); preview the rendered diagram before publishing (broken syntax shows a visible parse error) and never cite renderer URLs as standalone sources. **Readability rules:** the explain-the-reference rule is owned by Content Generation Modules, the single source for issue-log prose voice; read [CGM `docs/NARRATIVE_AUTHORITY.md` Rule 2](https://github.com/Pukujan/content-generation-modules/blob/main/docs/NARRATIVE_AUTHORITY.md#rule-2-explain-the-reference-before-it-carries-weight) rather than a copy here. Write evidence as the claim first, numbers as support (“nothing this change could break failed (263 tests, same six machine-environment failures as before)”), never bare counts; no unexplained acronym or bare identifier on first use in any tier; PR openings and checkpoint Completed/Next lines start with one problem sentence a newcomer can follow; the rule set applies to CURRENT projections and checkpoint entries exactly as to issue logs. No private absolute paths or secrets; link rather than paste long logs. See `docs/ISSUE_LOG_FORMAT.md` for the full format, exemplar, and examples.
<!-- pcm:issue-log-format:end -->

## Issue logs must be in the form's shape (owner, 2026-10-29)

OIO's triage reads only the intake form's `### <field label>` headings (`.github/ISSUE_TEMPLATE/observational-issue.yml`). A prose issue log is skipped with no label, so it is never triaged. Write the fields as JSON and run `python3 scripts/issue-log/issue_log_shape.py render fields.json > body.md`, then `gh issue create --body-file body.md`; `lint body.md` lists missing headings. A Claude Code hook blocks `gh issue create` with a prose issue log, and the Issue Log Shape workflow labels one `needs-record-shape` until it is fixed.

## Screens must pass the layout bar (owner, 2026-10-27)

Saying a screen "works on mobile" is not evidence. The bar is code: `e2e/layout.ts` checks, at 320×568, 375×667, 390×844 and 1280×800, that nothing scrolls sideways or sits off the edge, every tap target is at least 24 px, no control is covered by or overlaps another, and the map's focus (you, the followed train, the asked place) stays clear of every panel.

- Any pull request that changes `src/**/*.tsx` or a stylesheet must add or update an e2e spec that calls `expectLayout` for that screen (usually a case in `e2e/responsive.spec.ts`). CI's `pr-title` job fails it otherwise; the `no-layout-change` label skips the gate only when nothing on screen moves (re-run the job after labelling).
- A phone panel that rises from the bottom is a **pull sheet**: use `src/components/PullSheet.tsx` (drag handle, peek and full heights, publishes `--pull-sheet-h` so map controls sit above it). Do not hand-roll another bottom sheet.
- `data-overlap-ok` marks a deliberate overlap (a resize handle on its frame's corner). Never use it to silence a real collision.
- Keyboard shortcuts never fire while someone is typing in a field (arrow keys, WASD, Escape with text in the box).
