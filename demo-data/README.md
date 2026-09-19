# Demo data

This directory holds the **one** hand-redacted, human-approved demo fixture used by
replay mode (see `docs/spec.md` §7, MVP milestone) and the public GitHub Pages demo.

**Not populated yet.** Populating it means: cherry-picking one real meeting from
`corporate-strategy` (the 2026-09-19 SpoolSmith commercial-pilot meeting is a good
candidate — six real seats, real disagreement, nothing about it references anything
more sensitive than "the operator's MSP job" generically), redacting anything that
shouldn't be public, and getting Joey's explicit sign-off before it's committed here.
See `CONTRIBUTING.md`'s "Data safety" section and `CLAUDE.md`'s clean-separation rule —
this is a human judgment call, not something an agent should do unilaterally and commit
without that review step actually happening.

Expected shape once populated (mirrors a real `corporate-strategy/board/meetings/`
directory exactly, per `docs/spec.md` §5):

```
demo-data/
  <date>-<slug>/
    00-motion.md
    drafts/
      01-founder.md
      02-*.md ... 06-*.md
    01-debate.md
    02-vote.md
    03-minutes.md
    04-decision-record.md
```
