import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { initialState, applyEvent, speakerLabel } from '../src/state.js';
import { currentTarget, nextPhase, nextSpeaker, offset, targets } from '../src/navigation.js';
import { createServer } from '../server.js';

const toc = [
  { phase: 0, label: 'Motion', startEvent: 0 },
  { phase: 1, label: 'Founder draft', startEvent: 45 },
  { phase: 2, label: 'Independent drafts', startEvent: 106, seats: [
    { seat: 2, name: 'Bex Buttonfern', startEvent: 107 },
    { seat: 3, name: 'Milo Marshmallow', startEvent: 167 }
  ] },
  { phase: 3, label: 'Debate', startEvent: 409 }
];

async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
test('speech builds progressively, founder is human, and clerk stays separate from seats', () => {
  let state = initialState([{ seat: 1, founder: true, name: 'Pip Papercloud' }]);
  state = applyEvent(state, { type: 'phase', phase: 1, label: 'Founder draft' });
  state = applyEvent(state, { type: 'speech-start', seat: 1, voice: 'seat', position: 'support' });
  state = applyEvent(state, { type: 'text', text: 'Rubber ' });
  state = applyEvent(state, { type: 'text', text: 'duck' });
  assert.equal(state.text, 'Rubber duck');
  assert.match(speakerLabel(state), /Founder \/ human/);
  assert.equal(state.positions[1], 'support');
  state = applyEvent(state, { type: 'vote', votes: { 1: 'oppose', 2: 'abstain' } });
  assert.equal(state.votes[1], 'oppose'); // Final vote can differ from draft position.
  state = applyEvent(state, { type: 'phase', phase: 5, label: 'Clerk' });
  state = applyEvent(state, { type: 'speech-start', seat: null, voice: 'clerk' });
  assert.equal(state.text, '');
  assert.match(speakerLabel(state), /non-binding.*never evidence/);
  assert.equal(applyEvent(state, { type: 'complete' }).status, 'complete');
  assert.deepEqual(initialState().votes, {});
});
test('navigation targets phases and Phase 2 seats, and tracks position by event index', () => {
  assert.deepEqual(targets(toc).map(target => target.startEvent), [0, 45, 106, 107, 167, 409]);
  assert.deepEqual(targets(toc).map(target => target.kind), ['phase', 'phase', 'phase', 'seat', 'seat', 'phase']);
  assert.equal(targets(toc)[3].label, 'Seat 2 · Bex Buttonfern');
  // Next phase skips over Phase 2's individual drafts; next speaker does not.
  assert.equal(nextPhase(toc, 110).startEvent, 409);
  assert.equal(nextSpeaker(toc, 110).startEvent, 167);
  assert.equal(nextPhase(toc, 409), null);
  assert.equal(nextSpeaker(toc, 409), null);
  assert.equal(currentTarget(toc, 500).label, 'Phase 3 · Debate');
  assert.equal(currentTarget(toc, 166).label, 'Seat 2 · Bex Buttonfern');
  assert.equal(currentTarget(toc, 0).label, 'Phase 0 · Motion');
  assert.equal(offset(106, 424), 25);
  assert.equal(offset(0, 0), 0); // An empty recording must not divide by zero.
  // State follows the server's event index so a seek target is always well defined.
  let state = initialState([], 0);
  assert.equal(state.index, 0);
  state = applyEvent(state, { type: 'text', text: 'hi', index: 412 });
  assert.equal(state.index, 412);
  assert.equal(applyEvent(state, { type: 'complete' }).index, 412);
});
test('frontend serves relative assets, proxies REST and streams SSE before upstream finishes', async t => {
  let finish;
  const upstream = http.createServer((request, response) => {
    if (request.url === '/api/meetings') { response.setHeader('Content-Type', 'application/json'); response.end('{"meetings":[]}'); return; }
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    response.write('event: phase\ndata: {"phase":0}\n\n');
    finish = () => response.end('event: complete\ndata: {}\n\n');
  });
  const backendUrl = await listen(t, upstream);
  const base = await listen(t, createServer({ backendUrl, root: new URL('../', import.meta.url) }));
  const html = await (await fetch(base)).text();
  assert.match(html, /\.\/src\/app.js/);
  assert.match(html, /Live generation: not implemented/);
  assert.equal((await fetch(`${base}/src/scene.js`)).status, 200);
  assert.equal((await fetch(`${base}/src/navigation.js`)).status, 200);
  assert.equal((await fetch(`${base}/server.js`)).status, 404);
  assert.deepEqual(await (await fetch(`${base}/api/meetings`)).json(), { meetings: [] });
  const response = await fetch(`${base}/api/meetings/example/events`);
  const reader = response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: phase/);
  finish();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: complete/);
  await reader.cancel();
});
test('backend failure is a useful 502 response', async t => {
  const base = await listen(t, createServer({ backendUrl: 'http://127.0.0.1:1' }));
  const response = await fetch(`${base}/api/meetings`);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /unavailable/);
});
