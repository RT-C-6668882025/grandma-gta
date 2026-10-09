// Keyboard + mouse. Pointer lock while playing; without it, dragging turns the camera.

export const keys = new Set();
export const pressed = new Set(); // edge-triggered this frame
export const mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false, clickL: false, locked: false };
let el = null;
let dragging = false;
let lockFailed = false;
const touchKeys = new Map();
export function holdKey(code, source, held) {
  if (!touchKeys.has(code)) touchKeys.set(code, new Set());
  const owners = touchKeys.get(code);
  if (held) { if (!down(code)) pressed.add(code); owners.add(source); }
  else owners.delete(source);
}
export function resetInput() {
  keys.clear(); pressed.clear(); touchKeys.clear(); dragging = false;
  mouse.left = mouse.right = mouse.clickL = false;
  mouse.dx = mouse.dy = mouse.wheel = 0;
}
export let uiBlocking = () => false;
export function setUiBlocking(fn) { uiBlocking = fn; }

export function initInput(canvas) {
  el = canvas;
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    const k = e.code;
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', resetInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });
  document.addEventListener('pointerlockerror', () => { lockFailed = true; dragging = false; });
  canvas.addEventListener('mousedown', (e) => {
    if (uiBlocking() || e.sourceCapabilities?.firesTouchEvents) return;
    if (!canvas.requestPointerLock) lockFailed = true;
    // embedded views (the app's browser pane, some iframes) refuse pointer lock:
    // then left = attack and right-drag turns the camera
    if (lockFailed) {
      if (e.button === 0) { mouse.left = true; mouse.clickL = true; }
      if (e.button === 2) { mouse.right = true; dragging = true; }
      return;
    }
    if (!mouse.locked && e.button === 0) {
      try { const r = canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => { lockFailed = true; }); } catch (err) { lockFailed = true; }
      dragging = true;
      return;
    }
    if (e.button === 0) { mouse.left = true; mouse.clickL = true; }
    if (e.button === 2) { mouse.right = true; dragging = true; }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) { mouse.left = false; if (!lockFailed) dragging = false; }
    if (e.button === 2) { mouse.right = false; dragging = false; }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (!uiBlocking() && (mouse.locked || dragging)) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  });
  canvas.addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerlockchange', () => { mouse.locked = document.pointerLockElement === el; });
}
export function unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
export function endFrame() {
  pressed.clear();
  mouse.dx = mouse.dy = mouse.wheel = 0;
  mouse.clickL = false;
}
export const down = (...codes) => codes.some((c) => keys.has(c) || (touchKeys.get(c)?.size || 0) > 0);
export const hit = (...codes) => codes.some((c) => pressed.has(c));
