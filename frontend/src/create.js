// "New meeting" mode: Phase 0 (motion) and Phase 1 (founder draft) human input.
//
// Two rules shape all of this (docs/spec.md §13a):
//   1. Staged and explicit. Typing writes nothing anywhere. The preview below each
//      form is exactly the shape the backend will write, shown BEFORE the one button
//      that writes it. Only "Seal & Commit" performs a request.
//   2. Sealed means sealed. After a successful commit the fields go read-only and the
//      commit button is removed — no re-edit affordance, silent or otherwise. The
//      board convention is supersede, never edit.
//
// The markdown built here is a faithful preview; the backend re-derives the bytes it
// actually writes from the same fields, and is authoritative for them.

const MOTION_FIELDS = ['title', 'decision', 'cost', 'deadline', 'links'];
const FOUNDER_FIELDS = ['name', 'position', 'summary', 'argument', 'cost', 'changeMind', 'prediction'];

const clean = value => String(value ?? '').replace(/\r\n/g, '\n').replace(/\s+$/, '').replace(/^\n+/, '');
const line = value => clean(value).replace(/\s+/g, ' ').trim();
const section = (heading, body) => `## ${heading}\n\n${body}\n`;

export function motionMarkdown({ title, decision, cost, deadline, links }) {
  return `# ${line(title) || 'Untitled motion'}\n\n` + [
    section('Decision', clean(decision) || '…'),
    section('Cost', clean(cost) || 'None stated.'),
    section('Deadline', clean(deadline) || 'None stated.'),
    section('Links', clean(links) || 'None.')
  ].join('\n');
}
export function founderMarkdown(fields, generated = '<set when sealed>') {
  const name = line(fields.name) || 'Founder';
  return ['---', 'seat: 01-founder', `name: ${name}`, 'model: n/a — not simulated',
    'context: unsimulated human input, entered through the Phase 1 founder form.',
    `generated: ${generated}`, '---', '', `# Seat 1 — ${name}`, ''].join('\n') + '\n' + [
    section('POSITION', line(fields.position) || '…'),
    section('SUMMARY', clean(fields.summary) || '…'),
    section('ARGUMENT', clean(fields.argument) || '…'),
    section('COST I SEE', clean(fields.cost) || '…'),
    section('WHAT WOULD CHANGE MY MIND', clean(fields.changeMind) || '…'),
    section('PREDICTION', clean(fields.prediction) || '…')
  ].join('\n');
}
// A local echo of the backend's own slug rule, for the "will be created as" preview
// line only. The id the server returns is the real one, and is what gets displayed
// once the motion is sealed.
export function slugPreview(title, today = new Date().toISOString().slice(0, 10)) {
  const slug = line(title).normalize('NFKD').replace(/[^\w\s-]/g, ' ').trim().toLowerCase()
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '');
  return slug ? `${today}-${slug}` : null;
}
export function missing(fields, required) {
  return required.filter(name => !clean(fields[name]).trim());
}

export function initCreate(root = document) {
  const element = id => root.getElementById(id);
  const values = (prefix, names) => Object.fromEntries(names.map(name => [name, element(`${prefix}-${name}`).value]));
  const inputs = (prefix, names) => names.map(name => element(`${prefix}-${name}`));

  async function post(url, body) {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* A non-JSON body is reported by status alone. */ }
    if (!response.ok) throw new Error(payload.error || `The backend returned ${response.status}.`);
    return payload;
  }
  // Sealing is one-way and visible: fields become read-only, the button that writes
  // is removed rather than disabled, and the badge states what actually happened.
  function markSealed(prefix, names, label) {
    for (const field of inputs(prefix, names)) {
      field.readOnly = true;
      field.disabled = field.tagName === 'SELECT';
      field.setAttribute('aria-readonly', 'true');
    }
    element(`${prefix}-form`).classList.add('sealed');
    element(`${prefix}-commit`).remove();
    element(`${prefix}-seal`).textContent = label;
    element(`${prefix}-preview-label`).textContent = 'Written and committed:';
  }

  let meetingId = null;
  const motionPreview = () => {
    const fields = values('motion', MOTION_FIELDS);
    element('motion-preview').textContent = motionMarkdown(fields);
    const id = slugPreview(fields.title);
    element('motion-target').textContent = id
      ? `Will be created as ${id}/00-motion.md and committed.`
      : 'Give the motion a title: it becomes the meeting directory name.';
  };
  const founderPreview = () => {
    element('founder-preview').textContent = founderMarkdown(values('founder', FOUNDER_FIELDS));
  };
  for (const field of inputs('motion', MOTION_FIELDS)) field.addEventListener('input', motionPreview);
  for (const field of inputs('founder', FOUNDER_FIELDS)) {
    field.addEventListener('input', founderPreview);
    field.addEventListener('change', founderPreview);
  }
  motionPreview();
  founderPreview();

  element('motion-form').addEventListener('submit', async event => {
    event.preventDefault();
    const fields = values('motion', MOTION_FIELDS);
    const absent = missing(fields, ['title', 'decision']);
    if (absent.length) { element('motion-status').textContent = `Still needed before this can be sealed: ${absent.join(', ')}.`; return; }
    element('motion-commit').disabled = true;
    element('motion-status').textContent = 'Writing and committing the motion…';
    try {
      const result = await post('/api/meetings', fields);
      meetingId = result.id;
      markSealed('motion', MOTION_FIELDS, `SEALED · ${result.id}`);
      element('motion-status').textContent = `Motion sealed and committed as ${result.id}/00-motion.md. It cannot be edited — supersede it with a new meeting instead.`;
      element('founder-form').hidden = false;
      element('founder-status').textContent = 'Phase 1. Nothing is written until you seal this too.';
      element('founder-name').focus();
    } catch (error) {
      element('motion-commit').disabled = false;
      element('motion-status').textContent = `Nothing was written. ${error.message}`;
    }
  });
  element('founder-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!meetingId) { element('founder-status').textContent = 'Seal the motion first: the motion must exist before the founder draft.'; return; }
    const fields = values('founder', FOUNDER_FIELDS);
    const absent = missing(fields, FOUNDER_FIELDS);
    if (absent.length) { element('founder-status').textContent = `Still needed before this can be sealed: ${absent.join(', ')}.`; return; }
    element('founder-commit').disabled = true;
    element('founder-status').textContent = 'Writing and committing the founder draft…';
    try {
      await post(`/api/meetings/${encodeURIComponent(meetingId)}/founder-draft`, fields);
      markSealed('founder', FOUNDER_FIELDS, 'SEALED · drafts/01-founder.md');
      element('founder-status').textContent = 'Founder draft sealed and committed. It cannot be edited — supersede it instead.';
      element('phase2-note').hidden = false;
    } catch (error) {
      element('founder-commit').disabled = false;
      element('founder-status').textContent = `Nothing was written. ${error.message}`;
    }
  });
}
