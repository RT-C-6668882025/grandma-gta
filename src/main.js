import { MOD, setPower, applyPowers } from './mods.js';
import { CAMERA_LABELS } from './camera-modes.js';
// 阿嬤俠盜：田庄大亂鬥 — bootstrap and main loop.

import * as THREE from 'three';
import { buildTerrain, heightAt } from './world/terrain.js';
import { buildTown, lamps, doors } from './world/town.js';
import { dressTown, loadPropModels } from './world/props.js';
import { buildStreet, tickStreet, signals, lightState } from './world/street.js';
import { Sky, DAY_SECONDS } from './world/sky.js';
import { NIGHT } from './world/kit.js';
import { P } from './world/layout.js';
import { loadActors } from './actor.js';
import { loadGear, ITEMS } from './gear.js';
import { env, ents, animals, Player, setScene, separate, tickProjectiles, tickPickups, loadAnimals, spawnPickup } from './entities.js';
import { loadVehicles, vehicles, setVehicleScene, tickTraffic, setSignals } from './vehicles.js';
import { WX, STATES, tickWeather, setWeather, buildRain, onThunderCb } from './weather.js';
import { initFx, tickFx, fx, addEmitter } from './fx.js';
import { buildGrass } from './grass.js';
import { buildBirds } from './birds.js';
import { initInput, keys, mouse, hit, down, endFrame, setUiBlocking, unlock, pollMouseLook } from './input.js';
import { initDisplay } from './display.js';
import { initTouch } from './touch.js';
import { touchMove, mixMovement } from './touch-motion.js';
import { OrbitCam } from './camera.js';
import { ui, blips } from './ui.js';
import { G, on, emit, load, save, newGame, hasSave, give, equip, addWanted, count, spend } from './game.js';
import { initStory, tickStory, interactables, nextMission, npcs, inputLocked, phoneMenu, useItem, onPickup, missionThrow, danceKey, dance, bark, say } from './story.js';
import { Audio, STATIONS } from './audio.js';
import { clamp, damp } from './util.js';
import { createLawSystem } from './law.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: q.has('shots') });
const qualityPresets = { low: { ratio: .9, shadows: false }, medium: { ratio: 1.15, shadows: false }, high: { ratio: 1.5, shadows: true } };
let quality = navigator.maxTouchPoints > 0 ? 'medium' : 'high';
try { const saved = localStorage.getItem('ama-quality'); if (qualityPresets[saved]) quality = saved; } catch {}
let prMax = Math.min(devicePixelRatio, +(q.get('pr') || qualityPresets[quality].ratio));
renderer.setPixelRatio(prMax);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = qualityPresets[quality].shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 2400);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
setScene(scene);
setVehicleScene(scene);

const loadmsg = document.getElementById('loadmsg');
const startButtons = ['bNew', 'bCont'].map(id => document.getElementById(id));
startButtons.forEach(button => { button.disabled = true; });
addEventListener('model-progress', ({ detail }) => {
  if (mode === 'loading') loadmsg.textContent = `載入模型 ${detail.completed}/${detail.requested} · 已讀取 ${(detail.bytes / 1048576).toFixed(1)} MB（下載過的模型會保留在本機）`;
});
const tick = () => new Promise((r) => setTimeout(r, 0));
let player = null, sky = null, orbit = null, rain = null, grass = null, birds = null;
const audio = new Audio();
const law = createLawSystem();
let mode = 'loading', hudT = 0, saveT = 0, time = 0, stepDist = 0, dt = 0;
const lights = [];
const ctx = { get time() { return time; }, get dt() { return dt; }, audio, scene, fade: (on) => ui.fade(on), openBackpack: () => openBackpack() };

