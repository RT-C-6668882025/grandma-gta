// Independent pointer owners: move, look and act without stealing another finger.
import { holdKey, mouse, resetInput } from './input.js';
import { createTouchMotion, touchMove, stickSprint, touchLookDelta } from './touch-motion.js';
export function initTouch(canvas, state) {
  const root = document.createElement('div'); root.id = 'touchControls'; root.hidden = true;
  const primary = [['KeyJ','攻击'],['KeyE','互动'],['KeyG','投掷'],['KeyH','补药'],['Space','刹车'],['KeyR','换弹'],['KeyQ','扫描'],['ControlLeft','潜行'],['Digit3','切换']];
  const secondary = [['Digit1','枪械'],['Digit2','近战'],['KeyK','重击'],['KeyN','小镇经济'],['KeyV','飞行'],['PageUp','上升'],['PageDown','下降'],['KeyF','上下车'],['KeyQ','痞步'],['KeyR','电台'],['KeyX','抽烟'],['KeyB','槟榔'],['Space','骂人'],['KeyZ','视角回正']];
  const buttons = actions => actions.map(([key,label])=>`<button type="button" data-key="${key}">${label}</button>`).join('');
  root.innerHTML = `<div class="touch-tools">${buttons([['Escape','存档 / 菜单'],['Tab','背包'],['KeyT','手机'],['KeyM','地图']])}<button type="button" id="touchToggle">触控：开</button><button type="button" id="touchMore" aria-controls="touchMorePanel" aria-expanded="false">操作设置</button></div><div class="touch-play"><div id="touchStick" aria-label="移动摇杆"><i></i><span class="stick-label">前推冲刺</span></div><button type="button" id="touchSprint" data-key="ShiftLeft">冲刺</button><div class="touch-actions">${buttons(primary)}</div><div id="touchMorePanel" class="touch-more" hidden>${buttons(secondary)}</div></div><div class="touch-dance">${buttons([['ArrowLeft','←'],['ArrowUp','↑'],['ArrowDown','↓'],['ArrowRight','→']])}</div><div class="rotate-hint">横屏游玩 · 左手移动 · 右手滑动视角</div>`;
  document.body.append(root);
  const motion = createTouchMotion(touchMove), pad = root.querySelector('#touchStick'), knob = pad.querySelector('i');
  const toggle = root.querySelector('#touchToggle'), more = root.querySelector('#touchMore'), drawer = root.querySelector('#touchMorePanel');
  const buttonOwners = [];
  const read = (key, fallback, min, max) => { try { const v = Number(localStorage.getItem(key)); return v >= min && v <= max ? v : fallback; } catch { return fallback; } };
  let sensitivity = read('touch-sensitivity', .35, .1, 1), size = read('touch-size', 1, .8, 1.2);
  let enabled = navigator.maxTouchPoints > 0, controls = true, sprint = false, floating = false;
  motion.snap = true; root.style.setProperty('--touch-scale', size);
  const canPlay = () => controls && state().playing;
  const closeMore = () => { drawer.hidden = true; more.setAttribute('aria-expanded','false'); };
  const stopSprint = () => { sprint = false; holdKey('ShiftLeft','stick-sprint',false); pad.classList.remove('sprinting'); };
  const restorePad = () => { floating = false; pad.style.left = pad.style.top = pad.style.bottom = ''; knob.style.transform = ''; };
  const release = () => { motion.reset(); stopSprint(); buttonOwners.forEach(owners=>owners.clear()); resetInput(); restorePad(); root.querySelectorAll('.held').forEach(button=>button.classList.remove('held')); closeMore(); };
  const look = e => {
    const delta = motion.lookDelta(e.pointerId,e.clientX,e.clientY);
    if (!delta || !canPlay()) return;
    const d = touchLookDelta(delta.x,delta.y,sensitivity,Math.min(innerWidth,innerHeight));
    mouse.dx += d.x; mouse.dy += d.y;
  };
  root.querySelectorAll('[data-key]').forEach(button => {
    const code = button.dataset.key, owners = new Set(); buttonOwners.push(owners);
    button.addEventListener('pointerdown', e => {
      if (button.closest('.touch-play') && !canPlay()) return;
      e.preventDefault(); button.setPointerCapture(e.pointerId); owners.add(e.pointerId); button.classList.add('held');
      holdKey(code,e.pointerId,true);
      if (code === 'KeyJ') mouse.clickL = true;
      if (e.pointerType === 'touch' && ['KeyJ','KeyG'].includes(code)) motion.beginLook(e.pointerId,e.clientX,e.clientY);
    });
    button.addEventListener('pointermove',look);
    const up = e => { owners.delete(e.pointerId); holdKey(code,e.pointerId,false); motion.endLook(e.pointerId); button.classList.toggle('held',owners.size>0); };
    for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type,up);
  });
  const move = e => {
    const box = pad.getBoundingClientRect(), radius = box.width/2;
    const x = e.clientX-box.left-radius, y = e.clientY-box.top-radius;
    if (!motion.updateStick(e.pointerId,x,y,radius)) return;
    knob.style.transform = `translate(${touchMove.x*radius*.65/size}px, ${touchMove.y*radius*.65/size}px)`;
    sprint = !state().driving && stickSprint(x,y,radius,sprint);
    holdKey('ShiftLeft','stick-sprint',sprint); pad.classList.toggle('sprinting',sprint);
  };
  const beginStick = (e, float) => {
    if (!canPlay() || !motion.beginStick(e.pointerId)) return false;
    enabled = true; e.preventDefault();
    if (float) {
      const r = pad.getBoundingClientRect().width/2;
      const x = Math.max(r+12,Math.min(innerWidth*.45-r,e.clientX));
      const y = Math.max(innerHeight*.4+r,Math.min(innerHeight-r-12,e.clientY));
      // Scale around the top-left, matching the measured on-screen radius.
      pad.style.left = `${x-r}px`; pad.style.top = `${y-r}px`; pad.style.bottom = 'auto'; floating = true;
    }
    move(e); return true;
  };
  pad.addEventListener('pointerdown',e=>{ if (beginStick(e,false)) pad.setPointerCapture(e.pointerId); });
  pad.addEventListener('pointermove',move);
  const stop = e => { if (motion.endStick(e.pointerId)) { stopSprint(); restorePad(); } };
  for (const type of ['pointerup','pointercancel','lostpointercapture']) pad.addEventListener(type,stop);
  canvas.addEventListener('pointerdown',e=>{
    if (e.pointerType !== 'touch' || !canPlay()) return;
    enabled = true;
    if (e.clientX < innerWidth*.45 && e.clientY > innerHeight*.4) {
      if (beginStick(e,true)) canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (!motion.beginLook(e.pointerId,e.clientX,e.clientY)) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{ if (floating && e.pointerId === motion.stickId) move(e); else look(e); });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,e=>{ stop(e); motion.endLook(e.pointerId); });
  const settings = document.createElement('div'); settings.className = 'touch-settings';
  settings.innerHTML = `<label>视角灵敏度 <input id="touchSensitivity" type="range" min="0.1" max="1" step="0.05" value="${sensitivity}"></label><label>按键大小 <input id="touchSize" type="range" min="0.8" max="1.2" step="0.05" value="${size}"></label><p>左下任意处起摇杆 · 前推外圈冲刺<br>攻击键可拖动视角 · 长按连续攻击</p>`;drawer.append(settings);
  settings.querySelector('#touchSensitivity').oninput = e => { sensitivity = Number(e.target.value); try { localStorage.setItem('touch-sensitivity',sensitivity); } catch {} };
  settings.querySelector('#touchSize').oninput = e => { motion.reset(); stopSprint(); restorePad(); size = Number(e.target.value); root.style.setProperty('--touch-scale',size); try { localStorage.setItem('touch-size',size); } catch {} };
  more.onclick = () => { if (!canPlay()) return; drawer.hidden = !drawer.hidden; more.setAttribute('aria-expanded',String(!drawer.hidden)); };
  toggle.onclick = () => { controls = !controls; release(); toggle.textContent = `触控：${controls?'开':'关'}`; };
  addEventListener('blur',release); addEventListener('resize',release);
  document.addEventListener('visibilitychange',()=>{ if(document.hidden) release(); });
  let wasPlaying = false, wasDriving = null;
  return () => {
    const s = state(); motion.snap = !s.driving;
    if (wasPlaying && !s.playing) release(); wasPlaying = s.playing;
    root.hidden = !enabled || !s.active; root.classList.toggle('controls-off',!controls); root.classList.toggle('blocked',!s.playing); root.classList.toggle('dancing',s.dancing);root.classList.toggle('combat-mode',!!s.combat);
    if (wasDriving !== !!s.driving) { wasDriving = !!s.driving; stopSprint(); root.classList.toggle('driving',wasDriving); }
    root.querySelector('.touch-actions [data-key="KeyE"]').textContent = s.driving ? '下车' : s.interaction || '互动';
    for(const [key,label] of [['KeyG',s.combat?'瞄准 / 格挡':'投掷'],['Space',s.combat?'闪避':'刹车'],['KeyE',s.combat?'操作 / 处置':s.driving?'下车':s.interaction||'互动']]){const button=root.querySelector('.touch-actions [data-key="'+key+'"]');if(button)button.textContent=label;}
    for(const key of ['KeyR','Digit1','Digit2','KeyQ','KeyK','ControlLeft','Digit3']){const button=root.querySelector('.touch-actions [data-key="'+key+'"]');if(button)button.hidden=!s.combat;}
    for(const key of ['Digit1','Digit2','KeyK','KeyQ','KeyR','Space']){const button=root.querySelector('.touch-more [data-key="'+key+'"]');if(button)button.hidden=['Digit1','Digit2','KeyK'].includes(key)?!s.combat:!!s.combat;}
    for(const [key,label] of [['ControlLeft',s.crouched?'起身':'潜行'],['KeyQ',s.scanning?'退出扫描':'扫描']]){const button=root.querySelector('.touch-actions [data-key="'+key+'"]');if(button)button.textContent=label;}
    document.body.classList.toggle('touch-device',enabled&&s.active);
    document.body.classList.toggle('touch-layout',enabled&&controls&&s.active);
  };
}
