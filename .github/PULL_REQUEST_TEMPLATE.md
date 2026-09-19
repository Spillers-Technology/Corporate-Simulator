## What changed

<!-- What problem does this solve? What's the actual change? -->

## How it was checked

- [ ] CI is green (lint/build/test — see `.github/workflows/ci.yml`)
- [ ] Adversarially reviewed by a genuinely different model if the diff is non-trivial
      (e.g. `codex exec -m gpt-6-astra`), findings reproduced before accepting, logged
      in `docs/dev-process.md`
- [ ] Manually exercised locally (`docker compose up`) against the demo fixture
- [ ] If this touches the model-configuration console: the Seat-6-never-Anthropic
      rejection path is covered by a real test, not just eyeballed

## Evidence

<!-- Logs, screenshots, or a short reproduction. -->

## Data safety

- [ ] All example data, screenshots, and fixtures in this PR are either synthetic or
      taken from the existing, already-approved `demo-data/` fixture — no real private
      `corporate-strategy` data, no real customer data, no unredacted personal
      information.
