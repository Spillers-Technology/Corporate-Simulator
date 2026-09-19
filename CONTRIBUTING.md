# Contributing

## Workflow

Branch → PR (using `.github/PULL_REQUEST_TEMPLATE.md`) → CI green → merge. Squash or
merge commit is fine; force-pushing a branch under active review is not.

Log implementation rounds in `docs/dev-process.md`: what was asked, what an adversarial
review pass found (this project practices what it visualizes — dispatch a genuinely
different model, e.g. `codex exec -m gpt-6-astra`, against your own diff before calling
it done), what got fixed, and how the fix was independently verified rather than
trusted on the reviewer's report alone.

## Local dev

```bash
docker compose up
```

See `docker-compose.yml`. Frontend and backend can also be run directly — see each
directory's own README once they exist (`frontend/`, `backend/`) — Docker is the
supported path, not the only one.

## Data safety (read this before touching `demo-data/`)

`demo-data/` is a single, hand-redacted fixture that a human (Joey) explicitly reviewed
and approved for public visibility. Do not regenerate, expand, or replace it from any
real `corporate-strategy` data — or any other real, private board process — without
that same human review-and-approval step happening again, explicitly, before anything
is committed. This repo is public, deploys to public GitHub Pages, and gets recorded
into videos that may be published — treat anything destined for `demo-data/` with that
audience in mind from the start, not as an afterthought.

Real, private data belongs in a locally-mounted directory a self-hosted instance points
at (see `docker-compose.yml`'s volume mounts) — never in this repository.

## Pull request checklist

Every PR uses `.github/PULL_REQUEST_TEMPLATE.md`, which requires:
- What changed and why.
- How it was checked (tests, manual verification, adversarial-review pass if the diff
  is non-trivial).
- Evidence (logs, screenshots, or a short reproduction).
- Confirmation that any example data, screenshots, or fixtures added are synthetic or
  from the approved `demo-data/` fixture — never real private data, real customer data,
  or unredacted personal information.

## Sound assets

CC0 (public domain) only — see `docs/spec.md` §8 for sourcing (Kenney.nl first,
Freesound.org filtered to CC0, Pixabay Audio as fallback) and why CC-BY is deliberately
avoided here (per-clip attribution bookkeeping is exactly the kind of thing that gets
skipped and turns into a YouTube claim later — simpler to just not carry that risk).
Every new audio asset gets an entry in `assets/audio/LICENSES.md` naming its source URL
and license, even though CC0 needs no attribution — cheap insurance if a Content ID
system ever flags something incorrectly.

## Model-configuration console changes

If you touch the seat/model-assignment logic (`docs/spec.md` §4), the hard constraint —
Seat 6 must never be assignable to an Anthropic model — needs a test that actually
exercises the rejection path, not just a manual check. This one isn't a style
preference; it's the mechanism the whole product exists to demonstrate.
