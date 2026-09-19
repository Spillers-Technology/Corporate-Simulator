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
unbuffered SSE. The browser uses same-origin requests; it never needs to
resolve Docker's internal `backend` hostname.

```bash
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend test
```

`dist/` contains static assets compatible with the existing Pages build, but
replay requires the backend/proxy. A static Pages deployment alone shows an
honest backend-unavailable message; this milestone does not publish a recording
or copy any mounted data into the static build. No live generation, model
console, CLI sign-in, avatar assets, or sound is implemented.
