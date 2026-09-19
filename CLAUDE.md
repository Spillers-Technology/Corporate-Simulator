# CLAUDE.md

## What this repo is

Corporate-Simulator: a generic, self-hostable engine for running and visualizing
board-style adversarial-review processes — a 2D animated office where a small
fixed-size cast of simulated reviewers walk to their desks, argue in a meeting room, and
vote, rendered live as the process runs. It is a standalone public product of Spillers
Technology, not a replacement for or a dependency of `corporate-strategy` (the private
institutional-memory repo whose own board process this project was inspired by and is
generic over).

Read `README.md` first. Then `docs/spec.md` — the design spec this repo was scaffolded
from; treat it as living documentation, not a frozen handoff artifact, and update it as
real implementation decisions supersede its guesses.

## Clean separation from `corporate-strategy` — the one rule that matters most here

This repo must never contain real, private `corporate-strategy` data. It ships:
- **Generic code** that parses *any* directory following the established meeting-folder
  convention (motion / sealed founder draft / per-seat drafts / debate / vote / minutes
  / decision record — see `docs/spec.md` §5).
- **One small, hand-redacted demo dataset** (`demo-data/`) that Joey personally reviewed
  and approved for public visibility before it was committed — never regenerate or
  expand this fixture from real data without that same human review step.

A real, private instance (Joey's own `corporate-strategy`, or anyone else's private
process) points a locally-run instance at its own data via local path/mount. That data
never enters this repository, this repo's git history, or any public deployment of it.
If you are ever asked to pull in more "real" data as a fixture, treat that the same way
`personas/sources/README.md` treats copyrighted source material in `corporate-strategy`
itself: a human redaction/approval gate, not something to automate around.

## Non-negotiable discipline (same spirit as `corporate-strategy`'s own CLAUDE.md)

- **Never fabricate a working feature.** If live-generation mode isn't actually wired up
  yet, the UI must say so, not fake it. Replay mode against the bundled demo fixture is
  a legitimate, honestly-labeled feature; a stubbed live mode pretending to stream real
  model output is not.
- **The model-configuration console's hard constraints are load-bearing, not
  decorative** (see `docs/spec.md` §4): Seat 6 must never be assignable to an Anthropic
  model — that's not a UI preference, it's the whole point of that seat existing. Enforce
  it in code, not just in a tooltip.
- **CLI authentication defers to each CLI's own credential storage** (`claude`/`codex`'s
  own login state) rather than the app re-implementing secret storage. See `docs/spec.md`
  §4's Authentication subsection and STD-006-style secret-handling discipline.
- **Every standard's `Check` states honestly whether it's enforced or just claimed** —
  same STD-*.md discipline `corporate-strategy` holds itself to. Don't claim a CI gate
  exists if it doesn't yet.

## Where things live (quick index)

| Path | What |
|---|---|
| `README.md` | Project overview, quickstart, self-hosting |
| `docs/spec.md` | Design spec — architecture, stack, model-config console, sound |
| `docs/dev-process.md` | Per-change implementation/review log, same convention as SpoolSmith |
| `demo-data/` | The one redacted, human-approved demo fixture — see the rule above |
| `frontend/` | 2D canvas renderer |
| `backend/` | File-layer parser + CLI process/streaming layer |
| `.github/workflows/` | CI, Pages deploy, release |

## Working in this repo

Standard PR flow: branch → PR (using `.github/PULL_REQUEST_TEMPLATE.md`) → CI green →
merge. Log implementation rounds in `docs/dev-process.md` the same way SpoolSmith does —
what was asked, what an adversarial review pass (astra) found, what got fixed, verified
independently rather than trusted on the reviewer's word alone.

**Once a change is verified and ready to ship, stand up the local instance for real,
overriding whatever's already running.** Joey wants to iterate against a live localhost
build without asking each time, per his own direction (2026-09-19). Concretely: kill any
already-running backend/frontend background processes from a prior round, rebuild
(`npm run build` where applicable), and restart both — backend on `:4000`, frontend on
`:3000` — pointed at his real `corporate-strategy/board` data
(`DATA_DIR=/var/home/jdspille/Documents/Github/spillers-technology/corporate-strategy/board`),
the same way it's been run each round so far. This is a standing expectation for "ready
to ship," not something to ask permission for each time — but still only after the
change has actually been independently verified (lint/build/test re-run, not just
trusted on the implementer's report), same bar as everything else in this file.
