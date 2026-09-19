# Dev process log

Per-round implementation log: what was asked, what an adversarial review pass found,
what got fixed, how it was independently verified. Same convention as SpoolSmith's
`docs/dev-process.md` — see `CONTRIBUTING.md` for the practice this file records.

## 2026-09-19 — Replay-only MVP

Requested: implement the finished-meeting parser, REST/SSE replay, plain Canvas
renderer, one synthetic fixture, Compose-compatible packages/containers, local checks,
and logical commits. Read `docs/spec.md`, `CLAUDE.md`, and `CONTRIBUTING.md` before
implementation. No private board data was accessed, and `demo-data/` remains exactly
its original README. The current branch remains `feature/mvp-replay-mode`.

Built: Node HTTP API with YAML draft metadata, optional roster dossiers, six-seat
validation, timestamp ordering, phase 0–6 playback, explicit debate attribution,
recorded votes, separate clerk narration, disconnect cancellation, and backpressure.
Every file read resolves inside `DATA_DIR`. The frontend serves on 3000 and proxies
REST/SSE to `BACKEND_URL`; Canvas shows six desks, moving placeholder characters, a
gold human founder, progressive speech, vote gestures, and a distinct clerk bubble.
A full transcript, stop/restart, reading pace, and rotating satire lines accompany it.
Dockerfiles match the unchanged Compose contract (backend 4000 / `DATA_DIR`, frontend
3000 / `BACKEND_URL`). CI and Pages runtime versions now match Node 22 containers.

Review and fixes: self-review found that nested debate section headings could reset
speaker attribution and that trimming passage boundaries altered source text. Fixed
both and independently asserted nested-speaker retention and exact debate-text
reconstruction. Also made missing-timestamp ordering deterministic, rejected empty
artifacts/draft bodies, and avoided treating an ordinary numbered heading as a seat.
Browser inspection exposed a label/character overlap; adjusted gathering positions
and vote-token placement, then reran the browser check. The review in this run was
self-review plus regression checks, **not** the different-model adversarial review
requested by CONTRIBUTING; the active session restricts delegated agent work.

Verification:
- Both packages passed `npm run lint`, `npm run build`, and `npm test`: nine backend
  tests and three frontend tests. Backend build validates syntax; frontend emits `dist/`.
- Backend coverage exercises the synthetic directory/collection/board layouts, YAML
  parsing, phase ordering, timestamp sequencing, exact artifact text, optional roster,
  unknown attribution/votes, incomplete data, escaping symlinks/traversal, REST errors,
  timed SSE, and disconnect behavior. Frontend coverage checks state transitions,
  historical vote changes, clerk separation, static serving, live proxy delivery, and
  backend-failure reporting.
- Headless Chromium against the real API and frontend proxy passed progressive speech,
  stop/restart, phases 2/4/5, completion through the founder decision, every seat in the
  transcript, clerk styling, mobile viewport containment, and zero JavaScript errors.
  A temporary test harness reduced the timer interval for the full recording; normal
  production pacing remains 250 ms per word. Empty-data and unavailable-backend browser
  states were checked separately. Browser tooling/screenshots stayed in `/tmp`.
- Dependency audits reported zero vulnerabilities for backend runtime dependencies
  and frontend development dependencies. `git diff --check` passed.

Scope decisions: no live generation, subprocess dispatch, model configuration, CLI
sign-in, human-input forms, seal-check transitions, cutout avatars, audio, or TTS.
The synthetic fixture supersedes §7's suggested real recording for this milestone;
§9's sound cues are deferred under the explicitly narrower requested scope. Static
Pages contains only the UI and reports that a backend is required. Parser body-format
assumptions and fallback narration are documented in `backend/README.md` and the
implementation notes appended to the spec. Exact local commands are in the root README.

Environment limits: Docker is absent; Podman cannot initialize its read-only runtime
directory (`chmod /run/user/1000/libpod: read-only file system`), so container image
builds were not executed. The services themselves passed local and browser checks.
Attempted the first logical commit (backend/parser/fixture), but `git add backend`
failed because `.git/index.lock` cannot be created on the read-only `.git` mount.
No commits could be made in this environment. Intended increments are backend plus
fixture, frontend plus runtime alignment, then documentation. Nothing was pushed and
no PR was opened.

## 2026-09-19 — Repo scaffold

Initial scaffold created by Claude (Sonnet 5) at Joey's direction: README, CONTRIBUTING,
CLAUDE.md, LICENSE (already present from repo creation), `docs/spec.md` (design spec,
moved and adapted from a working draft), CI/Pages/release workflow skeletons, PR
template (STD-002-shaped), docker-compose skeleton with CLI-auth volume mounts,
directory layout. No application code yet — `frontend/` and `backend/` are empty,
awaiting implementation handoff to astra (Codex `gpt-6-astra`) per the spec's phasing
(§7): MVP is replay-only mode against a redacted demo fixture, before any live
generation is attempted.
