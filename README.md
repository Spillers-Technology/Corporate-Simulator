# Corporate-Simulator

A tiny animated office where a fixed cast of simulated board members argue over your
decisions — for real. Corporate-Simulator is a self-hostable engine that runs and
visualizes a **board-style adversarial-review process**: isolated reviewers, each on a
genuinely different model, draft independent positions on a motion you write, debate
once, vote, and hand you back a decision record. It renders that process as a 2D
top-down office — characters walk to their desks, argue in a meeting room, and vote —
streamed live, token by token, as the actual model output is generated.

This project exists because [Spillers Technology](https://github.com/Spillers-Technology)
runs exactly this process by hand, for real business decisions, in a private repo
(`corporate-strategy`). Corporate-Simulator is the generic, public engine underneath
that — with a small, hand-redacted demo dataset so you can watch a real session play out
without any private data ever touching this repo. See **[Clean separation](#clean-separation)** below.

**Status:** early scaffold. Design spec is written (`docs/spec.md`); implementation is
in progress. The GitHub Pages site currently shows the demo, not live-generation mode —
check `docs/spec.md`'s phasing section for what's actually built vs. planned.

## Why this exists

Adversarial review only works if the isolation is real and the reviewers are genuinely
different from each other — a panel of five copies of the same model agreeing with each
other isn't review, it's an echo chamber with extra steps. Corporate-Simulator makes
that isolation and that model-diversity requirement a first-class, visible part of the
product: an admin console lets you pick which model plays which seat, enforces that at
least one seat is never the same vendor as the rest, and records exactly which models
argued in every session's own permanent output — not a global setting that quietly
drifts over time.

## How it works, briefly

1. You write a **motion** — a decision, its cost, a deadline, links to anything it
   touches. Free text, your own words.
2. You write a **founder position** on it, sealed and committed before anything else
   runs — this is what stops the simulated board from anchoring your own judgment.
3. Five isolated reviewer seats — each dispatched as a genuinely separate process, no
   shared context, on whichever models you've configured — draft independent positions.
4. One debate round, all six positions visible to each other. Then a vote, with dissent
   recorded in full, never summarized.
5. You write the actual decision — the board advises, you decide, including overriding
   the vote if you want to, with the override recorded plainly.

Full process detail, the model-configuration console's rules, animation/sound design,
and the file conventions each meeting is persisted in: **[`docs/spec.md`](docs/spec.md)**.

## Clean separation

This repo ships:
- **Generic code** — a parser and renderer for *any* directory following the
  established meeting-folder convention (motion, sealed founder draft, per-seat drafts,
  debate, vote, minutes, decision record).
- **One small, hand-redacted demo dataset** (`demo-data/`) — cherry-picked and
  human-reviewed for public safety before it was ever committed.

It does **not** ship, sync with, or depend on `corporate-strategy`'s real, private data.
Running your own real process means pointing a locally-run instance at your own data
directory — nothing about that setup touches this public repo or its GitHub Pages
deployment.

## Self-hosting

```bash
git clone https://github.com/Spillers-Technology/Corporate-Simulator.git
cd Corporate-Simulator
docker compose up
```

See `docker-compose.yml` for the service layout (frontend, backend, and a mounted
volume for your own data directory + each CLI's own auth/credential state). The admin
console handles signing in to Claude Code and Codex on first run — see `docs/spec.md`'s
Authentication subsection for why this defers to each CLI's own login flow rather than
asking for a raw API key.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT — see [`LICENSE`](LICENSE).
