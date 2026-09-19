export function initialState(seats = []) {
  return { seats, phase: null, label: 'The meeting before the meeting', seat: null,
    voice: 'narrator', text: '', positions: {}, votes: {}, status: 'idle' };
}
export function applyEvent(state, event) {
  switch (event.type) {
    case 'phase': return { ...state, phase: event.phase, label: event.label, text: '', seat: null, voice: 'narrator' };
    case 'speech-start': return { ...state, seat: event.seat, voice: event.voice, text: '',
      positions: event.position ? { ...state.positions, [event.seat]: event.position } : state.positions };
    case 'text': return { ...state, text: state.text + event.text };
    case 'vote': return { ...state, votes: event.votes };
    case 'complete': return { ...state, status: 'complete' };
    default: return state;
  }
}
export function speakerLabel(state) {
  if (state.voice === 'clerk') return 'Clerk · non-binding minutes · never evidence';
  const seat = state.seats.find(seat => seat.seat === state.seat);
  return seat ? `${seat.name} · ${seat.founder ? 'Founder / human' : `Simulated seat ${seat.seat}`}` : 'Meeting record';
}
