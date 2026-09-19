# Corporate-Simulator — Design Spec

**Name:** Corporate-Simulator (`Spillers-Technology/Corporate-Simulator`, public) —
**not final.** "Synergy Engine" is on the table too; Joey hasn't decided. Keep the repo
name, package names, and code identifiers as `corporate-simulator` for now (renaming a
GitHub repo/package after the fact is cheap; don't block on this), but don't hardcode
the display name deep into UI copy in a way that's annoying to change later — pull it
from one config constant.

**One-line pitch:** A 2D animated office where a six-seat simulated board actually walks
to their desks, argues in a meeting room, and votes — rendered live as a board-style
adversarial-review process runs, streamed token-by-token so the animation plays out in
real time instead of waiting on a wall of finished text.

**Status:** Founder-authorized as a new product, 2026-09-19 (founder discretion, not a
formal `CALL BOARD REVIEW` — see `corporate-strategy/decisions/DECISION_LOG.md` D-0049
for the logged rationale). Worth noting for the fun of it: standing up a new product is
itself one of `corporate-strategy/board/README.md`'s convening bars ("creates a new
product") — so this repo, once real, will likely end up rendering the exact kind of
process that authorized it. Delightful, not blocking anything.

**Clean separation, stated up front:** this repo is a **generic engine** for running and
visualizing board-style adversarial-review processes — it is not `corporate-strategy`
and does not contain `corporate-strategy`'s real, private data. It ships with:
1. A small **redacted demo dataset** (`demo-data/`) — cherry-picked and hand-redacted
   from a real `corporate-strategy` meeting, safe to publish and safe to appear in a
   public recording. Joey reviews and approves the redaction himself before it's
   committed; this is a judgment call about what's safe to make public, not something
   the engine or an agent decides unilaterally.
2. A **generic file-convention parser** (§5 below) that works against *any* directory
   following the same meeting-directory shape — so Joey's own private `corporate-strategy`
   checkout can point a locally-run instance at its real data without that data ever
   entering this public repo, and anyone self-hosting can point it at their own private
   process the same way. No sync mechanism is needed because there is no shared data
   store to sync — the public repo ships code and a demo fixture; real data stays wherever
   its owner keeps it, referenced by local path/mount only.

---

## 1. Why this is a smaller lift than it sounds

The board process is *already* a fully-specified simulation with a fixed cast, a scripted
phase sequence, and a persistent, machine-parseable save format — it's just been running
by hand, with a Claude Code orchestrator playing "game master." Nothing about the
underlying process needs to be invented for this; the app is a rendering + orchestration
layer over conventions that already exist and are already stable:

- **Fixed cast (6 seats + 1 clerk voice):** names, lenses, and models are all in
  `board/seats/0{1..6}-*.md`. This is the character roster, verbatim.
- **Fixed set (one office + one meeting room)** implied by the phase structure, not
  literally described anywhere — the app invents the physical layout.
- **A deterministic phase sequence** (`BOARD_PROCEDURE.md`'s six phases), each with a
  known artifact filename (`00-motion.md`, `drafts/0N-*.md`, `01-debate.md`,
  `02-vote.md`, `03-minutes.md`, `04-decision-record.md`) and a known format
  (`board/RULES.md` §6 for drafts, plus the vote/minutes/decision-record shapes visible
  in any past meeting directory, e.g. `board/meetings/2026-09-03-spoolsmith-new-product/`).
- **A working dispatch mechanism already proven twice** (this session): `codex exec`
  for seats 4/6, isolated Claude dispatch for seats 2/3/5. The web app's job is to run
  that same dispatch as real subprocesses instead of a human orchestrator doing it by
  hand, and to render the process instead of just committing files.

So "capture all the action and conventions" is mostly **parsing and re-running what
already exists**, not designing a new simulation.

## 2. What still needs Joey, live, and nothing else

Per `BOARD_PROCEDURE.md`'s own orchestrator constraints, three moments are irreducibly
human and always will be — the app should not try to automate these away, only make
them pleasant to do:

1. **Phase 0 — the motion.** Decision, cost, deadline, links. A form, not a chat — but
   free text in each field, since these are prose, not structured data.
2. **Phase 1 — the founder draft.** Same RULES.md §6 format every seat uses
   (POSITION/SUMMARY/ARGUMENT/COST I SEE/WHAT WOULD CHANGE MY MIND/PREDICTION). This is
   the one place the app could offer an *optional* "talk it through, I'll transcribe"
   assist mode (mirroring what happened live in this very session for DR-0005 and this
   meeting) — but it must be clearly labeled as transcription, never silently generated,
   and Joey must explicitly approve the final text before it's treated as sealed. Never
   auto-advance past this step.
3. **Phase 6 — the decision record.** After seeing the vote and dissent, Joey writes
   what actually gets decided, including overriding the vote if he wants to. Same
   transcription-assist option, same explicit-approval requirement.

Everything else (Phase 2 drafts, Phase 3 debate, Phase 4 vote, Phase 5 minutes) is
mechanically re-runnable via subprocess dispatch, exactly as this session just did it by
hand for seats 2–6.

## 2a. Live-generation mode needs read-write, not read-only

Confirmed with Joey (2026-09-19): pointing the app at an existing real data folder isn't
just for reading history — a finished live meeting should **write back into that same
folder, in its existing shape**, so the *next* meeting benefits from it. This is not new
behavior to invent; it's `BOARD_PROCEDURE.md`'s own Phase 6/7 mechanics, which this
repo's replay-only MVP intentionally doesn't need yet (it only ever reads *already
finished* meetings):

- A new live meeting creates a new `<date>-<slug>/` directory in the same shape replay
  mode already parses (§5) — motion, sealed founder draft, per-seat drafts, debate,
  vote, minutes, decision record.
- Phase 6/7 folds materially-changed beliefs back into each simulated seat's own
  `seats/0N-*.md` dossier file (predictions, belief-confidence updates) — the same file
  replay mode already reads *from* (§5's "optional board roster overlay") now also gets
  written *to*.
- A resolved/new prediction appends to a predictions ledger file, same convention as
  `board/ledger/predictions.md`.

**Consequence for the data mount:** `docker-compose.yml`'s current `DATA_DIR` mount is
`:ro` (read-only) because replay-only mode never needs to write. Live-generation mode
changes that to a read-write mount — worth flagging loudly in whatever UI/setup flow
introduces live mode for the first time (a self-hoster pointing this at their *real*
process should understand the app will now create/modify files there, not just read
them), and worth a real test for the same containment logic §4's Authentication note
and this repo's own path-safety discipline already care about (writes need the same
"stays inside DATA_DIR" guarantee reads already enforce — see `backend/src/parser.js`'s
`inside()` helper from the replay-mode implementation, which the write path should reuse
rather than re-derive).

## 3. Recommended stack

**Frontend:** Plain HTML5 Canvas (or a light 2D lib like Kaboom.js/Phaser if astra wants
sprite/animation helpers — optional, not required at this scale), vanilla JS or a small
framework if astra prefers. **Not three.js** — six characters and one room don't need a
camera, lighting, or a Z-axis; 2D top-down (think old RPG-Maker office) matches "cute
little people who walk around" exactly and is dramatically cheaper to build and animate
(sprite + speech bubble + a walk-to-point tween is the entire animation vocabulary
needed).

**Backend:** Whatever astra is fastest in (Node is a natural fit for streaming +
websockets, but this genuinely doesn't matter much). Its two jobs:
- **File layer:** read/write `corporate-strategy`'s actual meeting directories. This is
  the persistence layer — no new database needed for v1. A meeting *is* a directory;
  "loading a save" is `git log`/reading files that already exist.
- **Process layer:** shell out to `claude -p` (headless Claude Code, streaming JSON
  output, authenticated via the logged-in CLI session — subscription-based, not raw API
  billing, per Joey's stated preference) for seats 2/3/5, and `codex exec -m gpt-6-astra`
  for seats 4/6 — mirroring `board/bin/convene.sh`'s existing isolation split exactly
  (cross-model requirement for Seat 6 preserved). **Astra should verify exact current
  CLI flags against `claude --help` / `codex exec --help` at implementation time rather
  than trusting this spec's flag names as gospel** — same evidence discipline this repo
  already holds itself to.
- **Streaming bridge:** forward each subprocess's token stream to the frontend over a
  websocket/SSE as it arrives, so "the animation shows the text being generated" is
  literally true, not simulated.

**Replay mode (cheap, high value):** every past meeting already exists as finished
files. A "watch the recording" mode that plays back an already-completed meeting at
reading speed (no live subprocess needed) should be the actual MVP milestone — it
proves the whole rendering pipeline using zero new LLM calls and zero risk of breaking
the real board process, before live-generation mode is attempted at all.

## 4. Model configuration console (the actually important part)

Adversarial review only works if the isolation is real *and* the models are genuinely
different from each other — RULES.md §0's "isolation preserves variance" formula
depends on variance existing to be preserved. Right now that roster is hardcoded across
several files (`board/README.md`'s seat table, `BOARD_PROCEDURE.md`, `convene.sh`'s
comments, each seat dossier's `model:` line) — and we know firsthand how much that
costs to change, because we just did it today: D-0047 (sol → astra) was six manual file
edits plus a decision-log entry, for what is conceptually a one-line config change. The
app's whole value-add is making that a dropdown instead of a grep.

**What's configurable, and what isn't:**

- **Per-seat model assignment**, exposed as a simple table in an admin/config page: seat
  name → which CLI/tool → which model → invocation mode (subprocess CLI vs. hosted
  API, if ever needed). Seats 2/3/5 default to Claude Code CLI today only because that's
  what's available in-session right now — nothing in RULES.md actually requires them to
  be Claude specifically. Make all five simulated seats' model assignments editable.
- **Orchestration model** — separately selectable from the seats. This is the "game
  master": runs the phase state machine, validates seal-check before unsealing, drives
  the Phase 5 clerk pass. Also swappable (could itself be a Claude Code CLI instance
  managing the process semi-autonomously, the way a live Claude Code session plays that
  role today — or could be reduced to plain deterministic backend code with no model at
  all for the mechanical parts, using a model only for the clerk-minutes text
  generation specifically).
- **Hard constraints the console must enforce, not just suggest:** Seat 6 is
  "non-Anthropic, always" per `board/README.md`'s seat table — mandatory, not a
  preference, because Seat 6 exists specifically to not be homogeneous with the rest.
  The config UI should refuse (or at minimum hard-warn, red, not a gentle tooltip) an
  assignment that puts an Anthropic model in Seat 6.
- **Soft defaults the console should suggest but allow overriding:** Seat 4 is
  "suggested non-Anthropic" per the same table — a recommendation, not a rule. Default
  the dropdown to a non-Anthropic option but don't block a different choice.
- **A variance warning, not a hard block:** if the resulting roster ends up
  low-diversity (e.g., all five simulated seats on the same vendor), surface that
  plainly — "this meeting's isolation won't produce much real variance" — same honesty
  norm as everything else in this repo, rather than silently letting it happen.
- **Whatever's selected gets written into each draft's own header** (`model:` line,
  already part of the existing convention) so the roster used for *that specific
  meeting* is part of the permanent record, not just a global setting that drifts
  silently later — a meeting from six months ago should still show, honestly, which
  models actually argued that day, the same way `board/meetings/*/drafts/*.md` headers
  already do.

**Practical model-slot options to list in the config UI** (astra should treat this as a
starting menu, not a final list — verify what's actually invocable via CLI at
implementation time): Claude (via `claude -p`, several model tiers), Codex/astra (via
`codex exec -m <model>`), and whatever other CLI-invocable models Joey has configured
locally (e.g. if a Gemini CLI or similar becomes available) — the console's job is to
enumerate *actually locally invocable* options, not a hardcoded static list, so it stays
honest as new models/CLIs get added the way astra itself just did.

**Authentication (why this is its own admin-console requirement, not an afterthought.)**
The whole point of shelling out to `claude`/`codex` instead of calling a hosted API
directly is subscription-based, account-authenticated usage instead of per-token API
billing — that only works if each CLI is actually logged in as *this operator*, and a
self-hosted instance run by someone else needs *their* login, never Joey's. So the admin
console needs real sign-in flows, not a shared credential baked into the container:
- **Sign in to Claude Code:** trigger the CLI's own login flow (`claude` has an
  interactive OAuth login; verify the exact non-interactive/scriptable form at
  implementation time — e.g. a device-code flow the console can surface as "open this
  URL and approve") from inside the admin page, and show connection status (logged in
  as whom, token/session freshness) rather than assuming success silently.
- **Sign in to Codex:** same shape, `codex login` (or whatever its current auth
  subcommand is) triggered from the same console, same honest status display.
- **Never store raw long-lived tokens in the app's own database if the CLI already
  manages its own credential storage** — defer to each CLI's native auth state
  (typically a config file under the invoking user's home directory) rather than
  re-implementing credential storage and creating a second place secrets can leak from.
  If the app runs inside Docker (§ below), the CLI's credential directory needs to be a
  mounted volume, persisted across container restarts, scoped per self-hosted instance —
  not baked into an image layer.
- This is exactly the kind of thing STD-006 (secret handling) already exists to keep
  honest elsewhere in the portfolio — treat CLI auth state with the same care.

## 5. Data model (parsing layer)

Nothing new to invent; parse what's already there:

- `board/seats/0{2..6}-*.md` frontmatter (`seat`, `name`, `lens`, `model`) → character
  roster + portrait/label.
- A meeting dir's presence of `00-motion.md` / `drafts/*.md` / `01-debate.md` /
  `02-vote.md` / `03-minutes.md` / `04-decision-record.md` → current phase (whichever
  files exist so far *is* the state machine's position).
- Each draft's frontmatter (`seat`, `model`, `context`, `generated`) → who's "talking,"
  which desk they walk to, timestamp for sequencing in replay mode.
- `board/bin/seal-check.sh`'s pass/fail → whether Phase 2 is legitimately closed (the
  app should call this script for real before allowing a "Phase 3" transition, not
  reimplement its checks).
- `POSITION` line of each draft → the little floating icon over a character's head
  (support / oppose / support-with-conditions / abstain) so you can read the room at a
  glance before reading a word.

## 6. Animation vocabulary (minimum viable set)

- **Idle-at-desk:** default state, seat's character sits at their own desk.
- **Walk-to-meeting-room:** triggered when that seat's Phase 2 dispatch is kicked off.
- **Speaking + streamed speech bubble:** text fills in live as the subprocess streams
  tokens; bubble shows the RULES.md §6 section currently being written
  (POSITION/SUMMARY/etc. as sub-headers inside the bubble, or one bubble per section —
  astra's call).
- **Vote gesture:** a simple show-of-hands/color-coded token per seat at Phase 4.
- **Clerk pass:** a distinct "narrator" bubble at Phase 5 (minutes), visually separate
  from the six seats since RULES.md is explicit minutes are non-binding and never
  evidence.
- **Founder-seat rendering:** Joey's own seat should look different from the simulated
  five — not a "director" sprite, something that reads as "the actual player," since
  `board/seats/01-founder.md` is explicit that seat isn't simulated.

## 6a. Flavor & tone

This is deliberately corporate-satire-flavored, not a neutral utility. Loading states,
idle moments, and transitions are where the personality lives — think workplace-sitcom
buzzword soup ("synergizing stakeholder alignment...", "circling back on
actionables...", "leveraging cross-functional bandwidth...") rather than a generic
spinner. Concretely:
- **Loading/transition animations** get a rotating line of corporate-buzzword flavor
  text, not a bare progress bar — e.g. while a seat's draft is streaming in, a small
  "Renata is synergizing..." label alongside the speech bubble.
- **Idle ambient banter** at desks between phases (a character occasionally emits a
  throwaway buzzword-soup line via a small speech bubble, unrelated to the actual
  motion) — cheap to write (a static flavor-text pool per character personality is
  enough for v1), high delight-per-line-of-code.
- Keep it affectionate workplace satire, not mean-spirited — the target is "we've all
  sat through this meeting," not punching down at anyone real.

## 6b. Persona avatars — South Park-style cutout animation

**The animation technique itself:** yes, do this — a static head/face image composited
onto a simple 2D-animated cutout body (limbs as separate flat pieces that rotate/tween
around joints, à la South Park's construction-paper style) is cheap to build, easy to
swap heads on, and reads as charming rather than uncanny at this art scale. Good fit for
a canvas-based 2D renderer already committed to in §3.

**The one real caution, worth stating plainly rather than skipping past:** if a seat's
dossier is explicitly modeled on a named real person's published work (this repo's
board process already has one such seat — Security/Seat 3 draws on a Troy-Hunt-inspired
lens, and `board/RULES.md` §1 is explicit that "your name and career are invented" and
"do not speak as a real human, claim their endorsement, or attribute invented quotes to
them"). A text disclaimer carries that boundary today. **A photoreal face of an actual
identifiable person, animated and voicing invented dialogue, is a meaningfully bigger
step than a text disclaimer** — it visually reads as "this real person said this,"
regardless of a caption underneath saying otherwise. Recommendation: keep every seat's
avatar an invented or clearly-stylized/cartoonish face — never a real photo of a real
identifiable person — even for a seat whose *lens* draws on someone real's published
work. The founder seat (Joey's own, unsimulated) is the one place a real photo is
actually fine, since that seat is explicitly him, not a character voicing invented
opinions.

## 6c. Text-to-speech

Stretch goal, explicitly **not V1.** Note it here so it's not forgotten, not so it gets
built early — the streamed-text speech bubble is the whole MVP experience; voice is a
later layer once that's solid, and CC0-licensed TTS voices are their own sourcing
question (same discipline as §8's sound sourcing) to solve later, not now.

## 7. Phasing (rough, not a commitment)

1. **MVP — replay-only.** Point it at an existing meeting directory
   (`2026-09-19-spoolsmith-commercial-pilot` is a good test fixture, six real seats,
   real disagreement), render it end-to-end at reading speed. No live subprocess calls.
   Proves the rendering pipeline.
2. **Live Phase 2 generation.** Wire real `claude -p` / `codex exec` dispatch for a new
   motion, streaming into the same renderer. This is the actual hard part (process
   management, streaming, error handling when a seat's output is malformed).
3. **Human-input UI.** Forms for Phase 0/1/6, with the optional transcribe-assist mode,
   wired to actually commit files the same way this session did by hand (git add +
   commit, same messages-as-documentation convention this repo already uses).
4. **Polish:** office layout, character art, sound-off-vote reveal animation, whatever
   makes it delightful. This is the part that's actually just "make it cute," and is
   the part Joey will have the most fun art-directing.

## 8. Sound

Wanted, and it's going on YouTube — so **CC0 (public domain) only**, no CC-BY, no
"free for personal use," nothing needing attribution or a license check per-clip.
CC-BY is legally fine *with* attribution, but attribution-per-sound-effect across a
recording is exactly the kind of bookkeeping that gets skipped under deadline and turns
into a YouTube claim later. Simpler to just not carry that risk at all.

**Sourcing, safest first:**
- **Kenney.nl** — the actual right answer. Every asset (including several dedicated UI
  Audio / RPG audio packs) is explicitly CC0, zero attribution, and it's *made* for
  exactly this genre of 2D top-down sim — footsteps, UI blips, notification dings are
  all already there as matched sets rather than scavenged one-by-one.
- **Freesound.org**, filtered to CC0 only (it hosts a mix of licenses — the search UI
  lets you filter by license; do not take anything off this site without confirming
  CC0 specifically, since CC-BY and CC-BY-NC both show up in the same search results).
- **Pixabay Audio** — free license, no attribution required; good fallback for anything
  Kenney's packs don't cover (ambient office room tone, a longer "meeting adjourned"
  cue).
- Avoid Zapsplat and most "royalty-free" commercial libraries by default — most require
  either attribution or an account/subscription tier for commercial/monetized use,
  which a YouTube upload counts as.

**Vocabulary to source (minimum set):** footstep loop (walk-to-meeting-room), a soft
"typing/writing" texture during streamed-speech-bubble generation, a distinct chime for
vote-reveal, a separate/quieter chime for the clerk's minutes pass (per §6, it should
feel structurally different from a seat speaking), and one ambient office-room-tone bed
if the ambiance is wanted.

**Process note for whoever (astra) actually pulls the files:** keep a
`assets/audio/CREDITS.md` or `LICENSES.md` manifest listing each sound's exact source
URL and license even though CC0 needs no attribution — cheap insurance for "prove this
was actually CC0" if a YouTube Content ID system ever flags something incorrectly.

## 9. Decided

- **Product name:** Corporate-Simulator. Decided.
- **Own repo, public, with GitHub Pages:** decided. Clean separation from
  `corporate-strategy` per the note at the top of this document.
- **Stack:** 2D canvas, not three.js. Decided.
- **Replay-mode fixture coverage for v1:** one redacted fixture is enough
  (`demo-data/`) — don't block the MVP on redacting all five historical meetings.
  Real self-hosted instances point at their own full history via local path anyway.
- **Sound:** discrete CC0 SFX cues for v1 (§8); an ambient bed is an easy later add,
  not a blocker.

## 10. Open questions for Joey before real handoff

- Exact redaction pass on the demo fixture — Joey reviews/approves before it's
  committed (see the clean-separation note at the top); not an agent judgment call.
- Whether the admin console's model roster needs to support *anonymous/demo* mode (no
  sign-in at all, using only the bundled demo dataset in replay mode) as a distinct,
  first-run experience — recommended yes, so `Corporate-Simulator`'s public GitHub Pages
  demo works for a visitor with zero setup, and live-generation mode is clearly gated
  behind "run this yourself and sign in."