async function boot() {
  loadmsg.textContent = '正在鋪柏油路、插秧……';
  await tick();
  const assets = Promise.all([
    loadActors(['ama', 'agong', 'son', 'shopkeeper', 'thug', 'police', 'auntie', 'farmer', 'qipao', 'jinya', 'oldman', 'man2', 'aunt2', 'thug2']),
    loadGear(), loadVehicles(), loadAnimals(),
    loadPropModels(['banyan'], 'nature'),
    loadPropModels(['vegstall', 'foodcart', 'stools', 'speaker', 'gascan', 'shelf', 'fridge', 'betelstand', 'fitness', 'hoop', 'judges', 'drumstool', 'temple', 'karaoke', 'calldesk']),
    loadPropModels(['radio', 'newspaper', 'trophy'], 'gear'),
  ]);
  const { paint } = buildTerrain(scene);
  loadmsg.textContent = '正在蓋騎樓、掛招牌……';
  await tick();
  await loadPropModels(['banyan'], 'nature');  // before the town so it can skip the procedural trees it replaces; add 'palm' / 'banana' / 'bamboo' once those GLBs exist
  buildTown(scene);
  buildStreet(scene);
  setSignals(signals, lightState);
  sky = new Sky(scene, renderer);
  ui.init();
  loadmsg.textContent = '正在叫醒番薯寮的阿公阿嬤……';
  await assets;
  await dressTown(scene);
  initFx(scene, renderer);
  rain = buildRain(scene);
  grass = buildGrass(scene, scene.getObjectByName('terrain').material.map);
  birds = buildBirds(scene);
  onThunderCb((v) => audio.play('thunder', v));
  for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffd8a0, 0, 22, 1.6); scene.add(l); lights.push(l); }
  orbit = new OrbitCam(camera);
  ctx.orbit = orbit; ctx.sky = sky;
  initInput(canvas);
  setUiBlocking(() => ui.blocking || mode !== 'play');
  document.getElementById('bCont').classList.toggle('hidden', !hasSave());
  loadmsg.textContent = '';
  mode = 'title';
  startButtons.forEach(button => { button.disabled = false; });
  document.getElementById('bNew').onclick = () => start(false);
  document.getElementById('bCont').onclick = () => start(true);
  if (q.has('autostart')) start(q.get('autostart') === 'continue');
}

async function start(cont) {
  if (mode !== 'title') return;
  mode = 'starting';
  startButtons.forEach(button => { button.disabled = true; });
  loadmsg.textContent = '正在準備遊戲……';
  await tick();
  law.reset();
  audio.start();
  if (cont) load(); else newGame();
  if (q.has('rich')) { G.money = 20000; }
  if (q.has('story')) G.story = +q.get('story');
  sky.hour = G.hour || 6.2;
  setWeather(G.weather || 'clear', true);
  const s = G.pos || { x: P.home.x - 1, z: P.home.z + 2 };
  if (player) { if (player.veh) exitVehicle(); player.remove(); }  // starting again must not leave a stale player in the world
  player = new Player(s.x, s.z, G.heading ?? Math.PI);
  ctx.player = player;
  setPower('fly', false);
  applyPowers(player, G);
  await initStory(ctx);
  orbit.yaw = player.heading + Math.PI;
  document.getElementById('title').classList.add('hidden');
  ui.show(true);
  mode = 'play';
  loadmsg.textContent = '';
  startButtons.forEach(button => { button.disabled = false; });
  audio.setRadio(false, G.radio);
  if (!q.has('nostory')) setTimeout(() => nextMission(), 600);
}

// ------------------------------------------------------------------ events
on('money', (n, why) => { if (n > 0) ui.toast(`+NT$${n}${why ? ' · ' + why : ''}`, 'money'); });
on('toast', (m, bad) => ui.toast(m, bad));
on('equip', () => player?.applyGear());
on('voice', (id) => bark(id));
on('fx', (kind, p) => {
  if (kind === 'wisp') fx.wisp(p);
  else if (kind === 'puff') fx.puff(p, player.actor.fwdAxis());
  else if (kind === 'spit') fx.spit(p, player.actor.fwdAxis());
  else if (kind === 'fireworks') fx.fireworks(p);
});
on('sfx', (n, pos) => {
  if (pos && (n === 'hit' || n === 'bonk' || n === 'slap')) fx.impact({ x: pos.x, y: pos.y + 1.2, z: pos.z });
  let v = 1;
  if (pos && player) v = clamp(1 - player.pos.distanceTo(pos) / 40, 0, 1);
  if (v > 0.02) audio.play(n, v);
});
on('shake', (s) => { if (orbit) orbit.shake = Math.max(orbit.shake, s); });
on('playerHurt', () => { orbit.shake = Math.max(orbit.shake, 0.5); if (Math.random() < 0.3) bark(Math.random() < 0.5 ? 'hurt1' : 'hurt2'); });
on('save', () => doSave());
// hitting innocent people raises the gossip level
let civHits = 0;
on('civilianHit', (n) => {
  if (n.role === 'thug' || n.role === 'cop' || n.hostile) return;
  civHits++;
  if (Math.random() < 0.5) bark(Math.random() < 0.5 ? 'npc_hit1' : 'npc_hit2');
  if (civHits % 2 === 0 || G.wanted === 0) addWanted(1, '打路人');
  for (const a of animals) if (a.distTo(n) < 10) a.scare();
});
on('hit', (e, attacker) => { if (e.role === 'cop' && attacker === player) { addWanted(1, '打警察'); } });
on('damage', (victim, attacker, kind) => law.recordHit(victim, attacker, kind));
on('runOver', (e) => { if (e.role !== 'thug') addWanted(1, '撞人'); });
on('ko', (e) => { if (e.role === 'thug' && Math.random() < 0.7) spawnPickup('cash', e.pos.x + 0.6, e.pos.z, { amount: 30 + Math.floor(Math.random() * 60) }); });
on('wanted', (n, before) => {
  if (n > before) { audio.play('whistle'); ui.toast(`八卦值 ${'📢'.repeat(n)}：全村都在講妳！`, true); if (n >= 2 && before < 2) bark('cop_warn'); }
  else if (n === 0 && before > 0) { ui.toast('大家已經講別的八卦了。八卦值清除。'); }
});
on('carCrash', (a, b, rel) => {
  for (const v of [a, b]) { v.damage(rel * 2.2); }
  if (player && (a === player.veh || b === player.veh)) { orbit.shake = Math.max(orbit.shake, Math.min(1, rel / 10)); audio.play('crash', Math.min(1, rel / 12)); }
});

