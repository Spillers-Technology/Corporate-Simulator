import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export class MeetingError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}

// Resolve every read, including artifacts and roster files, inside the mounted root.
export async function inside(root, candidate) {
  const base = await realpath(root);
  const resolved = await realpath(candidate);
  const relative = path.relative(base, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new MeetingError('Path is outside DATA_DIR.', 400);
  }
  return resolved;
}

async function read(root, file) {
  const resolved = await inside(root, file);
  if ((await stat(resolved)).size > 1024 * 1024) throw new MeetingError('Artifact exceeds 1 MiB.');
  return (await readFile(resolved, 'utf8')).replace(/\r\n/g, '\n');
}
async function exists(file) {
  try { return (await stat(file)).isFile(); } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
export function frontmatter(text) {
  const match = text.match(/^\uFEFF?---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new MeetingError('Draft or roster file needs YAML frontmatter.');
  let data;
  try { data = parseYaml(match[1], { maxAliasCount: 10 }); }
  catch { throw new MeetingError('Invalid YAML frontmatter.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new MeetingError('Frontmatter must be a mapping.');
  return { data, text: text.slice(match[0].length).trim() };
}
export function seatNumber(value) {
  const match = String(value ?? '').match(/^(?:seat\s*)?0?([1-6])(?:\s*(?:[—–:-].*)?|\s+.+)?$/i);
  return match ? Number(match[1]) : null;
}
export function position(value) {
  const clean = String(value).replace(/[*_]/g, '').trim().toLowerCase();
  if (/^(support[- ]with[- ]conditions|conditional support)\b/.test(clean)) return 'support-with-conditions';
  if (/^(support|oppose|abstain)\b/.test(clean)) return clean.match(/^(support|oppose|abstain)/)[1];
  return 'unknown';
}
function draftPosition(text) {
  const line = text.replace(/[*_]/g, '').match(/^(?:#{1,6}\s*)?POSITION\s*:?\s*(?:\n)?([^\n]+)/im);
  return line ? position(line[1]) : 'unknown';
}
function speaker(label, seats) {
  const number = /^(?:seat\s+|0?[1-6]$|0?[1-6]\s*[—–:-])/i.test(label.trim()) ? seatNumber(label.trim()) : null;
  if (number) return number;
  return seats.find(seat => seat.name.toLowerCase() === label.trim().toLowerCase())?.seat ?? null;
}

// Attribute only explicit seat/name headings; preserve everything else as narration.
export function passages(text, seats) {
  const result = [];
  let current = { seat: null, text: '' };
  let speakerDepth = Infinity;
  for (const line of text.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    const seat = heading ? speaker(heading[2], seats) : null;
    if (heading && (seat || heading[1].length <= speakerDepth)) {
      if (current.text) result.push({ ...current, text: current.text });
      current = { seat, text: '' };
      speakerDepth = seat ? heading[1].length : Infinity;
    }
    current.text += line + '\n';
  }
  // Remove only the synthetic newline introduced by split/join, preserving source text.
  current.text = current.text.slice(0, -1);
  if (current.text) result.push(current);
  return result;
}
export function votesFrom(text, seats) {
  const votes = {};
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map(cell => cell.replace(/[*_]/g, '').trim());
    const seat = speaker(cells[0] ?? '', seats);
    const vote = position(cells[1] ?? '');
    if (seat && vote !== 'unknown') votes[seat] = vote;
  }
  for (const block of passages(text, seats)) {
    if (!block.seat) continue;
    const match = block.text.replace(/[*_]/g, '').match(/^(?:VOTE|POSITION)\s*:\s*(.+)$/im);
    if (match && position(match[1]) !== 'unknown') votes[block.seat] = position(match[1]);
  }
  return votes;
}

export async function meetingLocation(root, id) {
  if (id === '_root') return inside(root, root);
  if (!/^[\w-]+$/.test(id)) throw new MeetingError('Invalid meeting ID.', 400);
  const base = await exists(path.join(root, '00-motion.md')) ? root :
    await stat(path.join(root, 'meetings')).then(s => s.isDirectory() ? path.join(root, 'meetings') : root).catch(e => {
      if (e.code === 'ENOENT') return root;
      throw e;
    });
  return inside(root, path.join(base, id));
}

export async function parseMeeting(root, id) {
  const directory = await meetingLocation(root, id);
  const artifacts = {};
  for (const file of ['00-motion.md', '01-debate.md', '02-vote.md', '03-minutes.md', '04-decision-record.md']) {
    try {
      artifacts[file] = await read(root, path.join(directory, file));
      if (!artifacts[file].trim()) throw new MeetingError(`Incomplete meeting: empty ${file}.`);
    }
    catch (error) {
      if (error.code === 'ENOENT') throw new MeetingError(`Incomplete meeting: missing ${file}.`);
      throw error;
    }
  }
  const draftsDir = await inside(root, path.join(directory, 'drafts'));
  const drafts = [];
  for (const file of (await readdir(draftsDir)).filter(file => file.endsWith('.md')).sort()) {
    const { data, text } = frontmatter(await read(root, path.join(draftsDir, file)));
    const seat = seatNumber(data.seat);
    if (!text) throw new MeetingError('Draft body must not be empty.');
    if (!seat || drafts.some(draft => draft.seat === seat)) throw new MeetingError('Drafts need unique seats 1–6.');
    const generated = typeof data.generated === 'string' && Number.isFinite(Date.parse(data.generated)) ? data.generated : null;
    drafts.push({ seat, name: typeof data.name === 'string' ? data.name : `Seat ${seat}`,
      model: typeof data.model === 'string' ? data.model : null,
      context: data.context ?? null, generated, position: draftPosition(text), text });
  }
  if (drafts.length !== 6) throw new MeetingError('A finished meeting needs all six seat drafts.');
  const seats = drafts.toSorted((a, b) => a.seat - b.seat).map(({ text: _text, ...seat }) => ({ ...seat, founder: seat.seat === 1 }));
  // A board root may also contain optional seats/*.md dossiers.
  let rosterFiles = [];
  try { rosterFiles = await readdir(await inside(root, path.join(root, 'seats'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const file of rosterFiles.filter(file => file.endsWith('.md'))) {
    const { data } = frontmatter(await read(root, path.join(root, 'seats', file)));
    const seat = seats.find(seat => seat.seat === seatNumber(data.seat));
    if (seat) {
      if (typeof data.name === 'string') seat.name = data.name;
      if (typeof data.lens === 'string') seat.lens = data.lens;
      // The meeting's recorded model is authoritative, not today's dossier model.
    }
  }
  const title = artifacts['00-motion.md'].match(/^#\s+(.+)$/m)?.[1] ?? id;
  return { id, title, mode: 'replay', phase: 6, seats, drafts, artifacts,
    votes: votesFrom(artifacts['02-vote.md'], seats) };
}

export async function listMeetings(root) {
  let ids;
  if (await exists(path.join(root, '00-motion.md'))) ids = ['_root'];
  else {
    let base = root;
    try { if ((await stat(path.join(root, 'meetings'))).isDirectory()) base = path.join(root, 'meetings'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    ids = (await readdir(await inside(root, base), { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && /^[\w-]+$/.test(entry.name)).map(entry => entry.name).sort();
  }
  const meetings = [], skipped = [];
  for (const id of ids) {
    try {
      const meeting = await parseMeeting(root, id);
      meetings.push({ id, title: meeting.title });
    } catch (error) {
      if (error instanceof MeetingError || error.code === 'ENOENT') skipped.push({ id, reason: 'Not a readable, complete six-seat meeting.' });
      else throw error;
    }
  }
  return { meetings, skipped };
}
