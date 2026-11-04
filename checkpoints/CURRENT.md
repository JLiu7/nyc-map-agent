# Current repository checkpoint

<!-- continuity:current {"active_task": "NMA-0005", "active_task_file": "tasks/TASK-NMA-0005-line-status-eval.md", "protocol_version": "0.1.0-draft", "schema": "project-continuity.current.v1"} -->

Older state: [`history/2026-11.md`](history/2026-11.md) and earlier months in `history/`.

## Current projection

*Updated 2026-11-03, 21:30 UTC. Read this first; it says where the work stands so a new agent does not have to rebuild that from branches and pull requests.*

## In flight

**The model switch and the spoken answers merged on 2026-11-02 and 2026-11-03 (#35, pull request #36; #37, pull request #38).** Settings has a Model choice (Auto, Smart or Dev), stored on the phone and sent with each question. Smart tries DeepSeek on InferHub, Qwen, WorkBuddy and a free OpenRouter model through the Octo vault relay, and a watcher probes each one every five minutes with a real tool call and puts failing ones last; Dev is the LFM3 path. The four `SMART_*_KEY` working keys are in the VPS env (`~/apps/nyc-map-agent.env`), so Auto means Smart in production once that build deploys; the watcher renews them daily. Answers and speech now spell out station shorthand ("Times Square-42 Street"), and `POST /api/tts` reads English, Spanish, French and Chinese answers with Kokoro from the copilot speech server on the MacBook Pro; other languages and any failure use the browser voice. Not done: if all four smart providers fail the rider gets the error (Dev is not a last step), a cold Kokoro can leave up to 20 s of silence before the browser voice speaks, the trip suite (`docs/eval/trips/`, 41.2% on LFM3, #23) has not been run on both profiles, and nobody has listened to the voice on a phone.

## Next

- **After #44 deploys, check sleep and wake on the VPS.** Both containers should show `Exited (0)` 10 minutes after the last request, the first trip after that should come from OTP rather than the built-in router, and OTP's real cold start should be written into `deploy/README.md` and server-management's `vps/services.toml`.