// ------------------------------------------------------------------ vehicles: enter / exit / carjack
function nearestVehicle() {
  let best = null, bd = 3.2;
  for (const v of vehicles) {
    const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z) - v.def.len * 0.35;
    if (d < bd && !v.broken) { bd = d; best = v; }
  }
  return best;
}
function enterVehicle(v) {
  if (v.passenger && v.passenger.role !== 'fare') v.passenger.unride(false);
  if (v.driver) {
    // 搶車!
    const d = v.driver;
    d.unride(true);
    d.state = Math.random() < 0.5 && d.brave ? 'fight' : 'flee'; d.target = player; d.fleeT = 10; d.lastHitBy = null;
    d.role = 'ped';
    v.ai = null;
    G.stats.stolen++;
    bark(Math.random() < 0.5 ? 'carjack1' : 'carjack2');
    addWanted(1, '搶車');
    audio.play('door');
  } else if (v.owner !== 'ama' && !v.def.pedal && !v.claimed) { v.claimed = true; if (Math.random() < 0.35 && G.wanted === 0) addWanted(1, '偷車'); }
  v.ai = null; v.parked = false;
  player.ride(v);
  if (v.def.radio) { audio.setRadio(true, G.radio); audio.radioTone(v.def.car); ui.radioPop(G.radio); }
  ui.help(`<b>${v.def.name}</b>：<kbd>W/S</kbd> 油門 / 倒車 · <kbd>A/D</kbd> 轉向 · <kbd>空白鍵</kbd> 剎車${v.def.pedal ? ' / 按鈴' : ' / 喇叭'}${v.def.radio ? ' · <kbd>R</kbd> 換電台' : ''} · <kbd>F</kbd> 下車`, 6);
}
function exitVehicle() {
  const v = player.veh;
  player.unride();
  v.speed *= 0.3;
  audio.setRadio(false); audio.engineSet('car', 0, false);
}

// ------------------------------------------------------------------ backpack
function openBackpack() {
  unlock();
  ui.backpack({ equip: (s, id) => { equip(s, id); audio.play('pickup'); }, use: (id) => useItem(id) });
}

