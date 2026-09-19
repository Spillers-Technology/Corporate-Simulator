// Phase 0/1 human input: the only code in this app that WRITES into DATA_DIR.
//
// Everything here is deliberately narrow (docs/spec.md §13a): a motion, then a founder
// draft, then a real git commit — in that order, never the reverse, never concurrent.
// No seat dispatch, no model subprocesses, no later phases; §13b/§13c are separate work.
//
// Two invariants this module exists to hold:
//   1. Containment. Every path goes through parser.js's `inside()` — the same helper
//      replay-mode reads already use — rather than a second, parallel notion of safety.
//      `inside()` realpaths its candidate, so it cannot vet a file that does not exist
//      yet; the pattern below is "contain the parent, which does exist, then append one
//      validated segment", plus an O_EXCL create so a pre-placed symlink can never be
//      written through.
//   2. Sealing. Once a motion or founder draft is written and committed it is a record,
//      not a draft. Rewriting is refused (409), never silently allowed — supersede,
//      never edit, per CLAUDE.md.
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { collectionBase, inside, MEETING_ID, meetingLocation, MeetingError } from './parser.js';

const execFileAsync = promisify(execFile);
const SEGMENT = /^[\w-]+(?:\.md)?$/;
const MAX_FIELD = 64 * 1024;
const GIT_TIMEOUT_MS = 20_000;

