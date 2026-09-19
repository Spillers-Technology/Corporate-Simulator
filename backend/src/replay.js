import { setTimeout as delay } from 'node:timers/promises';
import { passages } from './parser.js';

export function* recording(meeting) {
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

export async function streamReplay(response, meeting, { speed = 1, signal, tickMs = 250 } = {}) {
  let id = 0;
  for (const event of recording(meeting)) {
    if (signal.aborted || response.destroyed) return;
    const ready = response.write(`id: ${++id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    if (!ready) {
      await new Promise(resolve => {
        const finish = () => {
          response.off('drain', finish); response.off('close', finish); resolve();
        };
        response.once('drain', finish); response.once('close', finish);
      });
    }
    const wait = event.type === 'text' ? tickMs : ['phase', 'speech-end', 'vote'].includes(event.type) ? tickMs * 3 : 0;
    if (wait) {
      try { await delay(wait / speed, undefined, { signal }); }
      catch (error) { if (error.name === 'AbortError') return; throw error; }
    }
  }
  response.end();
}