// ------------------------------------------------------------------ cops
let copT = 0, lostT = 0, bustT = 0;
function tickWanted(dt) {
  const dispatches = law.tick(dt, ents, player, G.wanted, env.truce);
  const intervention = dispatches.find(({ cop, target }) => target !== player && cop.distTo(player) < 40);
  if (intervention) {
    audio.play('whistle', 0.7);
    ui.toast(`${intervention.cop.name}正在制止${intervention.target.name}鬧事。`);
  }
  const cops = ents.filter((e) => e.role === 'cop');
  if (G.wanted > 0) {
    // enough cops for the heat: an old cop on foot per star (max 3)
    const want = Math.min(3, G.wanted);
    copT -= dt;
    if (cops.length < want && copT <= 0) {
      copT = 8;
      const b = orbit.basis();
      const x = player.pos.x - b.f.x * 45 + (Math.random() - 0.5) * 20, z = player.pos.z - b.f.z * 45;
      import('./entities.js').then(({ NPC }) => { const c = new NPC('police', x, z, { role: 'cop', name: '警察', hp: 60, dmg: 9, brave: true }); c.state = 'fight'; c.target = player; });
    }
    let seen = false;
    for (const c of cops) {
      if (c.down) continue;
      const d = c.distTo(player);
      if (d < 38) seen = true;
    }
    lostT = seen ? 0 : lostT + dt;
    if (lostT > 14) { lostT = 0; addWanted(-1, 'lost'); if (!G.wanted) bark('wanted_lost'); }
  }
  for (const c of cops) {
    if (c === npcs.cop || c.state === 'fight' || c.down || c.returningToStation) continue;
    c.returningToStation = true; c.state = 'walk'; c.goal = [P.police.x, 8]; c.stateT = 30;
    setTimeout(() => { c.returningToStation = false; if (c.state !== 'fight' && G.wanted === 0) c.remove(); }, 30000);
  }
}
// knocked out: wake up at the clinic (or the police box if wanted), pay up
let koT = 0;
function tickPlayerDown(dt) {
  if (!player.down) { koT = 0; return; }
  player.stayDown = true;
  koT += dt;
  if (koT > 1.2 && koT - dt <= 1.2) ui.fade(true, G.wanted ? '被抓回派出所' : '阿嬤昏倒了');
  if (koT > 4) {
    const busted = G.wanted > 0;
    const fee = busted ? 150 * G.wanted : 200;
    const paid = Math.min(G.money, fee);
    G.money -= paid;
    const at = busted ? { x: P.police.x, z: 9 } : { x: P.clinic.x, z: 9 };
    if (player.veh) player.unride();
    player.pos.set(at.x, 0, at.z);
    player.stayDown = false; player.wake(); player.hp = 70;
    G.wanted = 0; emit('wanted', 0, 1);
    for (const e of ents) if (e.target === player && e.state === 'fight') { e.state = 'idle'; e.target = null; }
    ui.fade(false);
    ui.toast(busted ? `在派出所被唸了一頓，罰款 NT$${paid}。` : `仁愛診所打了一針，醫藥費 NT$${paid}。`, true);
    import('./story.js').then((s) => { if (s.missionInfo().running) { s.abortMission(); setTimeout(() => nextMission(), 4000); } });
  }
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let prNow = prMax, frAcc = 0, frN = 0;
const updateTouch = initTouch(canvas, () => ({ active: mode === 'play', playing: mode === 'play' && !ui.open && !inputLocked() && !dance.on && !player?.down, dancing: dance.on && !ui.open, driving: !!player?.veh, toast: message => ui.toast(message) }));
const updateDisplay = initDisplay(canvas, () => ({ playing: mode === 'play' && !ui.open && !inputLocked() && !dance.on }));
function frame() {
  updateDisplay();
  updateTouch();
  requestAnimationFrame(frame);
  const d = clock.getDelta();
  step(Math.min(d, 0.05));
  renderer.render(scene, camera);
  if (mode === 'play' && !q.has('pr')) {
    frAcc += d; frN++;
    if (frAcc > 2.5) {
      const avg = frAcc / frN;
      if (avg > 0.021 && prNow > 0.75) { prNow = Math.max(0.75, prNow - 0.15); renderer.setPixelRatio(prNow); }
      else if (avg < 0.0135 && prNow < prMax) { prNow = Math.min(prMax, prNow + 0.1); renderer.setPixelRatio(prNow); }
      frAcc = 0; frN = 0;
    }
  }
}
function step(d) {
  dt = d; time += d;
  if (mode === 'loading' || mode === 'starting') { endFrame(); return; }
  if (mode === 'title') {
    const a = time * 0.05;
    camera.position.set(-20 + Math.cos(a) * 60, 22, -10 + Math.sin(a) * 60);
    camera.lookAt(-20, 4, -10);
    tickWeather(d, sky.hour, time);
    sky.update(d, camera.position, false, WX);
    tickWorld(d, camera.position);
    endFrame();
    return;
  }
  applyPowers(player, G);
  // ---------- global keys
  if (hit('KeyO')) { if (ui.open) ui.close(); else openPowers(); }
  if (!ui.open && hit('KeyV')) { if (player.veh) exitVehicle(); setPower('fly', !MOD.fly); player.diving = null; ui.toast(MOD.fly ? '飛行開啟：PageUp 上升，PageDown 下降' : '飛行關閉'); }
  if (hit('Escape')) { if (ui.open) ui.close(); else { unlock(); ui.panel('暫停', pauseHtml(), bindPause); } }
  if (ui.open === 'dialog' || ui.open === 'phone') for (let n = 1; n <= 9; n++) if (hit('Digit' + n)) ui.dialogKey(n);
  if (dance.on) for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'KeyA', 'KeyW', 'KeyD', 'KeyS']) if (hit(k)) danceKey(k);
  const locked = inputLocked() || dance.on;
  if (!ui.open && !locked) {
    if (hit('Tab', 'KeyI')) openBackpack();
    else if (hit('KeyT')) { unlock(); audio.play('phone'); phoneMenu(); }
    else if (hit('KeyM')) { unlock(); ui.bigmap(player); }
  } else if (ui.open === 'map' && hit('KeyM')) ui.close();
  else if (ui.open === 'panel' && hit('Tab', 'KeyI')) ui.close();
  const playing = !ui.open && !locked && !player.down;
  if (playing && hit('KeyC')) switchCamera();
  if (!ui.open && !locked) {
    pollMouseLook(d);
    orbit.input(mouse.dx, mouse.dy, mouse.wheel);
    if (playing && hit('KeyZ')) orbit.recenter(player.veh ? player.veh.heading : player.heading);
  }
  const { f, r } = orbit.basis();
  const { fw, rt } = mixMovement((down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0),
    (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0), touchMove, playing);
  // ---------- vehicle / on foot
  const v = player.veh;
  if (playing && hit('KeyF')) {
    if (v) exitVehicle();
    else { const nv = nearestVehicle(); if (nv) enterVehicle(nv); }
  }
  if (v && player.veh) {
    const thr = fw, steer = -rt;
    v.drive(d, { throttle: thr, steer, brake: playing && down('Space') });
    if (playing && hit('Space') && Math.abs(v.speed) < 3) audio.play(v.def.pedal ? 'bell' : v.def.horn || 'honk');
    if (playing && hit('KeyR') && v.def.radio) { G.radio = (G.radio + 1) % STATIONS.length; audio.setRadio(true, G.radio); ui.radioPop(G.radio); }
    const imp = v.collide();
    if (imp > 3) { v.damage(imp * 3); audio.play('crash', Math.min(1, imp / 10)); orbit.shake = Math.max(orbit.shake, Math.min(1, imp / 8)); emit('carCrash', v, v, 0); }
    if (v.skid > 0.5 && Math.random() < d * 6) { audio.play('skid', 0.6); fx.dust(v.pos, 2, 1.2); }
    v.sync(d);
    audio.engineSet(v.def.car ? 'car' : v.def.electric ? 'electric' : v.type === 'scooter' ? 'scooter' : 'none', Math.abs(v.speed), !v.def.pedal && !v.broken);
    // throw a newspaper from the bike
    const thrower = missionThrow();
    if (playing && mouse.clickL && thrower) thrower();
  }
  // attack target: the nearest hostile / anyone in front
  let target = null;
  if (!player.veh) {
    let bs = 1e9;
    for (const e of ents) {
      if (e === player || e.down || e.veh) continue;
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, dd = Math.hypot(dx, dz);
      if (dd > 22) continue;
      const cos = (dx * f.x + dz * f.z) / (dd || 1);
      if (cos < 0.6 && dd > 2.5) continue;
      const score = dd * (e.hostile || e.state === 'fight' ? 0.5 : 1) * (2 - cos);
      if (score < bs) { bs = score; target = e; }
    }
  }
  const ctl = {
    flyAxis: playing && MOD.fly ? (down('PageUp') ? 1 : 0) - (down('PageDown') ? 1 : 0) : 0,
    move: { x: f.x * fw + r.x * rt, z: f.z * fw + r.z * rt },
    sprint: playing && down('ShiftLeft', 'ShiftRight'),
    attack: playing && !player.veh && (mouse.clickL || hit('KeyJ')),
    throw: playing && !player.veh && hit('KeyG'),
    target: target && target.distTo(player) < 3.2 ? target : null,
    aim: f,
  };
  if (ctl.throw) ctl.target = target;
  if (playing && hit('KeyQ') && !player.veh) { player.walkMode = !player.walkMode; ui.toast(player.walkMode ? '痞步模式 😎' : '正常走路'); }
  if (playing && hit('KeyX')) player.lightUp();
  if (playing && hit('KeyH')) { const id = ['bolida', 'bread', 'soda'].find((k) => count(k) > 0); if (id) useItem(id); else ui.toast('沒有吃的喝的。柑仔店有寶力大補。', true); }
  if (playing && hit('KeyB')) useItem('betel');
  if (playing && !MOD.fly && hit('Space') && !player.veh && !player.actor.busy) { player.actor.play(['angry', 'complain', 'laugh', 'fold'][Math.floor(Math.random() * 4)], { dur: 2.2 }); bark(['hit2', 'm3_ama1', 'lottery_lose'][Math.floor(Math.random() * 3)]); for (const e of ents) if (e.role === 'ped' && e.distTo(player) < 8) { e.state = 'flee'; e.fleeT = 3; } }
  // ---------- simulate
  player.update(d, ctl);
  for (const e of ents) {
    if (e === player) continue;
    const dp = e.distTo(player);
    if (dp > 130 && !e.veh && e.state !== 'fight') { e.actor.root.visible = false; continue; }
    e.actor.root.visible = true;
    e.actor.setShadow(dp < 40);
    e.update(d, player, spotsRef);
  }
  for (const veh of vehicles) {
    if (veh === player.veh) continue;
    if (veh.ai && veh.driver && !veh.driver.down) {
      const obs = [];
      for (const o of vehicles) if (o !== veh && Math.abs(o.pos.x - veh.pos.x) < 20 && Math.abs(o.pos.z - veh.pos.z) < 20) obs.push(o);
      for (const e of ents) if (!e.veh && !e.down && Math.abs(e.pos.x - veh.pos.x) < 20 && Math.abs(e.pos.z - veh.pos.z) < 20) obs.push(e);
      if (tickTraffic(veh, d, obs) && Math.hypot(veh.pos.x - player.pos.x, veh.pos.z - player.pos.z) < 30) audio.play(veh.def.car ? 'honk' : 'beep', 0.6);
    } else if (!veh.parked) { veh.drive(d, { throttle: 0, steer: 0, brake: true }); veh.collide(); }
    if (!veh.parked || veh.ai) veh.sync(d);
    veh.root.visible = Math.hypot(veh.pos.x - player.pos.x, veh.pos.z - player.pos.z) < 260;
  }
  for (const a of animals) a.update(d, player);
  if (!MOD.fly) separate(player);
  tickProjectiles(d);
  tickPickups(d, player, onPickup);
  tickStory(d);
  tickWanted(d);
  tickPlayerDown(d);
  tickWeather(d, sky.hour, time);
  if (sky.hour < G.hour - 12) G.day++;
  G.hour = sky.hour; env.hour = sky.hour;
  // footsteps
  stepDist += Math.hypot(player.vel.x, player.vel.z) * d;
  if (!player.veh && stepDist > 1.5) { stepDist = 0; audio.play(player.wading ? 'splash' : 'step', player.wading ? 0.4 : 0.6); if (player.wading) fx.splash(player.pos, 3); }
  // interactions
  const its = playing ? interactables() : [];
  let prompt = its[0]?.label || null;
  if (!prompt && playing && !player.veh) { const nv = nearestVehicle(); if (nv) prompt = `<kbd>F</kbd> ${nv.driver ? '搶' : nv.owner === 'ama' ? '騎' : '借'} ${nv.def.name}`; }
  if (!prompt && player.veh && missionThrow()) prompt = '<kbd>左鍵</kbd> 丟報紙';
  ui.prompt(prompt);
  if (its[0] && hit('KeyE')) { unlock(); its[0].act(); }
  // regen
  if (!player.down && performance.now() - (player.lastHurt || 0) > 7000) player.hp = Math.min(player.maxHp, player.hp + d * (ITEMS[G.eq.chain]?.regen ? 3 : 1.2));
  applyPowers(player, G);
  G.hp = player.hp;
  // ---------- world, camera, hud
  sky.update(d, player.pos, true, WX);
  tickWorld(d, player.pos);
  orbit.update(d, player.pos, 1.45 + (player.veh ? 0.6 : 0), {
    heading: player.veh ? player.veh.heading : player.heading,
    moving: playing && (player.veh ? Math.abs(player.veh.speed) > .5 : fw > 0 && rt === 0),
    vehicleDistance: player.veh ? (player.veh.def.car ? 6 : 4.5) : 0,
  });
  const firstPerson = orbit.mode === 'first' && !orbit.override;
  player.actor.root.visible = !firstPerson;
  if (player.veh && firstPerson) player.veh.root.visible = false;
  document.getElementById('cameraButton').textContent = CAMERA_LABELS[orbit.mode] + ' · C';
  ui.camYaw = orbit.yaw;
  hudT -= d;
  if (hudT <= 0) { hudT = 1 / 15; ui.hud(player, sky, STATES[WX.state].icon + ' ' + STATES[WX.state].name); }
  const inTown = Math.abs(player.pos.z) < 30 && Math.abs(player.pos.x) < 230;
  let danceDistance = Infinity;
  for (const n of ents) if (n.dance && !n.down) danceDistance = Math.min(danceDistance, n.distTo(player));
  audio.update(d, { night: sky.isNight, inTown, rain: WX.rain, wind: WX.wind, speed: player.veh ? Math.abs(player.veh.speed) : 0, danceDistance });
  saveT += d;
  if (saveT > 20 && !player.down) { saveT = 0; doSave(); }
  endFrame();
}
let spotsRef = null;
import('./world/town.js').then((m) => (spotsRef = m.spawnSpots));
function doSave() {
  if (!player) return;
  const p = player.veh ? player.veh.pos : player.pos;
  save({ pos: { x: p.x, z: p.z }, heading: player.heading, hour: sky.hour, weather: WX.state });
}
function tickWorld(d, focus) {
  tickStreet(d);
  rain?.update(camera.position, time, sky.isNight);
  grass?.update(focus, sky);
  birds?.update(d, time);
  tickFx(d, focus, sky.isNight);
  const pw = scene.getObjectByName('paddyWater');
  if (pw) { pw.material.uniforms.uSun.value.copy(sky.sunDir); pw.material.uniforms.uSky.value.copy(sky.uni.uHorizon.value); }
  // night: signs and windows glow, street lamps light up
  const nightK = clamp((sky.night - 0.05) * 1.6 + (sky.hour > 18.2 || sky.hour < 6 ? 0.35 : 0), 0, 1);
  NIGHT.value = damp(NIGHT.value, nightK + WX.cloud * 0.25 * (1 - nightK), 2, d);
  const dark = NIGHT.value > 0.35;
  const near = lamps.map((l, i) => [i, (l.x - focus.x) ** 2 + (l.z - focus.z) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, lights.length);
  lights.forEach((l, j) => {
    const n = near[j];
    if (!n || !dark) { l.intensity = 0; return; }
    const L = lamps[n[0]];
    l.position.set(L.x, L.y - 0.3, L.z);
    l.color.set(L.red ? 0xff5030 : L.small ? 0xfff0c0 : 0xffd8a0);
    l.intensity = (L.small ? 6 : L.red ? 10 : 26) * NIGHT.value;
  });
  for (const v of vehicles) if (v.lights) v.lights.visible = dark;
}

function switchCamera() {
  if (mode !== 'play' || !orbit || inputLocked() || dance.on || ui.open) return;
  orbit.cycleMode(); ui.toast(CAMERA_LABELS[orbit.mode]);
}
document.getElementById('cameraButton').onclick = switchCamera;
function openPowers() {
  unlock();
  const labels = { invincible: '無敵 / 無限體力（包含當前車輛）', money: '無限錢', speed: '超速', fly: '飛行（步行模式）' };
  ui.panel('超能力 · GOD MODE', `<div class="note">O 能力選單 · V 切換飛行 · PageUp 上升 / PageDown 下降。觸屏也有上升、下降按鈕。飛行關閉後回到地面。</div>${Object.entries(labels).map(([key,label]) => `<div class="row"><div class="nm">${label}</div><button data-power="${key}">${MOD[key] ? '已開啟' : '已關閉'}</button></div>`).join('')}<div class="row"><div class="nm">速度倍率</div><select id="powerSpeed" aria-label="速度倍率">${[2,4,8].map(n=>`<option value="${n}" ${MOD.multiplier === n ? 'selected' : ''}>${n} 倍</option>`).join('')}</select></div>`, el => {
    el.querySelectorAll('[data-power]').forEach(button => { button.onclick = () => {
      const key = button.dataset.power;
      if (key === 'fly' && !MOD.fly && player.veh) exitVehicle();
      setPower(key, !MOD[key]); player.diving = null; applyPowers(player,G); openPowers();
    }; });
    el.querySelector('#powerSpeed').onchange = event => { setPower('multiplier', event.target.value); };
  });
}
document.getElementById('powersButton').onclick = () => { if (mode === 'play') { if (ui.open) ui.close(); else openPowers(); } };
function pauseHtml() {
  return `<div class="note" style="font-size:14px;line-height:1.9">
    <b>視角</b>：C / 視角按鈕切換三種視角；Z 回正；滾輪調整距離。移動轉視角模式下，把滑鼠停在畫面邊緣會持續轉向，移回中央停止。<br>
    <b>走路</b>：WASD 移動 · Shift 跑 · Q 痞步 · 左鍵/J 打人 · G 丟藍白拖 · X 抽菸 · H 喝補藥 · B 嚼檳榔 · 空白鍵 罵人 · E 互動<br>
    <b>車輛</b>：F 上車/搶車/下車 · W/S 油門倒車 · A/D 轉向 · 空白鍵 剎車/喇叭 · R 換電台<br>
    <b>介面</b>：Tab 背包 · T 老人機 · M 地圖 · 1-9 選對話 · Esc 暫停</div>
    <div class="row"><div><div class="nm">聲音</div></div><div class="acts"><button data-a="mute">${audio.muted ? '打開聲音' : '靜音'}</button></div></div>
    <div class="row"><div><div class="nm">畫質</div><div class="ds">目前：${quality} · 自動調整解析度，低 / 中關閉陰影</div></div><div class="acts"><button data-a="q-low">低</button><button data-a="q-medium">中</button><button data-a="q-high">高</button></div></div>
    <div class="row"><div><div class="nm">重新開始</div><div class="ds">清除存檔，從生日早上重來</div></div><div class="acts"><button data-a="reset">重新開始</button></div></div>`;
}
function bindPause(el) {
  el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'mute') { audio.setMuted(!audio.muted); ui.panel('暫停', pauseHtml(), bindPause); }
    if (a.startsWith('q-') && qualityPresets[a.slice(2)]) {
      quality = a.slice(2);
      try { localStorage.setItem('ama-quality', quality); } catch {}
      prMax = Math.min(devicePixelRatio, qualityPresets[quality].ratio);
      prNow = prMax; frAcc = frN = 0; renderer.setPixelRatio(prNow);
      renderer.shadowMap.enabled = qualityPresets[quality].shadows;
      scene.traverse(o => { for (const material of (Array.isArray(o.material) ? o.material : [o.material])) if (material) material.needsUpdate = true; });
      ui.panel('暫停', pauseHtml(), bindPause);
    }
    if (a === 'reset') { newGame(); location.reload(); }
  }));
}

