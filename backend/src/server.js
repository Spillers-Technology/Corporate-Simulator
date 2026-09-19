import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listMeetings, MeetingError, parseMeeting } from './parser.js';
import { createMeeting, writeFounderDraft } from './meeting-writer.js';
import { navigation, streamReplay } from './replay.js';

const MAX_BODY = 512 * 1024;
// Phase 0/1 human input is the only write surface; everything else stays GET-only.
async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new MeetingError('Request body is too large.', 400);
    chunks.push(chunk);
  }
  if (!size) throw new MeetingError('A JSON body is required.', 400);
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return body;
  } catch { throw new MeetingError('Request body must be a JSON object.', 400); }
}

export function createServer({ dataDir, tickMs = 250 }) {
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const json = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(data));
    };
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'POST') {
        // Phase 0: create a meeting from a motion. Nothing before this writes anything.
        if (url.pathname === '/api/meetings') {
          return json(201, await createMeeting(dataDir, await readJson(request)));
        }
        // Phase 1: seal the founder draft of an already-created, motion-only meeting.
        const founder = url.pathname.match(/^\/api\/meetings\/([^/]+)\/founder-draft$/);
        if (founder) {
          return json(201, await writeFounderDraft(dataDir, decodeURIComponent(founder[1]), await readJson(request)));
        }
        return json(405, { error: 'Only the Phase 0 and Phase 1 human-input routes accept POST.' });
      }
      if (request.method !== 'GET') return json(405, { error: 'Only GET and the human-input POST routes are supported.' });
      if (url.pathname === '/api/health') return json(200, { status: 'ok', mode: 'replay', humanInput: true, liveSeats: false });
      if (url.pathname === '/api/meetings') return json(200, await listMeetings(dataDir));
      const match = url.pathname.match(/^\/api\/meetings\/([^/]+)(\/events)?$/);
      if (!match) return json(404, { error: 'Route not found.' });
      const id = decodeURIComponent(match[1]);
      const speed = Number(url.searchParams.get('speed') ?? 1);
      if (!Number.isFinite(speed) || speed < 0.5 || speed > 4) throw new MeetingError('Speed must be between 0.5 and 4.', 400);
      const fromParam = url.searchParams.get('from');
      const from = fromParam === null ? 0 : Number(fromParam);
      if (fromParam !== null && (!/^\d+$/.test(fromParam) || !Number.isSafeInteger(from))) {
        throw new MeetingError('From must be a non-negative whole event index.', 400);
      }
      const meeting = await parseMeeting(dataDir, id);
      if (!match[2]) {
        const { toc, totalEvents } = navigation(meeting);
        return json(200, { id, title: meeting.title, mode: meeting.mode, phase: meeting.phase, seats: meeting.seats, toc, totalEvents });
      }
      const controller = new AbortController();
      response.on('close', () => controller.abort());
      response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      response.flushHeaders();
      await streamReplay(response, meeting, { speed, from, tickMs, signal: controller.signal });
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      if (error instanceof URIError) return json(400, { error: 'Invalid meeting ID.' });
      if (error instanceof MeetingError) return json(error.status, { error: error.message });
      if (error.code === 'ENOENT') return json(404, { error: 'Meeting or DATA_DIR not found.' });
      json(500, { error: 'Unable to read meeting data.' });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4000);
  const dataDir = path.resolve(process.env.DATA_DIR || '../demo-data');
  createServer({ dataDir }).listen(port, '0.0.0.0', () => console.log(`Replay API listening on ${port}`));
}
