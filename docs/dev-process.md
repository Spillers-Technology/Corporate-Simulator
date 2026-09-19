# Dev process log

Per-round implementation log: what was asked, what an adversarial review pass found,
what got fixed, how it was independently verified. Same convention as SpoolSmith's
`docs/dev-process.md` — see `CONTRIBUTING.md` for the practice this file records.

## 2026-09-19 — Live generation slice 1a: Phase 0/1 human-input forms and the first writes

Requested per `docs/spec.md` §13a — **13a only**; §13b (a single live seat) and §13c
(everything past it) were read for context and deliberately not built. This is the first
time this app writes anything to `DATA_DIR`, so the work was kept narrow on purpose.

What was built:
- `backend/src/meeting-writer.js`. Scaffolds `<date>-<slug>/drafts`, writes
  `00-motion.md` (`## Decision` / `## Cost` / `## Deadline` / `## Links`, matching the
  real `corporate-strategy` motions this repo already parses) and then
  `drafts/01-founder.md` (`seat: 01-founder`, `model: n/a — not simulated`, a real
  `generated` timestamp, and RULES §6's POSITION / SUMMARY / ARGUMENT / COST I SEE /
  WHAT WOULD CHANGE MY MIND / PREDICTION sections), and commits each with a real
  `git add` + `git commit`.
- `POST /api/meetings` and `POST /api/meetings/:id/founder-draft` in `server.js`; every
  other verb and route stays exactly as read-only as it was.
- A "New meeting" mode in the frontend beside replay: live markdown preview, one
  explicit **Seal & Commit** per form, sealed-means-sealed afterwards, and an honest
  end state ("sealed through Phase 1; live seat generation isn't implemented yet").
- `docker-compose.yml`'s `DATA_DIR` mount dropped `:ro`, with the comment rewritten —
  "don't ship real private data" still applies, "read-only" no longer does.

Decisions worth recording:
- Containment reuses `parser.js`'s `inside()` rather than a second notion of path
  safety, as §13a requires. `inside()` realpaths its candidate and so cannot vet a file
  that does not exist yet; the pattern used is "contain the parent, append one validated
  segment," backed by an `O_EXCL` create that never follows a symlink and never
  overwrites. `parser.js` also gained an extracted `collectionBase()` so lookup, listing
  and writing share one definition of where meetings live — the writer asserts, after
  `mkdir`, that the new directory is exactly what `meetingLocation()` resolves the ID to.
- Sealing checks git history as well as the filesystem, so a committed-then-deleted file
  is still sealed. Ordering is enforced, not assumed: the founder draft is refused unless
  the motion exists, is non-empty, and is already committed.
- `git rev-parse --show-toplevel` is run with `cwd: DATA_DIR` because `DATA_DIR` is
  usually a subdirectory of the repository, not its root. Commits are pathspec-scoped so
  unrelated staged work in a real repository is never swept into a meeting commit, and a
  non-repository `DATA_DIR` fails before anything is written.

Verification (what was actually run, not what was assumed):
- `npm run lint`, `npm run build`, `npm test` in both packages: backend 23 tests
  (9 new in `backend/test/human-input.test.js`), frontend 7 tests (3 new). All green.
- **No test writes outside its own disposable fixture.** Every test in
  `human-input.test.js` creates its own `mkdtemp` directory, runs `git init` inside it,
  and removes it in `t.after` — same convention as `replay.test.js`'s `copy(t)`. No test
  touches `corporate-strategy`, `demo-data/`, the synthetic fixture, or any path outside
  the tmpdir it created.
- Real end-to-end run in headless Chromium against a real backend and frontend pointed
  at a throwaway `git init` directory in the session scratchpad (never real board data):
  mode switching, live preview, motion seal, fields going read-only with the commit
  button removed, founder form appearing only after the motion is sealed, founder seal,
  the Phase 2 honesty note, zero page errors. The resulting directory was inspected
  directly: two real commits, clean `git status`, and the exact file shapes above.
- Two real bugs found by that browser pass and fixed, not filed: `form.stack`'s
  `display: block` outranked `[hidden]`, so the founder form was visible before the
  motion was sealed (fixed with an explicit `[hidden] { display: none !important }`);
  and the sealed badge, which carries the full meeting ID, overflowed the viewport at
  390 px because `.badge` is `white-space: nowrap` (fixed for the stacked forms only).
- The 409 paths were exercised in the browser too, not only in tests: re-sealing an
  already-sealed motion reports "Nothing was written," leaves the form editable and
  retryable, and does not alter the committed file.
- Replay mode was re-checked in the browser after the markup restructuring: loads the
  synthetic recording, plays, seeks via next-phase, stops, transcript intact, zero page
  errors.

Not done, deliberately: no seat dispatch, no model subprocess, no model-configuration
console, no CLI sign-in, no avatars, no sound (§13b/§13c). No adversarial-review pass by
astra this round — Codex is still rate-limited per §13's own note; the orchestrator
session re-verifies this work independently before merging.

### 2026-09-19 — Orchestrator verification of the above

Re-ran `lint`/`build`/`test` independently in both packages (23/23 backend, 7/7
frontend, clean) and read `meeting-writer.js` and the `server.js`/`parser.js` diffs in
full, not just the implementer's summary. The design holds up: `O_EXCL` as the real
seal guarantee, `inside()` reused rather than re-derived, pathspec-scoped commits,
preflight-before-any-write ordering.

**One real finding, confirmed empirically, not just in theory:** two concurrent
`createMeeting` calls for the *same* meeting ID race. Reproduced directly — fired two
`Promise.allSettled` calls at once against a throwaway `git init` repo — and the
second request's rollback deleted the first request's already-written file before its
`git commit` completed. Failure mode is safe, not silent corruption: **both** requests
end up rejected and the repository is left clean (no orphaned or half-committed
state) — but a request that should have succeeded didn't, with a confusing error
("Could not commit the sealed meeting: On branch main..."). Checked whether the
frontend can actually trigger this: `create.js` disables the commit button
synchronously before the request goes out, so a normal single click cannot reach this
window — it needs two truly concurrent requests (two tabs, a raw API client, or a
deliberate test, as above). **Documented as a known limitation, not fixed this
round:** a correct fix needs a real per-meeting-ID lock (or a compare-and-swap on the
directory's existence at creation time), which is more surface than this narrowly-
scoped slice should absorb; tracked here so it isn't rediscovered as a surprise.

Verified the browser-tested `demo-data/`/`corporate-strategy` boundary held: this
orchestrator's own race-condition test ran only against `/tmp/cs-race-test` (a
disposable `git init` directory created and used for nothing else), never real data.

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
