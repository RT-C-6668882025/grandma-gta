// All touch controls feed the same input state as the keyboard and mouse.
import { holdKey, mouse, resetInput } from './input.js';
export function initTouch(canvas, state) {
  const root = document.createElement('div');
  root.id = 'touchControls';
  root.hidden = true;
  const actions = [['KeyJ','攻擊'],['KeyE','互動'],['KeyF','上下車'],['ShiftLeft','奔跑'],['Space','剎車 / 罵人'],['KeyG','投擲'],['KeyR','電台'],['KeyQ','痞步'],['KeyH','補藥'],['KeyX','抽菸'],['KeyB','檳榔']];
  root.innerHTML = `<div class="touch-tools">${[['Escape','暫停 / 返回'],['Tab','背包'],['KeyT','手機'],['KeyM','地圖']].map(([k,l]) => `<button data-key="${k}">${l}</button>`).join('')}<button id="touchToggle">觸控：開</button><button id="touchFull">全螢幕</button></div><div class="touch-play"><div id="touchStick" aria-label="移動搖桿"><i></i></div><div class="touch-actions">${actions.map(([k,l]) => `<button data-key="${k}">${l}</button>`).join('')}</div></div><div class="touch-dance">${[['ArrowLeft','←'],['ArrowUp','↑'],['ArrowDown','↓'],['ArrowRight','→']].map(([k,l]) => `<button data-key="${k}">${l}</button>`).join('')}</div><div class="rotate-hint">橫屏遊玩，左側移動 · 滑動畫面轉視角</div>`;
  document.body.append(root);
  let enabled = navigator.maxTouchPoints > 0, controls = true, look = null, stick = null;
  const release = () => { look = stick = null; resetInput(); root.querySelector('#touchStick i').style.transform = ''; root.querySelectorAll('.held').forEach(b => b.classList.remove('held')); };
  root.querySelectorAll('[data-key]').forEach(button => {
    const code = button.dataset.key;
    button.addEventListener('pointerdown', e => {
      if (button.closest('.touch-play') && !state().playing) return;
      e.preventDefault(); button.setPointerCapture(e.pointerId); button.classList.add('held');
      holdKey(code, e.pointerId, true);
      if (code === 'KeyJ') mouse.clickL = true; // newspaper delivery also uses clickL
    });
    const up = e => { holdKey(code, e.pointerId, false); button.classList.remove('held'); };
    for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type, up);
  });
  const pad = root.querySelector('#touchStick'), knob = pad.querySelector('i');
  const move = e => {
    if (stick !== e.pointerId) return;
    const box = pad.getBoundingClientRect(), radius = box.width / 2;
    const x = (e.clientX - box.left - radius) / radius, y = (e.clientY - box.top - radius) / radius;
    const length = Math.max(1, Math.hypot(x,y));
    knob.style.transform = `translate(${x / length * radius * .65}px, ${y / length * radius * .65}px)`;
    for (const [key,on] of [['KeyW', y < -.22],['KeyS',y > .22],['KeyA',x < -.22],['KeyD',x > .22]]) holdKey(key, 'stick', on);
  };
  pad.addEventListener('pointerdown', e => { if (!state().playing || stick !== null) return; e.preventDefault(); stick = e.pointerId; pad.setPointerCapture(stick); move(e); });
  pad.addEventListener('pointermove', move);
  const stop = e => { if (stick !== e.pointerId) return; stick = null; knob.style.transform = ''; for (const key of ['KeyW','KeyS','KeyA','KeyD']) holdKey(key,'stick',false); };
  for (const type of ['pointerup','pointercancel','lostpointercapture']) pad.addEventListener(type,stop);
  canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' || !state().playing || look) return; enabled = true; e.preventDefault(); look = { id:e.pointerId, x:e.clientX, y:e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (look?.id !== e.pointerId) return; if (state().playing) { mouse.dx += e.clientX - look.x; mouse.dy += e.clientY - look.y; } look.x = e.clientX; look.y = e.clientY; });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type, e => { if (look?.id === e.pointerId) look = null; });
  root.querySelector('#touchToggle').onclick = () => { controls = !controls; release(); root.querySelector('#touchToggle').textContent = `觸控：${controls ? '開' : '關'}`; };
  root.querySelector('#touchFull').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else { await document.documentElement.requestFullscreen(); try { await screen.orientation?.lock('landscape'); } catch {} } } catch { state().toast('此瀏覽器不支援全螢幕，請手動橫屏'); } };
  addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  let wasPlaying = false;
  return () => {
    const s = state();
    if (wasPlaying && !s.playing) release();
    wasPlaying = s.playing;
    root.hidden = !enabled || !s.active;
    root.classList.toggle('controls-off', !controls);
    root.classList.toggle('blocked', !s.playing);
    root.classList.toggle('dancing', s.dancing);
    document.body.classList.toggle('touch-layout', enabled && controls && s.active);
  };
}
