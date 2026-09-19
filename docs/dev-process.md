# Dev process log

Per-round implementation log: what was asked, what an adversarial review pass found,
what got fixed, how it was independently verified. Same convention as SpoolSmith's
`docs/dev-process.md` — see `CONTRIBUTING.md` for the practice this file records.

## 2026-09-19 — Repo scaffold

Initial scaffold created by Claude (Sonnet 5) at Joey's direction: README, CONTRIBUTING,
CLAUDE.md, LICENSE (already present from repo creation), `docs/spec.md` (design spec,
moved and adapted from a working draft), CI/Pages/release workflow skeletons, PR
template (STD-002-shaped), docker-compose skeleton with CLI-auth volume mounts,
directory layout. No application code yet — `frontend/` and `backend/` are empty,
awaiting implementation handoff to astra (Codex `gpt-6-astra`) per the spec's phasing
(§7): MVP is replay-only mode against a redacted demo fixture, before any live
generation is attempted.
