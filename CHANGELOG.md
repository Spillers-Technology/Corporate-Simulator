# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.3.0] - 2026-09-19

### Added
- Live generation, slice 1a (`docs/spec.md` §13a): human-input forms for Phase 0 (the
  motion) and Phase 1 (the founder draft). A "New meeting" mode alongside replay, with
  a live preview of the exact markdown that will be written, an explicit **Seal &
  Commit** step that is the only thing that writes anything, and sealed-means-sealed
  behavior afterwards — fields go read-only and the commit button is removed.
- Backend `meeting-writer.js` plus `POST /api/meetings` and
  `POST /api/meetings/:id/founder-draft`: scaffold `<date>-<slug>/drafts`, write
  `00-motion.md` then `drafts/01-founder.md` in that order, and commit each with a real
  pathspec-scoped `git add` + `git commit` in whatever repository contains `DATA_DIR`.
  The founder draft is refused unless the motion already exists, is non-empty, and is
  already committed; a motion or founder draft that exists on disk or in git history is
  never rewritten (409).

### Changed
- `DATA_DIR` is now read-write: `docker-compose.yml` drops the `:ro` mount suffix.
  "Never ship real private data in this repo" still applies; the read-only rationale no
  longer does. Writes are contained to `DATA_DIR` by the same `inside()` helper replay
  reads already use, and created with `O_EXCL` so a pre-placed symlink is never written
  through.
- The frontend proxy forwards `POST` to `/api/*` (static assets stay `GET`-only), and
  the page states plainly that a meeting sealed here stops at Phase 1 because live seat
  generation is not implemented in this build.

### Known limitations
- Two concurrent create-requests for the *same* meeting ID can race — the loser's
  rollback can delete the winner's file before its commit lands. Fails safely (both
  requests are rejected, the repository is left clean, nothing corrupts) but with a
  confusing error. The UI's synchronous button-disable prevents a normal single click
  from reaching this window; it needs two truly concurrent requests. See
  `docs/dev-process.md`'s 2026-09-19 orchestrator-verification entry for how this was
  reproduced and why it isn't fixed yet.

## [0.2.0] - 2026-09-19

### Added
- Replay table of contents (per-phase and per-seat jump targets), a drag-to-seek
  timeline slider with phase tick marks, next-phase/next-speaker skip buttons, and a
  speed control that's now changeable mid-playback (fast-forward).
- Backend: stable per-event index, `toc`/`totalEvents` metadata, and a `from=<event
  index>` SSE param that fast-flushes skipped events before resuming normal pacing.

### Fixed
- Parser now tolerates real-world frontmatter shapes (a free-text provenance-note
  paragraph inside the frontmatter delimiters) instead of failing to parse them; a
  malformed `seats/*.md` roster file is now skipped instead of failing every meeting
  in the listing. Verified directly against real `corporate-strategy` board data.
- GitHub Pages now always deploys the landing page, never the raw (backend-less) app
  shell.

## [0.1.0] - 2026-09-19

### Added
- Replay-only Node.js backend: generic meeting parser, REST metadata, timed SSE,
  recorded seat identity, draft positions, vote extraction, and read-only path containment.
- Plain Canvas office with six labeled seats, distinct human founder, progressive speech,
  Phase 4 vote gestures, separate non-binding clerk minutes, transcript, and satire flavor.
- One wholly synthetic test recording under `backend/test-fixtures/synthetic-demo/`;
  the reserved `demo-data/` directory remains untouched.
- Backend/frontend package scripts, lockfiles, tests, Dockerfiles compatible with existing
  Compose ports and environment, and exact local setup/API documentation.

### Changed
- CI and Pages use Node.js 22 to match application containers.
- Project documentation distinguishes implemented replay from planned live features and
  documents the narrower milestone's deferred sound, avatars, and public demo.

### Previously scaffolded
- Initial repo scaffold: README, CONTRIBUTING, CLAUDE.md, LICENSE (MIT), design spec
  (`docs/spec.md`), CI/Pages/release workflow skeletons, PR template, docker-compose
  skeleton, directory layout (`frontend/`, `backend/`, `demo-data/`, `docs/`).