async function present(file) {
  // lstat, not stat: a dangling symlink still occupies the name and must not be
  // treated as "nothing is there".
  try { await lstat(file); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

// `inside()` needs a path that exists. Contain the parent, then append exactly one
// validated name segment — no separators, no traversal, nothing to re-derive.
async function containedChild(root, parent, name) {
  if (!SEGMENT.test(name)) throw new MeetingError('Invalid file name.', 400);
  return path.join(await inside(root, parent), name);
}

function normalize(value, label, { required = true } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new MeetingError(`${label} must be text.`, 400);
  if (value.length > MAX_FIELD) throw new MeetingError(`${label} is too long.`, 400);
  // Same "must not be empty" bar parser.js applies when reading these files back.
  const text = value.replace(/\r\n/g, '\n').replace(/\s+$/, '').replace(/^\n+/, '');
  if (required && !text.trim()) throw new MeetingError(`${label} must not be empty.`, 400);
  return text;
}
function oneLine(value, label, { required = true, max = 200 } = {}) {
  const text = normalize(value, label, { required }).replace(/\s+/g, ' ').trim();
  if (text.length > max) throw new MeetingError(`${label} is too long.`, 400);
  return text;
}

export function slugify(title) {
  const slug = String(title ?? '').normalize('NFKD').replace(/[^\w\s-]/g, ' ')
    .trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    .replace(/-$/, '');
  if (!slug || !MEETING_ID.test(slug)) throw new MeetingError('Motion title needs at least one letter or number for the meeting ID.', 400);
  return slug;
}
export function meetingId({ title, slug, date = new Date().toISOString().slice(0, 10) }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new MeetingError('Meeting date must be YYYY-MM-DD.', 400);
  const id = `${date}-${slugify(slug || title)}`;
  if (!MEETING_ID.test(id) || id.length > 120) throw new MeetingError('Invalid meeting ID.', 400);
  return id;
}

// Markdown assembly — the exact shapes replay mode already parses (docs/spec.md §13a).
export function motionMarkdown({ title, decision, cost, deadline, links }) {
  const sections = [
    ['Decision', normalize(decision, 'Decision')],
    ['Cost', normalize(cost, 'Cost', { required: false }) || 'None stated.'],
    ['Deadline', normalize(deadline, 'Deadline', { required: false }) || 'None stated.'],
    ['Links', normalize(links, 'Links', { required: false }) || 'None.']
  ];
  return `# ${oneLine(title, 'Motion title')}\n\n${sections.map(([heading, body]) => `## ${heading}\n\n${body}\n`).join('\n')}`;
}
export function founderMarkdown(fields, { generated = new Date().toISOString() } = {}) {
  const name = oneLine(fields.name, 'Founder name', { max: 120 });
  const context = oneLine(fields.context, 'Context', { required: false, max: 300 })
    || 'unsimulated human input, entered through the Phase 1 founder form.';
  const sections = [
    ['POSITION', oneLine(fields.position, 'Position', { max: 80 })],
    ['SUMMARY', normalize(fields.summary, 'Summary')],
    ['ARGUMENT', normalize(fields.argument, 'Argument')],
    ['COST I SEE', normalize(fields.cost, 'Cost I see')],
    ['WHAT WOULD CHANGE MY MIND', normalize(fields.changeMind, 'What would change my mind')],
    ['PREDICTION', normalize(fields.prediction, 'Prediction')]
  ];
  // JSON quoting is valid YAML double-quoted scalar, and keeps `generated` a string
  // rather than a YAML timestamp — parser.js only accepts a string there.
  const frontmatter = ['---', 'seat: 01-founder', `name: ${JSON.stringify(name)}`,
    'model: n/a — not simulated', `context: ${JSON.stringify(context)}`,
    `generated: ${JSON.stringify(generated)}`, '---'].join('\n');
  return `${frontmatter}\n\n# Seat 1 — ${name}\n\n${sections.map(([heading, body]) => `## ${heading}\n\n${body}\n`).join('\n')}`;
}

async function git(cwd, args) {
  return execFileAsync('git', args, {
    cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  });
}
// DATA_DIR may be a subdirectory of the real repository (Joey's own board/ inside
// corporate-strategy is exactly that), so ask git where the repository actually is
// instead of assuming DATA_DIR is its root.
async function repositoryRoot(root) {
  try { return (await git(root, ['rev-parse', '--show-toplevel'])).stdout.trim(); }
  catch { throw new MeetingError('DATA_DIR is not inside a git repository; sealing a meeting requires one to commit into.', 500); }
}
async function committed(repo, file) {
  try { return Boolean((await git(repo, ['ls-files', '--error-unmatch', '--', file])).stdout.trim()); }
  catch { return false; }
}
async function seal(repo, message, files) {
  try {
    await git(repo, ['add', '--', ...files]);
    // Pathspec-scoped commit: whatever else is staged in a real repository is none of
    // this app's business, and must not be swept into the meeting's commit.
    await git(repo, ['commit', '-m', message, '--', ...files]);
  } catch (error) {
    throw new MeetingError(`Could not commit the sealed meeting: ${gitReason(error)}`, 500);
  }
}
function gitReason(error) {
  const text = `${error.stderr ?? ''}${error.stdout ?? ''}`.trim().split('\n')[0] || error.message || 'git failed.';
  // Never leak filesystem paths in an error body: keep the reason, drop anything
  // that looks like a path.
  return text.replace(/(^|\s)[./~][^\s'"]*/g, '$1<path>').slice(0, 200);
}

async function refuseIfSealed(repo, file, label) {
  if (await present(file) || await committed(repo, file)) {
    throw new MeetingError(`${label} is already sealed; it cannot be rewritten (supersede it with a new meeting instead).`, 409);
  }
}
async function rollback(created) {
  for (const entry of created.toReversed()) await rm(entry, { recursive: true, force: true }).catch(() => {});
}
function asMeetingError(error, fallback) {
  if (error instanceof MeetingError) return error;
  if (error.code === 'EEXIST') return new MeetingError(fallback, 409);
  return error;
}

/**
 * Phase 0. Scaffold `<date>-<slug>/drafts` where replay mode already looks for
 * meetings, write `00-motion.md`, and commit it. Nothing else is written.
 */
export async function createMeeting(root, fields = {}) {
  const title = oneLine(fields.title, 'Motion title');
  const content = motionMarkdown({ ...fields, title });
  const id = meetingId({ title, slug: fields.slug, ...(fields.date ? { date: fields.date } : {}) });
  // Preflight the repository before anything is written, so a non-repository DATA_DIR
  // fails with nothing half-created on disk.
  const repo = await repositoryRoot(root);
  const { base, single } = await collectionBase(root);
  if (single) throw new MeetingError('DATA_DIR is a single meeting directory, not a collection; point it at a directory that holds meetings.', 409);
  const directory = await containedChild(root, base, id);
  const motion = path.join(directory, '00-motion.md');
  await refuseIfSealed(repo, motion, 'This meeting\'s motion');
  const created = [];
  try {
    if (!await present(directory)) created.push(directory);
    await mkdir(path.join(directory, 'drafts'), { recursive: true });
    // The directory exists now, so it can be contained for real — and must resolve to
    // exactly the path replay-mode lookup would find.
    const resolved = await inside(root, directory);
    await inside(root, path.join(directory, 'drafts'));
    if (await meetingLocation(root, id) !== resolved) throw new MeetingError('New meeting did not land where meetings are read from.', 500);
    // O_EXCL: never follows a symlink, never overwrites — the last line of the seal.
    await writeFile(path.join(resolved, '00-motion.md'), content, { flag: 'wx' });
    created.push(path.join(resolved, '00-motion.md'));
    await seal(repo, `board: motion for ${id}`, [path.join(resolved, '00-motion.md')]);
  } catch (error) {
    await rollback(created);
    throw asMeetingError(error, 'This meeting\'s motion is already sealed.');
  }
  return { id, title, sealed: ['00-motion.md'] };
}

/**
 * Phase 1. Write and commit `drafts/01-founder.md` — only after `00-motion.md` is
 * present, non-empty and already committed. BOARD_PROCEDURE's ordering is load-bearing:
 * motion first, founder draft second, never the reverse and never concurrently.
 */
export async function writeFounderDraft(root, id, fields = {}) {
  const directory = await meetingLocation(root, id); // Validates the ID and containment.
  const content = founderMarkdown(fields);
  const repo = await repositoryRoot(root);
  const motion = await containedChild(root, directory, '00-motion.md');
  if (!await present(motion)) throw new MeetingError('This meeting has no motion yet; the motion must be sealed before the founder draft.', 409);
  if (!(await readFile(await inside(root, motion), 'utf8')).trim()) {
    throw new MeetingError('This meeting\'s motion is empty; it must be sealed with real content before the founder draft.', 409);
  }
  if (!await committed(repo, motion)) throw new MeetingError('This meeting\'s motion is not committed yet; it must be sealed before the founder draft.', 409);
  const created = [];
  const draftsDir = await containedChild(root, directory, 'drafts');
  if (!await present(draftsDir)) created.push(draftsDir);
  await mkdir(draftsDir, { recursive: true });
  const target = path.join(await inside(root, draftsDir), '01-founder.md');
  await refuseIfSealed(repo, target, 'This meeting\'s founder draft');
  try {
    await writeFile(target, content, { flag: 'wx' });
    created.push(target);
    await seal(repo, `board: founder draft for ${id}`, [target]);
  } catch (error) {
    await rollback(created);
    throw asMeetingError(error, 'This meeting\'s founder draft is already sealed.');
  }
  return { id, sealed: ['drafts/01-founder.md'] };
}
