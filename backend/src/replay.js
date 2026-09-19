import { setTimeout as delay } from 'node:timers/promises';
import { passages } from './parser.js';

function* sequence(meeting) {
  const { drafts, seats, artifacts, votes } = meeting;
  const ordered = drafts.filter(draft => draft.seat !== 1).toSorted((a, b) => {
    return (a.generated ? Date.parse(a.generated) : Infinity) -
      (b.generated ? Date.parse(b.generated) : Infinity) || a.seat - b.seat;
  });
  const phases = [
    [0, 'Motion', [{ seat: 1, text: artifacts['00-motion.md'] }]],
    [1, 'Founder draft', [drafts.find(draft => draft.seat === 1)]],
    [2, 'Independent drafts', ordered],
    [3, 'Debate', passages(artifacts['01-debate.md'], seats)],
    [4, 'Vote', [{ seat: null, text: artifacts['02-vote.md'] }]],
    [5, 'Clerk minutes · non-binding, never evidence', [{ seat: null, text: artifacts['03-minutes.md'] }]],
    [6, 'Founder decision record', [{ seat: 1, text: artifacts['04-decision-record.md'] }]]
  ];
  for (const [phase, label, blocks] of phases) {
    yield { type: 'phase', phase, label };
    if (phase === 4) yield { type: 'vote', phase, votes };
    for (const block of blocks) {
      const voice = phase === 5 ? 'clerk' : block.seat ? 'seat' : 'narrator';
      yield { type: 'speech-start', phase, seat: block.seat, voice, position: block.position ?? null };
      for (const text of block.text.match(/\S+\s*|\s+/g) ?? []) yield { type: 'text', phase, seat: block.seat, voice, text };
      yield { type: 'speech-end', phase, seat: block.seat, voice };
    }
  }
  yield { type: 'complete' };
}

// The single source of truth for what gets streamed, now with a stable, monotonic
// event index starting at 0. Every navigation target (table of contents, timeline
// slider, skip buttons, `from=`) is expressed in these indexes, so a target can never
// drift from the stream it addresses: both come from this one generator.
export function* recording(meeting) {
  let index = 0;
  for (const event of sequence(meeting)) yield { index: index++, ...event };
}

// Pure: same recording, walked once, reduced to navigable seams. Phase 2 is the only
// phase with real sub-structure (five independent, unordered drafts), so its entry
// additionally carries per-seat start indexes.
export function navigation(meeting) {
  const toc = [];
  let totalEvents = 0;
  for (const event of recording(meeting)) {
    totalEvents = event.index + 1;
    if (event.type === 'phase') {
      toc.push({ phase: event.phase, label: event.label, startEvent: event.index, ...(event.phase === 2 ? { seats: [] } : {}) });
    }
    if (event.type === 'speech-start' && event.phase === 2) {
      const name = meeting.seats.find(seat => seat.seat === event.seat)?.name ?? `Seat ${event.seat}`;
      toc.find(entry => entry.phase === 2)?.seats.push({ seat: event.seat, name, startEvent: event.index });
    }
  }
  return { toc, totalEvents };
}

export async function streamReplay(response, meeting, { speed = 1, signal, tickMs = 250, from = 0 } = {}) {
  for (const event of recording(meeting)) {
    if (signal.aborted || response.destroyed) return;
    const ready = response.write(`id: ${event.index}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    if (!ready) {
      await new Promise(resolve => {
        const finish = () => {
          response.off('drain', finish); response.off('close', finish); resolve();
        };
        response.once('drain', finish); response.once('close', finish);
      });
    }
    // Seeking is the same stream, time-compressed: everything before `from` is still
    // emitted in full so client state (transcript, tally, current speaker) builds up
    // exactly as a play-through would leave it — just with no delay at all.
    const paced = event.index >= from;
    const wait = !paced ? 0 : event.type === 'text' ? tickMs : ['phase', 'speech-end', 'vote'].includes(event.type) ? tickMs * 3 : 0;
    if (wait) {
      try { await delay(wait / speed, undefined, { signal }); }
      catch (error) { if (error.name === 'AbortError') return; throw error; }
    }
  }
  response.end();
}
