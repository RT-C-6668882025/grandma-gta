// Independent pointer owners allow movement, camera and actions at the same time.
import { holdKey, mouse, resetInput } from './input.js';
import { createTouchMotion, touchMove } from './touch-motion.js';
export function initTouch(canvas, state) {
  const root = document.createElement('div');
  root.id = 'touchControls'; root.hidden = true;
  const primary = [['KeyJ','攻擊'],['KeyE','互動'],['KeyF','上下車'],['ShiftLeft','奔跑'],['Space','罵人'],['KeyG','投擲']];
  const secondary = [['KeyN','小鎮經濟'],['KeyV','飛行'],['PageUp','上升'],['PageDown','下降'],['KeyH','補藥'],['KeyQ','痞步'],['KeyR','電台'],['KeyX','抽菸'],['KeyB','檳榔'],['KeyZ','視角回正']];
  const buttons = actions => actions.map(([key,label])=>`<button type="button" data-key="${key}">${label}</button>`).join('');
  root.innerHTML = `<div class="touch-tools">${buttons([['Escape','暫停'],['Tab','背包'],['KeyT','手機'],['KeyM','地圖']])}<button type="button" id="touchToggle">觸控：開</button><button type="button" id="touchMore" aria-controls="touchMorePanel" aria-expanded="false">更多</button></div><div class="touch-play"><div id="touchStick" aria-label="移動搖桿"><i></i></div><div class="touch-actions">${buttons(primary)}</div><div id="touchMorePanel" class="touch-more" hidden>${buttons(secondary)}</div></div><div class="touch-dance">${buttons([['ArrowLeft','←'],['ArrowUp','↑'],['ArrowDown','↓'],['ArrowRight','→']])}</div><div class="rotate-hint">建議橫屏 · 左側移動，滑動畫面轉視角</div>`;
  document.body.append(root);
  const motion = createTouchMotion(touchMove), pad = root.querySelector('#touchStick'), knob = pad.querySelector('i');
  const more = root.querySelector('#touchMore'), drawer = root.querySelector('#touchMorePanel');
  const buttonOwners = [];
  let enabled = navigator.maxTouchPoints > 0, controls = true;
  const closeMore = () => { drawer.hidden = true; more.setAttribute('aria-expanded','false'); };
  const release = () => { motion.reset(); buttonOwners.forEach(owners=>owners.clear()); resetInput(); knob.style.transform = ''; root.querySelectorAll('.held').forEach(button=>button.classList.remove('held')); closeMore(); };
  root.querySelectorAll('[data-key]').forEach(button => {
    const code = button.dataset.key, owners = new Set(); buttonOwners.push(owners);
    button.addEventListener('pointerdown', e => {
      if (button.closest('.touch-play') && !state().playing) return;
      e.preventDefault(); button.setPointerCapture(e.pointerId); owners.add(e.pointerId); button.classList.add('held');
      holdKey(code,e.pointerId,true);
      if (code === 'KeyJ') mouse.clickL = true;
    });
    const up = e => { owners.delete(e.pointerId); holdKey(code,e.pointerId,false); button.classList.toggle('held',owners.size>0); };
    for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type,up);
  });
  const move = e => {
    const box = pad.getBoundingClientRect(), radius = box.width/2;
    if (motion.updateStick(e.pointerId,e.clientX-box.left-radius,e.clientY-box.top-radius,radius))
      knob.style.transform = `translate(${touchMove.x*radius*.65}px, ${touchMove.y*radius*.65}px)`;
  };
  pad.addEventListener('pointerdown',e=>{ if (!state().playing || !motion.beginStick(e.pointerId)) return; enabled=true;e.preventDefault();pad.setPointerCapture(e.pointerId);move(e); });
  pad.addEventListener('pointermove',move);
  const stop = e => { if (motion.endStick(e.pointerId)) knob.style.transform=''; };
  for (const type of ['pointerup','pointercancel','lostpointercapture']) pad.addEventListener(type,stop);
  canvas.addEventListener('pointerdown',e=>{
    if (e.pointerType!=='touch' || !state().playing || !motion.beginLook(e.pointerId,e.clientX,e.clientY)) return;
    enabled=true;e.preventDefault();canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{ const delta=motion.lookDelta(e.pointerId,e.clientX,e.clientY);if(delta && state().playing){mouse.dx+=delta.x;mouse.dy+=delta.y;} });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,e=>motion.endLook(e.pointerId));
  more.onclick=()=>{ if(!state().playing || !controls)return;drawer.hidden=!drawer.hidden;more.setAttribute('aria-expanded',String(!drawer.hidden)); };
  root.querySelector('#touchToggle').onclick=()=>{controls=!controls;release();root.querySelector('#touchToggle').textContent=`觸控：${controls?'開':'關'}`;};
  addEventListener('blur',release);addEventListener('resize',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  let wasPlaying=false, wasDriving=null;
  return ()=>{
    const s=state();if(wasPlaying && !s.playing)release();wasPlaying=s.playing;
    root.hidden=!enabled||!s.active;root.classList.toggle('controls-off',!controls);root.classList.toggle('blocked',!s.playing);root.classList.toggle('dancing',s.dancing);
    if(wasDriving!==!!s.driving){wasDriving=!!s.driving;root.querySelector('[data-key="KeyF"]').textContent=s.driving?'下車':'上車';root.querySelector('[data-key="Space"]').textContent=s.driving?'剎車 / 喇叭':'罵人';}
    document.body.classList.toggle('touch-layout',enabled&&controls&&s.active);
  };
}
