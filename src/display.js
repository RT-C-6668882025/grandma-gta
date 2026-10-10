import { mouse, getMouseMode, setMouseMode, unlock, resetInput } from './input.js';
import { toggleFullscreen } from './fullscreen.js';
export function initDisplay(canvas, state) {
  const full = document.getElementById('fullscreenButton'), mode = document.getElementById('mouseMode');
  const help = document.getElementById('fullscreenHelp'), cursor = document.getElementById('gameCursor'), aim = document.getElementById('aimMarker');
  document.getElementById('openGameTab').href = location.href;
  document.getElementById('closeFullscreenHelp').onclick = () => help.close();
  const labels = { free: '移動轉視角', drag: '右鍵拖曳', lock: '鎖定視角' };
  const label = () => { mode.textContent = `滑鼠：${labels[getMouseMode()]}`; };
  label();
  mode.onclick = () => { const modes = ['free', 'drag', 'lock']; setMouseMode(modes[(modes.indexOf(getMouseMode()) + 1) % modes.length]); label(); };
  full.onclick = async () => {
    // Fullscreen needs the original click's activation. Do not await other work first.
    try { await toggleFullscreen(); }
    catch (error) { unlock(); resetInput(); document.getElementById('fullscreenReason').textContent = error.message; help.showModal(); }
  };
  for (const event of ['fullscreenchange','webkitfullscreenchange']) document.addEventListener(event, () => {
    full.textContent = document.fullscreenElement || document.webkitFullscreenElement ? '退出全螢幕' : '全螢幕';
  });
  let overCanvas = false, hasMouse = false;
  const trackCursor = e => {
    if ((e.pointerType && e.pointerType !== 'mouse') || e.sourceCapabilities?.firesTouchEvents) return;
    hasMouse = true; overCanvas = e.target === canvas;
    cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px';
  };
  addEventListener('pointermove', trackCursor);
  addEventListener('mousemove', trackCursor);
  canvas.addEventListener('pointerleave', () => { overCanvas = false; });
  addEventListener('blur', () => { overCanvas = false; });
  return () => {
    label();
    const playing = state().playing && !help.open;
    const showCursor = playing && !mouse.locked && hasMouse && overCanvas;
    cursor.hidden = !showCursor; canvas.style.cursor = showCursor ? 'none' : 'default';
    aim.hidden = !playing || !mouse.locked;
    if (help.open) resetInput();
  };
}
