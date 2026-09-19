// Pure helpers over the server's table of contents. Every position here is an event
// index in the very stream being played, so "where am I" and "where do I want to be"
// are the same coordinate the server accepts as `from=`.

// The ordered list of addressable positions: every phase, plus Phase 2's five
// independent drafts — the only phase whose individual speakers the recording exposes
// a start index for. Outside Phase 2 a phase and its speaker begin together.
export function targets(toc) {
  const flat = [];
  for (const entry of toc) {
    flat.push({ kind: 'phase', phase: entry.phase, label: `Phase ${entry.phase} · ${entry.label}`, startEvent: entry.startEvent });
    for (const seat of entry.seats ?? []) {
      flat.push({ kind: 'seat', phase: entry.phase, seat: seat.seat, label: `Seat ${seat.seat} · ${seat.name}`, startEvent: seat.startEvent });
    }
  }
  return flat.toSorted((a, b) => a.startEvent - b.startEvent);
}
export function nextPhase(toc, index) {
  return targets(toc).find(target => target.kind === 'phase' && target.startEvent > index) ?? null;
}
export function nextSpeaker(toc, index) {
  return targets(toc).find(target => target.startEvent > index) ?? null;
}
export function currentTarget(toc, index) {
  return targets(toc).findLast(target => target.startEvent <= index) ?? null;
}
// Position on a 0..totalEvents slider, as a percentage, for tick placement.
export function offset(startEvent, totalEvents) {
  return totalEvents > 0 ? (Math.min(startEvent, totalEvents) / totalEvents) * 100 : 0;
}
