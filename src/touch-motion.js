export const touchMove = { x: 0, y: 0 };
export function stickVector(x, y, radius) {
  if (!(radius > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const distance = Math.hypot(x, y), magnitude = Math.min(1, distance / radius);
  if (magnitude <= .12) return { x: 0, y: 0 };
  const amount = (magnitude - .12) / .88;
  return { x: x / distance * amount, y: y / distance * amount };
}
export function mixMovement(keyForward, keyRight, touch, playing) {
  if (!playing) return { fw: 0, rt: 0 };
  const clamp = value => Math.max(-1, Math.min(1, value));
  return { fw: clamp(keyForward - touch.y), rt: clamp(keyRight + touch.x) };
}
export function createTouchMotion(move = { x: 0, y: 0 }) {
  const state = {
    move, stickId: null, look: null,
    beginStick(id) { if (state.stickId !== null || state.look?.id === id) return false; state.stickId = id; return true; },
    updateStick(id, x, y, radius) { if (id !== state.stickId) return false; Object.assign(move, stickVector(x, y, radius)); return true; },
    endStick(id) { if (id !== state.stickId) return false; state.stickId = null; move.x = move.y = 0; return true; },
    beginLook(id, x, y) { if (state.look || state.stickId === id) return false; state.look = { id, x, y }; return true; },
    lookDelta(id, x, y) { if (state.look?.id !== id) return null; const delta = { x: x - state.look.x, y: y - state.look.y }; state.look.x = x; state.look.y = y; return delta; },
    endLook(id) { if (state.look?.id === id) state.look = null; },
    reset() { state.stickId = null; state.look = null; move.x = move.y = 0; },
  };
  return state;
}
