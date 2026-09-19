# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Replay table of contents (per-phase and per-seat jump targets), a drag-to-seek
  timeline slider with phase tick marks, next-phase/next-speaker skip buttons, and a
  speed control that's now changeable mid-playback (fast-forward).

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
