// Every test here writes to disk, so every test here gets its own disposable tmpdir
// that is also its own fresh `git init` repository, removed by `t.after`. No test in
// this file ever touches a real board directory, the bundled fixture, or anything
// outside the tmpdir it created — same convention as replay.test.js's `copy(t)` helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { frontmatter, meetingLocation } from '../src/parser.js';
import { createMeeting, founderMarkdown, meetingId, motionMarkdown, slugify, writeFounderDraft } from '../src/meeting-writer.js';
import { createServer } from '../src/server.js';

const run = promisify(execFile);
const git = (cwd, ...args) => run('git', args, { cwd });

async function repo(t, { collection = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'corporate-write-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, 'init', '-q', '-b', 'main');
  await git(root, 'config', 'user.email', 'test@example.invalid');
  await git(root, 'config', 'user.name', 'Disposable Test Repo');
  await git(root, 'config', 'commit.gpgsign', 'false');
  if (collection) await mkdir(path.join(root, 'meetings'));
  // A repository with no commits at all has no HEAD; give it one so `git log` works.
  await writeFile(path.join(root, 'README.md'), '# Disposable test fixture\n');
  await git(root, 'add', '--', 'README.md');
  await git(root, 'commit', '-q', '-m', 'seed');
  return root;
}
const motion = { title: 'Buy the fictional duck a throne', decision: 'Authorize one pretend throne.',
  cost: 'Three imaginary jellybeans.', deadline: 'Before the imaginary tea bell.', links: 'D-0000.' };
const founder = { name: 'Pip Papercloud', position: 'support', summary: 'The duck has stood long enough.',
  argument: 'Fictional furniture, fictional stakes.', cost: 'Three imaginary jellybeans.',
  changeMind: 'A comfort survey completed by the duck.', prediction: 'The duck will keep saying nothing.' };

async function server(t, dataDir) {
  const instance = createServer({ dataDir, tickMs: 0 });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => { instance.closeAllConnections(); return new Promise(resolve => instance.close(resolve)); });
  return `http://127.0.0.1:${instance.address().port}`;
}
const post = (base, url, body) => fetch(`${base}${url}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('assembled markdown matches the shapes the parser already reads', () => {
  const text = motionMarkdown(motion);
  assert.match(text, /^# Buy the fictional duck a throne\n/);
  assert.deepEqual(text.match(/^## .+$/gm), ['## Decision', '## Cost', '## Deadline', '## Links']);
  // Optional sections keep the shape rather than disappearing from it.
  assert.match(motionMarkdown({ ...motion, cost: '', deadline: '  ', links: undefined }), /## Cost\n\nNone stated\./);
  assert.throws(() => motionMarkdown({ ...motion, decision: '   ' }), /Decision must not be empty/);
  assert.throws(() => motionMarkdown({ ...motion, title: '' }), /Motion title must not be empty/);

  const draft = founderMarkdown(founder, { generated: '2026-01-01T10:00:00Z' });
  const parsed = frontmatter(draft);
  assert.equal(parsed.data.seat, '01-founder');
  assert.equal(parsed.data.name, 'Pip Papercloud');
  assert.equal(parsed.data.model, 'n/a — not simulated');
  assert.equal(parsed.data.generated, '2026-01-01T10:00:00Z');
  assert.deepEqual(parsed.text.match(/^## .+$/gm),
    ['## POSITION', '## SUMMARY', '## ARGUMENT', '## COST I SEE', '## WHAT WOULD CHANGE MY MIND', '## PREDICTION']);
  assert.throws(() => founderMarkdown({ ...founder, prediction: '' }), /Prediction must not be empty/);
  // A name with YAML-significant characters must not break the frontmatter it lands in.
  assert.equal(frontmatter(founderMarkdown({ ...founder, name: 'Pip: "the duck" #1' })).data.name, 'Pip: "the duck" #1');
});
test('slugs derive from the motion title and always satisfy the meeting-ID pattern', () => {
  assert.equal(slugify('Buy the fictional duck a throne!'), 'buy-the-fictional-duck-a-throne');
  assert.equal(slugify('  Spaces   &&& symbols --- 2026 '), 'spaces-symbols-2026');
  assert.equal(meetingId({ title: 'Duck throne', date: '2026-09-19' }), '2026-09-19-duck-throne');
  assert.equal(meetingId({ title: 'ignored', slug: 'Explicit Slug', date: '2026-09-19' }), '2026-09-19-explicit-slug');
  assert.throws(() => slugify('!!!'), /at least one letter or number/);
  assert.throws(() => meetingId({ title: 'x', date: '19-09-2026' }), /YYYY-MM-DD/);
  // Separators and traversal are stripped, not passed through: whatever a caller asks
  // for, the resulting ID is a single safe segment the parser's own regex accepts.
  for (const [input, expected] of [['../escape', 'escape'], ['a/b', 'a-b'], ['..', null], ['', null]]) {
    if (expected === null) assert.throws(() => slugify(input), /at least one letter or number/);
    else assert.equal(slugify(input), expected);
  }
});

test('a sealed motion lands where meetings are read from, and is really committed', async t => {
  const root = await repo(t);
  const { id } = await createMeeting(root, { ...motion, date: '2026-09-19' });
  assert.equal(id, '2026-09-19-buy-the-fictional-duck-a-throne');
  const directory = path.join(root, 'meetings', id);
  assert.equal(await meetingLocation(root, id), directory);
  assert.match(await readFile(path.join(directory, '00-motion.md'), 'utf8'), /## Decision\n\nAuthorize one pretend throne\./);
  // The drafts/ directory is scaffolded up front, exactly like convene.sh does.
  assert.equal((await run('git', ['log', '--oneline'], { cwd: root })).stdout.trim().split('\n').length, 2);
  assert.match((await git(root, 'log', '-1', '--pretty=%s')).stdout, new RegExp(`motion for ${id}`));
  assert.equal((await git(root, 'status', '--porcelain')).stdout.trim(), '');
  const { sealed } = await writeFounderDraft(root, id, founder);
  assert.deepEqual(sealed, ['drafts/01-founder.md']);
  const draft = await readFile(path.join(directory, 'drafts/01-founder.md'), 'utf8');
  assert.equal(frontmatter(draft).data.seat, '01-founder');
  assert.ok(Number.isFinite(Date.parse(frontmatter(draft).data.generated)));
  assert.equal((await git(root, 'status', '--porcelain')).stdout.trim(), '');
  assert.equal((await run('git', ['log', '--oneline'], { cwd: root })).stdout.trim().split('\n').length, 3);
});
test('a flat DATA_DIR with no meetings/ subdirectory gets the meeting at its root', async t => {
  const root = await repo(t, { collection: false });
  const { id } = await createMeeting(root, motion);
  assert.equal(await meetingLocation(root, id), path.join(root, id));
});
test('the founder draft cannot be written before, or without, a sealed motion', async t => {
  const root = await repo(t);
  // No meeting at all: the lookup itself fails before anything is written.
  await assert.rejects(writeFounderDraft(root, '2026-09-19-nothing-here', founder), error => error.code === 'ENOENT');
  const directory = path.join(root, 'meetings/2026-09-19-hand-made');
  await mkdir(path.join(directory, 'drafts'), { recursive: true });
  await assert.rejects(writeFounderDraft(root, '2026-09-19-hand-made', founder), /motion must be sealed before the founder draft/);
  await writeFile(path.join(directory, '00-motion.md'), '   \n');
  await assert.rejects(writeFounderDraft(root, '2026-09-19-hand-made', founder), /motion is empty/);
  await writeFile(path.join(directory, '00-motion.md'), motionMarkdown(motion));
  await assert.rejects(writeFounderDraft(root, '2026-09-19-hand-made', founder), /not committed yet/);
  // Nothing was written by any of those refusals.
  await assert.rejects(readFile(path.join(directory, 'drafts/01-founder.md'), 'utf8'), error => error.code === 'ENOENT');
});
test('sealed files are refused a second write, and the original bytes survive', async t => {
  const root = await repo(t);
  const { id } = await createMeeting(root, motion);
  const directory = path.join(root, 'meetings', id);
  const before = await readFile(path.join(directory, '00-motion.md'), 'utf8');
  await assert.rejects(createMeeting(root, { ...motion, decision: 'Completely different text.' }),
    error => error.status === 409 && /already sealed/.test(error.message));
  assert.equal(await readFile(path.join(directory, '00-motion.md'), 'utf8'), before);
  await writeFounderDraft(root, id, founder);
  const draft = await readFile(path.join(directory, 'drafts/01-founder.md'), 'utf8');
  await assert.rejects(writeFounderDraft(root, id, { ...founder, summary: 'Rewritten.' }),
    error => error.status === 409 && /already sealed/.test(error.message));
  assert.equal(await readFile(path.join(directory, 'drafts/01-founder.md'), 'utf8'), draft);
  // A committed-then-deleted file is still sealed: git history, not just the filesystem.
  await rm(path.join(directory, 'drafts/01-founder.md'));
  await assert.rejects(writeFounderDraft(root, id, founder), error => error.status === 409);
});
test('writes refuse to escape DATA_DIR the same way reads already do', async t => {
  const root = await repo(t);
  const outside = await mkdtemp(path.join(tmpdir(), 'corporate-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  for (const bad of ['../escape', 'a/b', '.', '..', '']) {
    await assert.rejects(writeFounderDraft(root, bad, founder), error => error.status === 400 || error.code === 'ENOENT');
  }
  // A traversal-shaped slug is sanitized into one safe segment, never honored as a path.
  const sanitized = await createMeeting(root, { ...motion, slug: '../escape', date: '2026-01-02' });
  assert.equal(sanitized.id, '2026-01-02-escape');
  assert.equal(await meetingLocation(root, sanitized.id), path.join(root, 'meetings', sanitized.id));
  // A meeting directory that is really a symlink out of DATA_DIR is rejected, not followed.
  await symlink(outside, path.join(root, 'meetings/2026-09-19-escape'));
  await assert.rejects(writeFounderDraft(root, '2026-09-19-escape', founder), /outside DATA_DIR/);
  await assert.rejects(createMeeting(root, { ...motion, slug: 'escape', date: '2026-09-19' }), /outside DATA_DIR/);
  // A pre-placed symlink standing in for the motion file is never written through.
  const directory = path.join(root, 'meetings/2026-09-19-symlinked-motion');
  await mkdir(directory, { recursive: true });
  await symlink(path.join(outside, 'stolen.md'), path.join(directory, '00-motion.md'));
  await assert.rejects(createMeeting(root, { ...motion, slug: 'symlinked-motion', date: '2026-09-19' }),
    error => error.status === 409);
  await assert.rejects(readFile(path.join(outside, 'stolen.md'), 'utf8'), error => error.code === 'ENOENT');
});
test('a DATA_DIR that is not a git repository fails loudly and writes nothing', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'corporate-nogit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'meetings'));
  await assert.rejects(createMeeting(root, { ...motion, date: '2026-09-19' }),
    error => error.status === 500 && /not inside a git repository/.test(error.message));
  assert.deepEqual(await (await import('node:fs/promises')).readdir(path.join(root, 'meetings')), []);
});

test('the REST routes create, seal, refuse and never leak filesystem paths', async t => {
  const root = await repo(t);
  const base = await server(t, root);
  const created = await post(base, '/api/meetings', { ...motion, date: '2026-09-19' });
  assert.equal(created.status, 201);
  const { id, sealed } = await created.json();
  assert.equal(id, '2026-09-19-buy-the-fictional-duck-a-throne');
  assert.deepEqual(sealed, ['00-motion.md']);
  // Motion-only meetings are deliberately not replayable: Phase 2-6 do not exist yet.
  assert.equal((await fetch(`${base}/api/meetings/${id}`)).status, 422);
  assert.equal((await post(base, '/api/meetings', { ...motion, date: '2026-09-19' })).status, 409);
  assert.equal((await post(base, '/api/meetings', { ...motion, decision: '' })).status, 400);
  assert.equal((await post(base, '/api/meetings', 'not an object')).status, 400);
  assert.equal((await fetch(`${base}/api/meetings`, { method: 'POST' })).status, 400);
  assert.equal((await fetch(`${base}/api/meetings/${id}/events`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/api/meetings`, { method: 'DELETE' })).status, 405);

  assert.equal((await post(base, `/api/meetings/${id}/founder-draft`, founder)).status, 201);
  const resealed = await post(base, `/api/meetings/${id}/founder-draft`, founder);
  assert.equal(resealed.status, 409);
  assert.match((await resealed.json()).error, /already sealed/);
  assert.equal((await post(base, '/api/meetings/2026-01-01-missing/founder-draft', founder)).status, 404);
  assert.equal((await post(base, '/api/meetings/%2e%2e%2fescape/founder-draft', founder)).status, 400);
  assert.equal((await post(base, `/api/meetings/${id}/founder-draft`, { ...founder, position: '' })).status, 400);
  // No error body anywhere above may name a real path.
  for (const url of [`/api/meetings/${id}/founder-draft`, '/api/meetings']) {
    const body = await (await post(base, url, { ...motion, ...founder, date: '2026-09-19' })).text();
    assert.ok(!body.includes(root) && !body.includes(tmpdir()), body);
  }
});
