import { speakerLabel } from './state.js';

const colors = { support: '#a7d49b', 'support-with-conditions': '#edc26f', oppose: '#ee9b91', abstain: '#acb6bf', unknown: '#84929b' };
const abbreviations = { support: 'SUPPORT', 'support-with-conditions': 'CONDITIONAL', oppose: 'OPPOSE', abstain: 'ABSTAIN', unknown: '?' };
const desks = [[150, 172], [550, 172], [950, 172], [150, 410], [550, 410], [950, 410]];
const meeting = [[310, 270], [440, 270], [790, 270], [310, 375], [660, 390], [790, 375]];

function wrap(context, text, width) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      if (context.measureText(line + word).width > width && line) { lines.push(line.trimEnd()); line = ''; }
      // Long unbroken tokens must still fit the canvas bubble.
      for (const char of word) {
        if (context.measureText(line + char).width > width) { lines.push(line); line = ''; }
        line += char;
      }
      line += ' ';
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
export function createScene(canvas, getState, getFlavor) {
  const context = canvas.getContext('2d');
  const locations = desks.map(([x, y]) => ({ x, y }));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rect = (x, y, width, height, color, radius = 8) => {
    context.fillStyle = color; context.beginPath(); context.roundRect(x, y, width, height, radius); context.fill();
  };
  const text = (value, x, y, color = '#e8e8de', size = 16, align = 'center') => {
    context.fillStyle = color; context.font = `${size}px system-ui`; context.textAlign = align; context.fillText(value, x, y);
  };
  let previous = 0;
  function draw(now) {
    const state = getState();
    const dt = Math.min((now - previous) / 1000, 0.1); previous = now;
    rect(0, 0, 1100, 800, '#263941', 0);
    for (let y = 100; y < 500; y += 40) { context.strokeStyle = '#2e444b'; context.beginPath(); context.moveTo(0, y); context.lineTo(1100, y); context.stroke(); }
    text('THE ALIGNMENT DEPARTMENT', 32, 40, '#c3d9ce', 18, 'left');
    text(state.phase === null ? 'WAITING FOR A RECORDING' : `PHASE ${state.phase} / 6`, 1068, 40, '#c3d9ce', 14, 'right');
    rect(375, 282, 350, 85, '#8c7257', 24);
    rect(392, 291, 316, 65, '#a28a6a', 18);
    text('ACTIONABLES GO HERE', 550, 330, '#382f29', 13);
    for (let i = 0; i < 6; i++) {
      const seat = state.seats[i] ?? { seat: i + 1, name: `Seat ${i + 1}`, founder: i === 0 };
      const [dx, dy] = desks[i];
      rect(dx - 85, dy - 16, 170, 70, '#5c7374');
      rect(dx - 18, dy - 2, 36, 20, '#293b42', 3);
      const gathering = state.phase >= 3 || (state.phase === 2 && (state.positions[seat.seat] || seat.founder));
      const target = gathering ? meeting[i] : desks[i];
      const point = locations[i];
      const step = reducedMotion ? 1 : Math.min(1, dt * 6);
      point.x += (target[0] - point.x) * step; point.y += (target[1] - point.y) * step;
      const active = state.seat === seat.seat && state.status === 'playing';
      if (active) rect(point.x - 30, point.y - 53, 60, 66, '#e4ebba');
      rect(point.x - 24, point.y - 46, 48, 52, seat.founder ? '#eabc71' : '#88b9c3');
      rect(point.x - 16, point.y - 37, 32, 18, seat.founder ? '#785332' : '#355e6b', 3);
      text(seat.founder ? '★' : String(seat.seat), point.x, point.y - 20, '#f4f3e4', 16);
      // Fixed nameplates stay legible even while characters gather at the table.
      text(seat.name.length > 24 ? `${seat.name.slice(0, 23)}…` : seat.name, dx, dy + 74, '#edf0e6', 16);
      text(seat.founder ? 'FOUNDER · HUMAN' : `SEAT ${seat.seat} · SIMULATED`, dx, dy + 94, seat.founder ? '#f4cb8a' : '#b5ccd1', 11);
      const vote = state.phase >= 4 ? state.votes[seat.seat] : state.positions[seat.seat];
      if (vote) {
        const tokenY = i < 3 ? dy - 90 : dy + 18;
        rect(dx - 66, tokenY, 132, 28, colors[vote] ?? colors.unknown);
        text(`${state.phase >= 4 ? '● ' : ''}${abbreviations[vote] ?? '?'}`, dx, tokenY + 19, '#1c2b31', 12);
        if (state.phase === 4) { rect(point.x + 27, point.y - 58, 10, 36, colors[vote]); }
      }
    }
    const clerk = state.voice === 'clerk';
    rect(28, 535, 1044, 237, clerk ? '#eee3f5' : '#f1efdd', 14);
    text(clerk ? 'CLERK’S DESK / NON-BINDING' : speakerLabel(state), 52, 565, clerk ? '#624b78' : '#344f50', 17, 'left');
    context.font = '18px system-ui';
    const lines = wrap(context, state.text || (state.status === 'idle' ? getFlavor() : 'Consulting the archived actionables…'), 990);
    const visible = lines.slice(-7);
    if (lines.length > 7) text('Earlier text is in the transcript below ↑', 1045, 565, '#66736d', 12, 'right');
    visible.forEach((line, index) => text(line, 52, 598 + index * 24, '#273b40', 18, 'left'));
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}
