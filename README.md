# Corporate-Simulator

A tiny animated office for watching board-style adversarial review. The replay MVP
reads a finished meeting directory and plays its motion, six independent positions,
debate, vote, clerk minutes, and founder decision at reading speed. A plain 2D Canvas
room shows the seats, speech, and votes as saved text arrives over SSE.

The longer-term product will run isolated reviewers and live model generation. Those
capabilities are not part of the current implementation.

This project exists because [Spillers Technology](https://github.com/Spillers-Technology)
runs exactly this process by hand, for real business decisions, in a private repo
(`corporate-strategy`). Corporate-Simulator is the generic, public engine underneath
that — with a future hand-redacted demo dataset planned so you can watch a real session play out
without any private data ever touching this repo. See **[Clean separation](#clean-separation)** below.

**Status:** replay, plus the two human-authored phases of a new meeting. The backend
reads completed meeting files and streams recorded text to a 2D Canvas office; a "New
meeting" mode writes and commits Phase 0 (the motion) and Phase 1 (the founder draft)
into the mounted data directory, staged behind an explicit **Seal & Commit** and sealed
against re-editing afterwards. Live seat generation (Phase 2 onward), model
configuration, and CLI sign-in are planned, not implemented — a meeting sealed here
stops at Phase 1 and the UI says so. The synthetic local test recording
lives in `backend/test-fixtures/synthetic-demo/`; `demo-data/` remains reserved for
Joey's future approved redaction. Static GitHub Pages alone cannot run the replay API.

## Why this exists

Adversarial review only works if the isolation is real and the reviewers are genuinely
different from each other — a panel of five copies of the same model agreeing with each
other isn't review, it's an echo chamber with extra steps. Corporate-Simulator makes
that isolation and that model-diversity requirement a first-class, visible part of the
product: the planned admin console will let you pick which model plays which seat, enforce that at
least one seat is never the same vendor as the rest, and record exactly which models
argued in every session's own permanent output — not a global setting that quietly
drifts over time.

## Planned full process

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
- **A reserved demo directory** (`demo-data/`) — no real recording is populated yet;
  any future redaction requires Joey’s review and approval. The separate test fixture
  under `backend/test-fixtures/` is entirely synthetic.

It does **not** ship, sync with, or depend on `corporate-strategy`'s real, private data.
Running your own real process means pointing a locally-run instance at your own data
directory — nothing about that setup touches this public repo or its GitHub Pages
deployment.

## Self-hosting

Run the synthetic recording locally with Docker Compose (from the repo root):

```bash
DATA_DIR=./backend/test-fixtures docker compose up --build
```

Open http://localhost:3000 and click **Play recording**. Plain `docker compose up`
uses the untouched `demo-data/` directory and correctly shows no complete recordings.
For your own local data, set `DATA_DIR` to an absolute path to a meeting, collection,
or board directory with `meetings/` and optional `seats/`. The mount is read-write as
of the Phase 0/1 human-input forms: replay never writes, but sealing a motion or
founder draft creates a `<date>-<slug>/` directory there and runs a real `git add` +
`git commit` in the repository containing it. Point it at your own process knowing
that. Existing CLI credential volumes in Compose are still unused — nothing here
dispatches a model yet.

Without Docker, use Node.js 22+ and two terminals from the repo root:

```bash
# Terminal 1
npm --prefix backend ci
DATA_DIR="$PWD/backend/test-fixtures" npm --prefix backend start
```

```bash
# Terminal 2
npm --prefix frontend ci
npm --prefix frontend run build
BACKEND_URL=http://localhost:4000 npm --prefix frontend start
```

Backend defaults to port 4000; frontend defaults to port 3000. See
[`backend/README.md`](backend/README.md) for the parser and REST/SSE contract, and
[`frontend/README.md`](frontend/README.md) for renderer behavior and development.

```bash
npm --prefix backend run lint && npm --prefix backend run build && npm --prefix backend test
npm --prefix frontend run lint && npm --prefix frontend run build && npm --prefix frontend test
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT — see [`LICENSE`](LICENSE).
