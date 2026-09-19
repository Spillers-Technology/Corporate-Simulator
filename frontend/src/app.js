import { DISPLAY_NAME, FLAVOR } from './config.js';
import { applyEvent, initialState, speakerLabel } from './state.js';
import { createScene } from './scene.js';
import { currentTarget, nextPhase, nextSpeaker, offset } from './navigation.js';

const element = id => document.getElementById(id);
document.title = `${DISPLAY_NAME} · Replay`;
element('brand').textContent = DISPLAY_NAME;
let state = initialState();
let meeting = null;
let stream = null;
let pending = null;
let dragging = false;
let dirty = false;
let flavorIndex = 0;
const flavor = () => FLAVOR[flavorIndex % FLAVOR.length];
createScene(element('office'), () => state, flavor);
setInterval(() => { flavorIndex++; element('flavor').textContent = flavor(); }, 4000);

function controls(playing) {
  const ready = Boolean(element('meeting').value);
  element('play').disabled = playing || !ready;
  element('meeting').disabled = playing || !ready;
  // Reading pace is now changeable mid-playback: that reconnect is the fast-forward.
  element('speed').disabled = !ready;
  element('stop').disabled = !playing;
  element('scrubber').disabled = !meeting;
  for (const button of document.querySelectorAll('#toc button, #ticks button')) button.disabled = !meeting;
}
function disconnect() {
  stream?.close(); stream = null;
  pending?.abort(); pending = null;
}
// Built from state, not cloned from the live DOM, so the transcript stays correct even
// when rendering is deferred or skipped entirely during a fast-forward.
function archive(previous) {
  if (!previous.text) return;
  const article = document.createElement('article');
  article.classList.toggle('clerk', previous.voice === 'clerk');
  const heading = document.createElement('h3'); heading.textContent = speakerLabel(previous);
  const speech = document.createElement('pre'); speech.textContent = previous.text;
  article.append(heading, speech);
  element('history').append(article);
}
// Thousands of catch-up events can land in one burst; coalesce rendering into a frame.
function schedule() {
  if (dirty) return;
  dirty = true;
  requestAnimationFrame(() => { if (dirty) { dirty = false; display(); } });
}
function positionText(index) {
  const target = currentTarget(meeting.toc, index);
  return `Event ${Math.min(index, meeting.totalEvents)} of ${meeting.totalEvents}${target ? ` · ${target.label}` : ''}`;
}
function display() {
  dirty = false;
  element('phase').textContent = state.phase === null ? 'Office idle' : `Phase ${state.phase} · ${state.label}`;
  element('speaker').textContent = speakerLabel(state);
  element('speech').textContent = state.text;
  element('current').classList.toggle('clerk', state.voice === 'clerk');
  if (!meeting) return;
  const index = state.status === 'complete' ? meeting.totalEvents : state.index;
  element('next-phase').disabled = !nextPhase(meeting.toc, index);
  element('next-speaker').disabled = !nextSpeaker(meeting.toc, index);
  if (dragging) return; // A drag owns the slider until it is released.
  element('scrubber').value = String(index);
  element('position').textContent = positionText(index);
  const active = currentTarget(meeting.toc, index);
  for (const button of element('toc').querySelectorAll('button')) {
    if (active && Number(button.dataset.start) === active.startEvent) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
}
function jumpButton(label, startEvent, className) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.dataset.start = String(startEvent);
  button.textContent = label;
  return button;
}
function renderNavigation() {
  const list = document.createElement('ol');
  list.className = 'toc-list';
  for (const entry of meeting.toc) {
    const item = document.createElement('li');
    item.append(jumpButton(`Phase ${entry.phase} · ${entry.label}`, entry.startEvent, 'toc-entry'));
    if (entry.seats?.length) {
      const seats = document.createElement('ol');
      seats.className = 'toc-seats';
      for (const seat of entry.seats) {
        const seatItem = document.createElement('li');
        seatItem.append(jumpButton(`Seat ${seat.seat} · ${seat.name}`, seat.startEvent, 'toc-entry seat'));
        seats.append(seatItem);
      }
      item.append(seats);
    }
    list.append(item);
  }
  element('toc').replaceChildren(list);
  // The same toc drawn as tick marks on the slider: one control, two ways to aim it.
  const ticks = meeting.toc.map(entry => {
    const tick = jumpButton(`P${entry.phase}`, entry.startEvent, 'tick');
    tick.style.left = `${offset(entry.startEvent, meeting.totalEvents)}%`;
    tick.title = `Phase ${entry.phase} · ${entry.label}`;
    tick.tabIndex = -1; // Mouse affordance; the contents list is the keyboard route.
    tick.setAttribute('aria-hidden', 'true');
    return tick;
  });
  element('ticks').replaceChildren(...ticks);
  element('scrubber').max = String(meeting.totalEvents);
  element('scrubber').value = String(Math.min(state.index, meeting.totalEvents));
  element('position').textContent = positionText(state.index);
}
async function json(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Replay service returned ${response.status}.`);
  return response.json();
}
function fail(message) {
  disconnect(); state = { ...state, status: 'error' };
  element('status').textContent = message; controls(false);
}
// Every navigation in this app is the same move: drop the stream, reconnect with a new
// `from`, and let the server replay the skipped events instantly so client state
// rebuilds exactly as an uninterrupted play-through would have left it.
function connect(from) {
  disconnect();
  controls(true);
  state = { ...initialState(meeting.seats, from), status: 'playing' };
  element('history').replaceChildren();
  display();
  const speed = element('speed').value;
  element('status').textContent = from > 0
    ? `Fast-forwarding to ${currentTarget(meeting.toc, from)?.label ?? `event ${from}`}…`
    : `Playing saved recording: ${meeting.title}`;
  let arrived = from === 0;
  stream = new EventSource(`/api/meetings/${encodeURIComponent(meeting.id)}/events?speed=${encodeURIComponent(speed)}&from=${from}`);
  for (const type of ['phase', 'speech-start', 'text', 'speech-end', 'vote', 'complete']) {
    stream.addEventListener(type, message => {
      const event = JSON.parse(message.data);
      if (type === 'speech-start' || type === 'phase') archive(state);
      state = applyEvent(state, event);
      if (!arrived && event.index >= from) {
        arrived = true;
        element('status').textContent = `Playing saved recording: ${meeting.title}`;
      }
      // Skipped events still build state; only their rendering is skipped.
      if (arrived) schedule();
      if (type === 'complete') {
        disconnect(); controls(false); display();
        element('play').textContent = 'Replay recording';
        element('status').textContent = 'Recording complete. Alignment has been archived.';
      }
    });
  }
  // Explicitly close: automatic EventSource reconnect would replay from the beginning.
  stream.onerror = () => fail('Recording interrupted. Check the backend, then replay from the beginning.');
}
function seek(index) {
  if (!meeting) return;
  connect(Math.max(0, Math.min(Math.round(index), meeting.totalEvents)));
}
async function loadMeeting(id) {
  disconnect();
  meeting = null; controls(false);
  const controller = new AbortController(); pending = controller;
  element('toc').replaceChildren(Object.assign(document.createElement('p'),
    { className: 'muted', textContent: 'Loading contents…' }));
  try {
    const metadata = await json(`/api/meetings/${encodeURIComponent(id)}`, controller.signal);
    if (controller.signal.aborted) return;
    pending = null;
    meeting = metadata;
    state = initialState(metadata.seats);
    renderNavigation(); controls(false); display();
    element('status').textContent = `Ready to replay: ${metadata.title}. Pick a starting point or press play.`;
  } catch (error) {
    if (error.name === 'AbortError') return;
    element('toc').replaceChildren();
    fail(`${error.message} Check that the replay backend is running.`);
  }
}
element('controls').addEventListener('submit', async event => {
  event.preventDefault();
  if (!meeting) await loadMeeting(element('meeting').value);
  if (meeting) connect(0);
});
element('meeting').addEventListener('change', () => loadMeeting(element('meeting').value));
element('speed').addEventListener('change', () => {
  // Changing pace mid-playback IS the fast-forward: resume from exactly here.
  if (state.status === 'playing') seek(state.index);
});
element('scrubber').addEventListener('input', () => {
  if (!meeting) return;
  dragging = true;
  const index = Number(element('scrubber').value);
  element('position').textContent = `Release to jump · ${positionText(index)}`;
});
element('scrubber').addEventListener('change', () => {
  dragging = false;
  seek(Number(element('scrubber').value));
});
for (const container of ['toc', 'ticks']) {
  element(container).addEventListener('click', event => {
    const button = event.target.closest('button[data-start]');
    if (button) seek(Number(button.dataset.start));
  });
}
element('next-phase').addEventListener('click', () => {
  const target = meeting && nextPhase(meeting.toc, state.index);
  if (target) seek(target.startEvent);
});
element('next-speaker').addEventListener('click', () => {
  const target = meeting && nextSpeaker(meeting.toc, state.index);
  if (target) seek(target.startEvent);
});
element('stop').addEventListener('click', () => {
  disconnect(); state = { ...state, status: 'stopped' }; controls(false);
  element('status').textContent = 'Recording stopped. Play restarts it; the timeline and contents resume from anywhere.';
});
window.addEventListener('pagehide', disconnect);
try {
  const { meetings, skipped } = await json('/api/meetings');
  element('meeting').replaceChildren();
  for (const entry of meetings) {
    const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.title;
    element('meeting').append(option);
  }
  controls(false);
  element('status').textContent = meetings.length ? `Ready to replay. ${skipped.length ? `${skipped.length} incomplete or unreadable directories skipped.` : 'No live models are running.'}` :
    'No complete recordings found. Point DATA_DIR at a meeting directory or collection. See the local setup instructions.';
  if (meetings.length) await loadMeeting(element('meeting').value);
} catch {
  element('meeting').replaceChildren();
  element('toc').replaceChildren();
  fail('Replay backend unavailable. Run the local backend and frontend; a static Pages site cannot stream meetings by itself.');
}
