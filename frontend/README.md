# Canvas replay frontend

Requires Node.js 22+. Start the backend first, then from the repository root:

```bash
npm --prefix frontend ci
npm --prefix frontend run build
BACKEND_URL=http://localhost:4000 npm --prefix frontend start
```

Open http://localhost:3000. Select the synthetic recording, choose a reading
pace, and press **Play recording**. **Stop** disconnects the SSE stream; playing
again restarts the recording. Vote tokens appear in Phase 4; Phase 5 has a
separate purple clerk bubble labeled non-binding and never evidence. The gold
founder represents the human seat; the five blue seats are simulated reviewers.
The transcript preserves the entire recording even as the canvas bubble shows
only the latest lines. Draft section headings appear verbatim in the bubble.

For source-file development use `npm --prefix frontend run dev` instead of
building and starting. `PORT` defaults to `3000`. The Node server forwards
`/api/*` to runtime `BACKEND_URL` (default `http://localhost:4000`), including
unbuffered SSE and the two human-input `POST` routes. The browser uses
same-origin requests; it never needs to resolve Docker's internal `backend`
hostname. Static assets remain `GET`-only.

## New meeting mode (Phases 0 and 1)

The **New meeting** tab is human input, not simulation, and coexists with replay
rather than replacing it. Two forms — the motion (Decision / Cost / Deadline /
Links) and the founder draft (POSITION / SUMMARY / ARGUMENT / COST I SEE / WHAT
WOULD CHANGE MY MIND / PREDICTION) — each show a live preview of the exact
markdown that will be written.

Nothing reaches the backend or the data directory until **Seal & Commit** is
pressed. That one action writes the file and commits it with git. Afterwards the
fields become read-only, the commit button is removed, and the badge names what
was sealed: there is no re-edit affordance, because the board convention is to
supersede a record, not edit it. The founder form stays hidden until the motion
is sealed, since the motion must exist and be committed first.

Once both are sealed the page says plainly that the meeting is sealed through
Phase 1 and that live seat generation is not implemented in this build. No seat
dispatch, "processing" state, or progress indicator is shown, because none of it
is running.

```bash
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend test
```

`dist/` contains static assets compatible with the existing Pages build, but
replay requires the backend/proxy. A static Pages deployment alone shows an
honest backend-unavailable message; this milestone does not publish a recording
or copy any mounted data into the static build — and the New meeting tab needs
the backend too, so a static deployment cannot seal anything. No live seat
generation, model console, CLI sign-in, avatar assets, or sound is implemented.
