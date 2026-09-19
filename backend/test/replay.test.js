import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listMeetings, parseMeeting, frontmatter, passages, votesFrom } from '../src/parser.js';
import { recording } from '../src/replay.js';
import { createServer } from '../src/server.js';

const fixture = fileURLToPath(new URL('../test-fixtures/synthetic-demo', import.meta.url));
async function copy(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'corporate-replay-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(fixture, path.join(root, 'meeting'), { recursive: true });
  return root;
}
async function server(t, options) {
  const instance = createServer({ dataDir: fixture, tickMs: 0, ...options });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => { instance.closeAllConnections(); return new Promise(resolve => instance.close(resolve)); });
  return `http://127.0.0.1:${instance.address().port}`;
}
test('loads one synthetic meeting from a directory or collection', async () => {
  const meeting = await parseMeeting(fixture, '_root');
  assert.equal(meeting.seats.length, 6);
  assert.equal(meeting.seats[0].founder, true);
  assert.equal(meeting.seats.filter(seat => seat.founder).length, 1);
  assert.equal(meeting.seats[1].position, 'support-with-conditions');
  assert.equal(meeting.votes[3], 'oppose');
  assert.deepEqual((await listMeetings(path.dirname(fixture))).meetings.map(m => m.id), ['synthetic-demo']);
});
test('replay preserves every artifact and sequences founder, timestamped drafts, vote, clerk, decision', async () => {
  const meeting = await parseMeeting(fixture, '_root');
  meeting.drafts.find(d => d.seat === 6).generated = '2026-01-01T09:00:00Z';
  const events = [...recording(meeting)];
  assert.deepEqual(events.filter(e => e.type === 'phase').map(e => e.phase), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(events.filter(e => e.type === 'speech-start' && e.phase === 2).map(e => e.seat), [6, 2, 3, 4, 5]);
  for (const [phase, file] of [[0, '00-motion.md'], [3, '01-debate.md'], [4, '02-vote.md'], [5, '03-minutes.md'], [6, '04-decision-record.md']]) {
    assert.equal(events.filter(e => e.type === 'text' && e.phase === phase).map(e => e.text).join(''), meeting.artifacts[file]);
  }
  assert.ok(events.filter(e => e.phase === 5 && e.type === 'text').every(e => e.voice === 'clerk' && e.seat === null));
  assert.equal(events.at(-1).type, 'complete');
});
test('YAML, section positions, names, and unknown prose do not invent attribution', () => {
  assert.equal(frontmatter('---\nseat: 2\ncontext:\n  - test\n---\nHello').text, 'Hello');
  assert.throws(() => frontmatter('---\nseat: [\n---\nHello'), /Invalid YAML/);
  const seats = [{ seat: 2, name: 'Bex Buttonfern' }];
  assert.equal(passages('## Bex Buttonfern\nHello', seats)[0].seat, 2);
  assert.equal(passages('## General notes\nUnknown voice', seats)[0].seat, null);
  assert.equal(passages('## 2 concerns\nUnattributed prose', seats)[0].seat, null);
  const debate = '## Seat 2\nHello\n\n### Argument\nKeep attribution.\n\n## Notes\nNarration.\n';
  const blocks = passages(debate, seats);
  assert.equal(blocks[0].seat, 2);
  assert.match(blocks[0].text, /Keep attribution/);
  assert.equal(blocks[1].seat, null);
  assert.equal(blocks.map(block => block.text).join(''), debate);
  assert.deepEqual(votesFrom('## Seat 2\nVOTE: oppose\n', seats), { 2: 'oppose' });
  assert.deepEqual(votesFrom('| Seat 2 | maybe |\n', seats), {});
});
test('rejects missing phases, malformed drafts and duplicate seats; listing skips incomplete meetings', async t => {
  const root = await copy(t);
  await rm(path.join(root, 'meeting/04-decision-record.md'));
  await assert.rejects(parseMeeting(root, 'meeting'), /Incomplete meeting/);
  assert.equal((await listMeetings(root)).skipped.length, 1);
  await cp(fixture, path.join(root, 'meeting'), { recursive: true });
  const draft = path.join(root, 'meeting/drafts/02-fictional.md');
  await writeFile(draft, (await readFile(draft, 'utf8')).replace('seat: 2', 'seat: 1'));
  await assert.rejects(parseMeeting(root, 'meeting'), /unique seats/);
});
test('optional board roster supplies labels but never overwrites historical models', async t => {
  const root = await copy(t);
  await mkdir(path.join(root, 'meetings'));
  await rename(path.join(root, 'meeting'), path.join(root, 'meetings/meeting'));
  assert.equal((await listMeetings(root)).meetings[0].id, 'meeting');
  await mkdir(path.join(root, 'seats'));
  await writeFile(path.join(root, 'seats/02-label.md'), '---\nseat: 2\nname: Different Fictional Name\nlens: Cushion safety\nmodel: changed-today\n---\n');
  const meeting = await parseMeeting(root, 'meeting');
  assert.equal(meeting.seats[1].name, 'Different Fictional Name');
  assert.equal(meeting.seats[1].model, 'synthetic-placeholder');
});
test('rejects traversal and escaping artifact and meeting symlinks', async t => {
  const root = await copy(t);
  await assert.rejects(parseMeeting(root, '../synthetic-demo'), /Invalid meeting ID/);
  await symlink(fixture, path.join(root, 'escape'));
  await assert.rejects(parseMeeting(root, 'escape'), /outside DATA_DIR/);
  await rm(path.join(root, 'meeting/00-motion.md'));
  await symlink(path.join(fixture, '00-motion.md'), path.join(root, 'meeting/00-motion.md'));
  await assert.rejects(parseMeeting(root, 'meeting'), /outside DATA_DIR/);
});
test('REST and SSE return metadata, all events and errors without private paths', async t => {
  const base = await server(t);
  assert.equal((await (await fetch(`${base}/api/meetings`)).json()).meetings[0].id, '_root');
  assert.equal((await (await fetch(`${base}/api/meetings/_root`)).json()).seats.length, 6);
  const response = await fetch(`${base}/api/meetings/_root/events?speed=4`);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const body = await response.text();
  assert.match(body, /event: vote/);
  assert.match(body, /event: complete/);
  assert.match(body, /"voice":"clerk"/);
  for (const speed of ['0', 'Infinity', 'nope', '5']) assert.equal((await fetch(`${base}/api/meetings/_root/events?speed=${speed}`)).status, 400);
  assert.equal((await fetch(`${base}/api/meetings/%2e%2e%2fescape`)).status, 400);
  assert.equal((await fetch(`${base}/api/meetings/%ZZ`)).status, 400);
  assert.equal((await fetch(`${base}/api/meetings/missing`)).status, 404);
  assert.equal((await fetch(`${base}/api/meetings`, { method: 'POST' })).status, 405);
});
test('SSE advances over time and a disconnected replay leaves server responsive', async t => {
  const base = await server(t, { tickMs: 10 });
  const controller = new AbortController();
  const start = Date.now();
  const response = await fetch(`${base}/api/meetings/_root/events`, { signal: controller.signal });
  const reader = response.body.getReader();
  let text = '';
  while (!text.includes('event: text')) text += new TextDecoder().decode((await reader.read()).value);
  assert.ok(Date.now() - start >= 20);
  controller.abort();
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('empty required artifacts and empty draft bodies cannot masquerade as finished meetings', async t => {
  const root = await copy(t);
  const motion = path.join(root, 'meeting/00-motion.md');
  await writeFile(motion, '   \n');
  await assert.rejects(parseMeeting(root, 'meeting'), /empty 00-motion/);
  await cp(path.join(fixture, '00-motion.md'), motion);
  await writeFile(path.join(root, 'meeting/drafts/01-fictional.md'), '---\nseat: 1\n---\n');
  await assert.rejects(parseMeeting(root, 'meeting'), /Draft body must not be empty/);
});

test('a founder draft with a free-text provenance note inside its frontmatter still parses', async t => {
  // Real-world shape, not hypothetical: this repo's own founder-draft convention
  // sometimes embeds a prose "provenance note" paragraph between the opening and
  // closing --- delimiters, alongside the actual header fields. That block is not
  // valid YAML on its own, but the header fields around it must still be extracted.
  const root = await copy(t);
  const founder = path.join(root, 'meeting/drafts/01-fictional.md');
  const original = await readFile(founder, 'utf8');
  const body = original.slice(original.indexOf('\n---\n', 4) + 5);
  await writeFile(founder, [
    '---',
    'seat: 01-fictional',
    'name: Fictional Founder',
    'model: n/a — not simulated',
    'context: unsimulated, per fictional process.',
    '',
    '**Provenance note:** this paragraph is deliberately not valid YAML — it has no',
    'key: value shape, spans multiple lines, and follows a blank line, which breaks',
    'plain-scalar folding.',
    'generated: 2026-01-01',
    '---',
    '',
    body
  ].join('\n'));
  const meeting = await parseMeeting(root, 'meeting');
  const founderSeat = meeting.seats.find(seat => seat.founder);
  assert.equal(founderSeat.name, 'Fictional Founder');
  assert.equal(founderSeat.generated, '2026-01-01');
});

test('one malformed seats/*.md roster file is skipped, not fatal to the whole meeting', async t => {
  const root = await copy(t);
  await mkdir(path.join(root, 'seats'), { recursive: true });
  await writeFile(path.join(root, 'seats/02-fictional.md'), '---\nseat: 02-fictional\nname: [unterminated\n---\n');
  const meeting = await parseMeeting(root, 'meeting');
  assert.equal(meeting.seats.length, 6);
});