// ------------------------------------------------------------------ debug / test hooks
window.__ama = {
  get mode() { return mode; }, get G() { return G; }, get player() { return player; },
  ents, vehicles, npcs, ui, blips,
  start: (c) => start(!!c),
  // run the game for s seconds of game time, yielding so promises (voice lines) resolve
  async run(s, dd = 1 / 30) { const n = Math.round(s / dd); for (let i = 0; i < n; i++) { step(dd); if (i % 6 === 5) await new Promise((r) => setTimeout(r, 0)); } renderer.render(scene, camera); },
  prof(n = 60) { let a = 0, b = 0; for (let i = 0; i < n; i++) { const t0 = performance.now(); step(1 / 30); const t1 = performance.now(); renderer.render(scene, camera); renderer.getContext().finish(); a += t1 - t0; b += performance.now() - t1; } return { step: a / n, render: b / n }; },
  pump(n = 30, dd = 1 / 30) { for (let i = 0; i < n; i++) step(dd); renderer.render(scene, camera); },
  render() { renderer.render(scene, camera); },
  tp(x, z) { if (player.veh) { player.veh.pos.set(x, heightAt(x, z), z); } else player.pos.set(x, heightAt(x, z), z); player.vel.set(0, 0, 0); },
  look(yaw, pitch, dist) { orbit.yaw = yaw; if (pitch != null) orbit.pitch = pitch; if (dist) orbit.want = orbit.cur = dist; },
  hour(h) { sky.hour = h; },
  shoot(from, to) { orbit.override = { pos: new THREE.Vector3(...from), look: new THREE.Vector3(...to) }; camera.position.set(...from); camera.lookAt(...to); },
  shootG(from, to) { this.shoot([from[0], heightAt(from[0], from[2]) + from[1], from[2]], [to[0], heightAt(to[0], to[2]) + to[1], to[2]]); },
  free() { orbit.override = null; },
  weather(s) { setWeather(s, true); },
  get WX() { return WX; },
  give, equip, key(code) { keys.add(code); }, unkey(code) { keys.delete(code); },
  press(code) { import('./input.js').then((m) => m.pressed.add(code)); },
  enter(v) { enterVehicle(v); }, exit() { exitVehicle(); },
  info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ents: ents.length, veh: vehicles.length }; },
  story: () => import('./story.js'),
  audio, camera, scene,
};
boot().then(() => requestAnimationFrame(frame)).catch((e) => { loadmsg.textContent = '載入失敗：' + e.message; console.error(e); });
