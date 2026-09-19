import { DISPLAY_NAME, FLAVOR } from './config.js';
import { applyEvent, initialState, speakerLabel } from './state.js';
import { createScene } from './scene.js';

const element = id => document.getElementById(id);
document.title = `${DISPLAY_NAME} · Replay`;
element('brand').textContent = DISPLAY_NAME;
let state = initialState();
let stream = null;
let pending = null;
let flavorIndex = 0;
const flavor = () => FLAVOR[flavorIndex % FLAVOR.length];
createScene(element('office'), () => state, flavor);
setInterval(() => { flavorIndex++; element('flavor').textContent = flavor(); }, 4000);

function controls(playing) {
  element('play').disabled = playing || !element('meeting').value;
  element('meeting').disabled = playing || !element('meeting').value;
  element('speed').disabled = playing;
  element('stop').disabled = !playing;
}
function disconnect() {
  stream?.close(); stream = null;
  pending?.abort(); pending = null;
}
function archive() {
  if (!element('speech').textContent) return;
  const article = element('current').cloneNode(true);
  article.removeAttribute('id');
  article.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  element('history').append(article);
}
function display() {
  element('phase').textContent = state.phase === null ? 'Office idle' : `Phase ${state.phase} · ${state.label}`;
  element('speaker').textContent = speakerLabel(state);
  element('speech').textContent = state.text;
  element('current').classList.toggle('clerk', state.voice === 'clerk');
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
element('controls').addEventListener('submit', async event => {
  event.preventDefault(); disconnect(); controls(true);
  const controller = new AbortController(); pending = controller;
  element('status').textContent = 'Retrieving archived stakeholder alignment…';
  try {
    const id = encodeURIComponent(element('meeting').value);
    const meeting = await json(`/api/meetings/${id}`, controller.signal);
    if (controller.signal.aborted) return;
    state = { ...initialState(meeting.seats), status: 'playing' };
    element('history').replaceChildren(); display();
    element('status').textContent = `Playing saved recording: ${meeting.title}`;
    stream = new EventSource(`/api/meetings/${id}/events?speed=${element('speed').value}`);
    for (const type of ['phase', 'speech-start', 'text', 'speech-end', 'vote', 'complete']) {
      stream.addEventListener(type, message => {
        const event = JSON.parse(message.data);
        if (type === 'speech-start' || type === 'phase') archive();
        state = applyEvent(state, event); display();
        if (type === 'complete') {
          disconnect(); controls(false); element('play').textContent = 'Replay recording';
          element('status').textContent = 'Recording complete. Alignment has been archived.';
        }
      });
    }
    // Explicitly close: automatic EventSource reconnect would replay from the beginning.
    stream.onerror = () => fail('Recording interrupted. Check the backend, then replay from the beginning.');
  } catch (error) {
    if (error.name !== 'AbortError') fail(`${error.message} Check that the replay backend is running.`);
  }
});
element('stop').addEventListener('click', () => {
  disconnect(); state = { ...state, status: 'stopped' }; controls(false);
  element('status').textContent = 'Recording stopped. Play starts again from the beginning.';
});
window.addEventListener('pagehide', disconnect);
try {
  const { meetings, skipped } = await json('/api/meetings');
  element('meeting').replaceChildren();
  for (const meeting of meetings) {
    const option = document.createElement('option'); option.value = meeting.id; option.textContent = meeting.title;
    element('meeting').append(option);
  }
  controls(false);
  element('status').textContent = meetings.length ? `Ready to replay. ${skipped.length ? `${skipped.length} incomplete or unreadable directories skipped.` : 'No live models are running.'}` :
    'No complete recordings found. Point DATA_DIR at a meeting directory or collection. See the local setup instructions.';
} catch {
  element('meeting').replaceChildren();
  fail('Replay backend unavailable. Run the local backend and frontend; a static Pages site cannot stream meetings by itself.');
}
