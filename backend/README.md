# Replay backend

Requires Node.js 22+. From the repository root:

```bash
npm --prefix backend ci
DATA_DIR="$PWD/backend/test-fixtures" npm --prefix backend start
```

The API listens on `PORT` (default `4000`). `DATA_DIR` is a read-only meeting
root: a single meeting directory, a collection of meeting directories, or a
board directory containing `meetings/` and optional `seats/` dossiers. With no
configuration it uses `../demo-data` relative to the working directory; that
reserved directory currently has no approved recording. No files are written.

```bash
curl http://localhost:4000/api/meetings
curl http://localhost:4000/api/meetings/synthetic-demo
curl -N 'http://localhost:4000/api/meetings/synthetic-demo/events?speed=1'
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix backend test
```

## File conventions

A finished recording requires nonempty `00-motion.md`, `01-debate.md`,
`02-vote.md`, `03-minutes.md`, `04-decision-record.md` and six `drafts/*.md`
files with YAML frontmatter. `seat` identifies one unique seat 1–6 (a number,
`02`, or `Seat 2 — label`). Frontmatter `model`, `context`, and `generated`
are preserved; `name` is an optional label. Optional root `seats/*.md` files
supply `seat`, `name`, and `lens`. Historical draft models take precedence over
current roster models. Without a name the UI uses `Seat N`.

The founder draft is Phase 1. Other drafts are Phase 2, ordered by valid
`generated` timestamps, then seat number for ties; missing/invalid timestamps
come last in seat order. Draft `POSITION:` lines or `## POSITION` sections
recognize support, oppose, support-with-conditions, and abstain.

The spec does not prescribe the body syntax of debate and vote files. Replay
recognizes debate headings such as `## Seat 2 — label` or `## Exact Seat Name`.
Unrecognized headings/text remain unattributed meeting narration. Vote tables
use `| Seat | Vote | ... |`; alternatively a seat heading followed by a
`VOTE:` or `POSITION:` line is accepted. Unrecognized votes remain unmarked;
the complete original vote text still streams. Markdown is displayed as text,
never rendered as HTML. Each artifact is limited to 1 MiB.

Only complete recordings are listed; incomplete/invalid subdirectories are
reported in `skipped`. IDs are directory basenames containing letters, numbers,
underscores or hyphens; `_root` addresses a directly mounted meeting. Symlinks
that resolve outside `DATA_DIR` and traversal IDs are rejected.

## REST / SSE contract

- `GET /api/health`: service status and `mode: replay`.
- `GET /api/meetings`: `{ meetings: [{ id, title }], skipped: [{ id, reason }] }`.
- `GET /api/meetings/:id`: recording metadata and six seats.
- `GET /api/meetings/:id/events?speed=1`: fresh independent replay stream.

SSE event names and JSON `type` agree: `phase`, `speech-start`, `text`,
`speech-end`, `vote`, `complete`. Speech events identify `phase`, `seat` (1–6
or null), and `voice` (`seat`, `narrator`, `clerk`). Text events contain an
incremental `text` chunk, including whitespace. A vote event contains a map
of recognized seat numbers to votes. Minutes always have the separate clerk
voice and are labeled non-binding, never evidence. Phase 0 and 6 recordings
are attributed to the founder; this does not generate or approve human input.

Default pace is roughly 240 words/minute plus short phase/speaker pauses.
`speed` is 0.5–4. Disconnecting cancels playback; there is no resume cursor.
Clients must close on `complete` or error to prevent EventSource's automatic
reconnect from starting over. Streams respect network backpressure. No model
calls, shell dispatch, seal-check execution, authentication, or write API exist.
The mounted directory is made available to users who can access this local
service; it is not a public authenticated hosting service.
