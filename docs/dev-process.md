# Dev process log

Per-round implementation log: what was asked, what an adversarial review pass found,
what got fixed, how it was independently verified. Same convention as SpoolSmith's
`docs/dev-process.md` — see `CONTRIBUTING.md` for the practice this file records.

## 2026-09-19 — Replay navigation: table of contents, timeline scrubber, fast-forward

Requested per `docs/spec.md` §12 after watching v0.1.0 replay real `corporate-strategy`
data: a way to seek around a recording and speed it up mid-playback. Dispatched to
astra (Codex `gpt-6-astra`) first; that dispatch hung for 19 minutes at 0% CPU with zero
files touched. Diagnosed directly rather than assumed: a minimal `codex exec` call
returned an immediate, explicit usage-limit error ("hit your usage limit... try again
at Sep 22nd, 2026 11:39 PM"). Codex was unavailable for the remainder of this round.

Re-dispatched to an isolated Claude Opus agent instead, with the same spec, scope
boundaries, and process requirements astra would have received. That agent was stopped
by the user (via the harness's own interrupt) before it finished reporting — but its
actual work was already complete and passing when that happened: the backend half had
already landed as a real commit (`event indexes, table of contents, and from= seeking`),
and the frontend half was sitting fully written, uncommitted, in the working tree.

**What got built:** `recording()`'s event sequence now carries a stable, monotonic
`index`; a new pure `navigation()` reduces one walk of that sequence to a table of
contents (per-phase `startEvent`, Phase 2's five seats each with their own) plus
`totalEvents`. The SSE endpoint accepts `from=<event index>` — events before it still
build client state in full, just with zero delay, then normal pacing resumes. The
frontend's `navigation.js` adds pure `targets`/`nextPhase`/`nextSpeaker`/`currentTarget`/
`offset` helpers; `app.js` wires a clickable TOC sidebar, phase tick marks drawn on a
0..totalEvents drag-to-seek slider, next-phase/next-speaker buttons, and a speed control
that's now changeable mid-playback (that reconnect-from-here IS the fast-forward — no
separate control needed). `archive()` was correctly rewritten to build transcript
entries from state rather than cloning live DOM, since rendering itself can now be
skipped during a catch-up burst; `schedule()` coalesces that burst into one animation
frame rather than thousands of synchronous renders.

**Review, disclosed honestly:** no cross-vendor adversarial pass happened this round —
Codex (the usual second opinion) was rate-limited for the whole window. In its place:
the orchestrating session read every line of the actual diff (not just a summary),
independently re-ran `lint`/`build`/`test` for both packages after the interrupt rather
than trusting work that never got to report itself as done, and reasoned through the
event-ordering edge cases (Phase 2's toc entry is always yielded before its seats'
`speech-start` events, by the generator's own structure, so the seats array can never
end up empty when it shouldn't be).

**Verified:** backend 14/14 tests pass (5 new, covering index stability, toc structure,
seek-skips-pacing, and seeking-past-the-end), frontend 4/4 (1 new, covering `targets`
ordering/labels, `nextPhase` skipping over Phase 2's individual seats where
`nextSpeaker` doesn't, and the off-by-zero-divide guard in `offset`). Both packages
lint/build clean. Not independently re-verified this round: a live browser check (the
agent's own summary, which would have described any manual browser pass, was never
delivered) — the DOM-construction code was read carefully instead, and real end-to-end
verification against the local server (real `corporate-strategy` data, actual seek
behavior over HTTP) happens before this ships, per the standing localhost-restart
practice in `CLAUDE.md`.

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
