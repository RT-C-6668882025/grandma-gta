// 大鵝: the Tripo goose is one static mesh, so its acting is done here —
//  · a vertex deformer bends the neck (peck / stretch / hiss), swings the legs and tucks them in flight
//  · two procedural wings unfold from the shoulders to flap when it runs, flies or threatens
//  · a little brain: graze, wander, preen-honk, run away, flap-fly over things, and sometimes charge 阿嬤
// plus the 鵝寮 pen by the 三合院 and the 「抓大鵝」 side game (60 s, dive to catch, carry two at a time).

import * as THREE from 'three';
import { heightAt } from './world/terrain.js';
import { resolve } from './collide.js';
import { clamp, damp, dampAngle } from './util.js';
import { emit, on, G, addMoney } from './game.js';
import { ui, blips } from './ui.js';
import { P } from './world/layout.js';
import { Animal, animals } from './entities.js';

const rnd = (a, b) => a + Math.random() * (b - a);
export const PEN = { x: -153, z: 84, r: 3.4 };   // open grass west of the 三合院's cabbage garden

// ---------------------------------------------------------------- body deformer (model space: y up, head toward +z)
const DEFORM = `
uniform float uNeck; uniform float uLeg; uniform float uTuck;
vec3 gRot(vec3 p, vec3 piv, float a) { p -= piv; float c = cos(a), s = sin(a); p = vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); return p + piv; }
vec3 gooseP(vec3 p) {
  float wn = smoothstep(0.55, 0.75, p.y);                 // neck + head bend about the base of the neck
  if (wn > 0.0) p = gRot(p, vec3(0.0, 0.55, 0.11), uNeck * wn);
  float wl = 1.0 - smoothstep(0.07, 0.24, p.y);           // legs: alternate fore/aft swing, lift on the forward stroke
  if (wl > 0.0) {
    float ph = uLeg + (p.x > 0.0 ? 0.0 : 3.14159);
    p.z += sin(ph) * 0.075 * wl * (1.0 - uTuck);
    p.y += max(0.0, cos(ph)) * 0.035 * wl * (1.0 - uTuck);
    p.z -= 0.11 * wl * uTuck; p.y += 0.09 * wl * uTuck;   // flying: feet tucked back under the tail
  }
  return p;
}
vec3 gooseN(vec3 n, vec3 p) {
  float wn = smoothstep(0.55, 0.75, p.y);
  if (wn > 0.0) n = gRot(n, vec3(0.0), uNeck * wn);
  return n;
}`;

function deformMaterial(mat, U) {
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + DEFORM)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = gooseN(objectNormal, position);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = gooseP(transformed);');
  };
  m.customProgramCacheKey = () => 'goose-deform';
  return m;
}

// a feathered wing lying along +x (outward), trailing edge toward -z, in model units
let WING_GEO = null;
function wingGeo() {
  if (WING_GEO) return WING_GEO;
  const s = new THREE.Shape();
  s.moveTo(0, 0.06); s.bezierCurveTo(0.18, 0.11, 0.42, 0.08, 0.62, -0.02);  // leading edge
  // primaries: a few notched feathers at the tip, then the secondaries along the trailing edge
  const tips = [[0.6, -0.1], [0.54, -0.06], [0.52, -0.16], [0.44, -0.11], [0.42, -0.2], [0.33, -0.14], [0.3, -0.2], [0.2, -0.15], [0.12, -0.18], [0.0, -0.1]];
  for (const [x, z] of tips) s.lineTo(x, z);
  s.lineTo(0, 0.06);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(Math.PI / 2);              // shape XY → XZ (y up)
  // feather tips greyer
  const pos = g.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); const t = clamp((x - 0.32) / 0.3, 0, 1) * clamp((-z + 0.02) / 0.15, 0, 1); col.push(0.95 - 0.38 * t, 0.94 - 0.38 * t, 0.9 - 0.36 * t); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return (WING_GEO = g);
}
const WING_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });

// called from the Animal constructor: inner = scaled group holding the cloned model
export function setupGoose(a, model, inner) {
  const U = { uNeck: { value: 0 }, uLeg: { value: 0 }, uTuck: { value: 0 } };
  model.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => deformMaterial(m, U)) : deformMaterial(o.material, U); });
  const wings = [];
  for (const sd of [1, -1]) {
    const holder = new THREE.Group(); holder.position.set(0.14 * sd, 0.5, 0.04); holder.scale.x = sd;  // right wing mirrors the left
    const pivot = new THREE.Group(); pivot.rotation.order = 'YZX';
    const mesh = new THREE.Mesh(wingGeo(), WING_MAT); mesh.castShadow = true;
    pivot.add(mesh); holder.add(pivot); inner.add(holder);
    wings.push({ holder, pivot });
  }
  a.g = { U, wings, neck: 0, neckT: 0, open: 0, flap: 0, flapAmp: 0, flapHz: 5, leg: 0, tuck: 0, fy: 0, vy: 0, fly: null, peck: 0, charge: 0, pen: false, honkT: rnd(4, 12), lean: 0 };
  a.state = 'idle'; a.t = rnd(0.5, 3);
}

// ---------------------------------------------------------------- brain + body
const HONK = (a, v = 1) => emit('sfx', 'honk', a.pos);
function threat(a, player) {
  // what scares a goose: 阿嬤 close by (more so running), or her vehicle
  const d = a.distTo(player);
  const fast = player.veh ? Math.abs(player.veh.speed) > 2 : Math.hypot(player.vel.x, player.vel.z) > 3.2;
  return { d, fast, r: player.veh ? 9 : fast ? 7 : 4.2 };
}
function startFly(a, away) {
  const g = a.g;
  const dur = rnd(1.4, 2.2), h = rnd(1.4, 2.8);
  g.fly = { t: 0, dur, h, dir: away };
  a.state = 'fly'; HONK(a); emit('sfx', 'whoosh', a.pos);
}

export function updateGoose(a, dt, player) {
  const g = a.g;
  const dp = a.distTo(player);
  a.t -= dt; g.honkT -= dt;
  let tx = null, tz = null, sp = 0;
  let neck = 0.05, open = 0, flapAmp = 0, flapHz = 5, lean = 0;
  const th = threat(a, player);
  const away = Math.atan2(a.pos.x - player.pos.x, a.pos.z - player.pos.z);
  const home = g.pen ? { x: PEN.x, z: PEN.z, r: PEN.r - 1.2 } : a.home;

  // ---- decide
  if (a.state !== 'fly' && a.state !== 'charge' && !g.pen && th.d < th.r && !player.down) {
    if (a.state !== 'flee') { a.state = 'flee'; a.t = rnd(2.5, 4); if (Math.random() < 0.7) HONK(a); }
    // cornered or plain cross: some geese turn round and go for 阿嬤
    if (!player.veh && th.d < 3.2 && Math.random() < dt * (a.wild ? 0.55 : 0.12) && !g.chargeCd) { a.state = 'charge'; a.t = 2.4; HONK(a); g.bit = false; }
    // spooked hard: take off
    else if (th.d < 2.6 && !(g.flyCd > 0) && Math.random() < dt * (th.fast ? 1.4 : 0.45)) startFly(a, away + rnd(-0.5, 0.5));
  }
  g.chargeCd = Math.max(0, (g.chargeCd || 0) - dt);
  g.flyCd = Math.max(0, (g.flyCd || 0) - dt);
  // 阿嬤 launches at it: freeze in surprise for a beat (neck up, wings flapping), then bolt
  if (g.stun > 0) { g.stun -= dt; if (a.state !== 'fly') { a.state = 'stun'; if (g.stun <= 0) { a.state = 'flee'; a.t = 2.5; } } }

  switch (a.state) {
    case 'flee': {
      // run away, zig-zagging (wild ones are slower than a sprinting 阿嬤 but dodge more)
      const zig = Math.sin(performance.now() / 260 + a.ph * 3) * (a.wild ? 0.9 : 0.4);
      tx = a.pos.x + Math.sin(away + zig) * 4; tz = a.pos.z + Math.cos(away + zig) * 4; sp = a.wild ? 2.9 : 3.0;
      neck = 0.62; open = 0.55; flapAmp = 0.55; flapHz = 9; lean = 0.18;
      if (a.t <= 0 && th.d > th.r + 2) { a.state = 'idle'; a.t = rnd(1, 3); }
      break;
    }
    case 'stun': {
      sp = 0; neck = -0.48; open = 0.75; flapAmp = 0.45; flapHz = 13;
      break;
    }
    case 'charge': {
      tx = player.pos.x; tz = player.pos.z; sp = 2.7;
      neck = 0.95; open = 1; flapAmp = 0.18; flapHz = 14; lean = 0.25;   // neck low and snaking, wings spread
      if (g.honkT <= 0) { HONK(a); g.honkT = 0.5; }
      if (!g.bit && dp < 0.95) {
        g.bit = true; emit('gooseBite', a);
        a.state = 'flee'; a.t = 2.5; g.chargeCd = 6;
      } else if (a.t <= 0) { a.state = 'flee'; a.t = 2; g.chargeCd = 4; }
      break;
    }
    case 'fly': {
      const f = g.fly; f.t += dt;
      const u = f.t / f.dur;
      g.fy = Math.sin(Math.PI * clamp(u, 0, 1)) * f.h;
      a.heading = dampAngle(a.heading, f.dir, 8, dt);
      a.speed = 5.2 * (1 - 0.3 * u);
      neck = 0.32; open = 1; flapAmp = 1; flapHz = 4.6; lean = -0.12;
      if (u >= 1) { g.fy = 0; g.fly = null; g.flyCd = 4; a.state = Math.random() < 0.5 ? 'flee' : 'idle'; a.t = rnd(1, 2.5); emit('sfx', 'thud', a.pos); }
      break;
    }
    case 'walk': {
      tx = a.goal[0]; tz = a.goal[1]; sp = 0.55;
      neck = 0.12 + Math.sin(g.leg * 0.5) * 0.05;
      if (Math.hypot(tx - a.pos.x, tz - a.pos.z) < 0.4 || a.t <= 0) { a.state = 'idle'; a.t = rnd(1, 3); }
      break;
    }
    case 'graze': {
      // pecking at the grass, shuffling forward
      g.peck += dt;
      neck = 0.55 + 0.55 * Math.max(0, Math.sin(g.peck * 4.5));
      tx = a.pos.x + Math.sin(a.heading); tz = a.pos.z + Math.cos(a.heading); sp = 0.12;
      if (a.t <= 0) { a.state = 'idle'; a.t = rnd(1, 2.5); }
      break;
    }
    case 'honk': {
      // stretch up, flap once or twice, honk
      neck = -0.42; open = 0.8; flapAmp = 0.7; flapHz = 3;
      if (a.t <= 0) { a.state = 'idle'; a.t = rnd(1.5, 3); }
      break;
    }
    default: { // idle
      neck = 0.05 + Math.sin(performance.now() / 700 + a.ph) * 0.06;
      if (a.t <= 0) {
        const r = Math.random();
        if (r < 0.38) { a.state = 'graze'; a.t = rnd(2, 5); g.peck = 0; }
        else if (r < 0.75) {
          const an = Math.random() * 6.28, rr = Math.random() * home.r;
          a.goal = [home.x + Math.cos(an) * rr, home.z + Math.sin(an) * rr]; a.state = 'walk'; a.t = 10;
        } else if (r < 0.9) { a.state = 'honk'; a.t = 1.3; if (dp < 30) HONK(a); }
        else a.t = rnd(1, 3);
      }
    }
  }

  // ---- move
  if (a.state !== 'fly') {
    if (tx !== null) {
      a.heading = dampAngle(a.heading, Math.atan2(tx - a.pos.x, tz - a.pos.z), a.state === 'charge' ? 7 : 5, dt);
      a.speed = damp(a.speed, sp, 6, dt);
    } else a.speed = damp(a.speed, 0, 6, dt);
  }
  a.pos.x += Math.sin(a.heading) * a.speed * dt; a.pos.z += Math.cos(a.heading) * a.speed * dt;
  const ground = heightAt(a.pos.x, a.pos.z);
  const [x, z] = resolve(a.pos.x, a.pos.z, a.r, ground + g.fy);
  a.pos.x = x; a.pos.z = z; a.pos.y = ground + g.fy;
  if (g.pen && !a.caughtRun) { const dx = a.pos.x - PEN.x, dz = a.pos.z - PEN.z, d = Math.hypot(dx, dz), m = PEN.r - 0.6; if (d > m) { a.pos.x = PEN.x + dx / d * m; a.pos.z = PEN.z + dz / d * m; } }

  // ---- pose (skip far away)
  a.root.visible = dp < 150;
  a.root.position.copy(a.pos);
  a.root.rotation.y = a.heading;
  if (dp > 90) return;
  g.neck = damp(g.neck, neck, 10, dt);
  g.open = damp(g.open, open, 9, dt);
  g.flapAmp = damp(g.flapAmp, flapAmp, 8, dt);
  g.flap += dt * flapHz * Math.PI * 2;
  g.leg += dt * (2 + a.speed * 8.5);
  g.tuck = damp(g.tuck, a.state === 'fly' && g.fy > 0.25 ? 1 : 0, 8, dt);
  g.lean = damp(g.lean, lean, 6, dt);
  g.U.uNeck.value = g.neck; g.U.uLeg.value = g.leg; g.U.uTuck.value = g.tuck;
  for (const w of g.wings) {
    const o = g.open;
    w.holder.visible = o > 0.04;
    w.pivot.scale.setScalar(0.25 + 0.75 * o);
    w.pivot.rotation.y = 1.45 - 1.25 * o;                                      // folded back → spread out
    w.pivot.rotation.z = (0.15 + Math.sin(g.flap) * 0.85 * g.flapAmp) * o;     // flap about the fore-aft axis
  }
  const walkK = clamp(a.speed / 0.6, 0, 1) * (a.state === 'fly' ? 0 : 1);
  a.inner.rotation.z = Math.sin(g.leg * 0.5) * 0.14 * walkK;                    // waddle
  a.inner.rotation.x = g.lean + (a.state === 'fly' ? Math.sin(g.flap) * 0.04 : 0);
  a.inner.position.y = a.innerY + Math.abs(Math.sin(g.leg * 0.5)) * 0.03 * walkK;
}

// ---------------------------------------------------------------- 鵝寮 pen
export function buildPen(scene) {
  const grp = new THREE.Group(); grp.name = 'goosePen';
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 });
  const y = heightAt(PEN.x, PEN.z);
  const n = 22, gate = [0, 1];  // two posts left out on the east side: the gate
  for (let i = 0; i < n; i++) {
    if (gate.includes(i)) continue;
    const a = (i / n) * Math.PI * 2, x = PEN.x + Math.cos(a) * PEN.r, z = PEN.z + Math.sin(a) * PEN.r;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), wood); post.position.set(x, y + 0.45, z); post.castShadow = true; grp.add(post);
    const a2 = ((i + 1) / n) * Math.PI * 2, x2 = PEN.x + Math.cos(a2) * PEN.r, z2 = PEN.z + Math.sin(a2) * PEN.r;
    if (gate.includes((i + 1) % n)) continue;
    for (const h of [0.35, 0.75]) {
      const len = Math.hypot(x2 - x, z2 - z);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.04), wood);
      rail.position.set((x + x2) / 2, y + h, (z + z2) / 2); rail.rotation.y = -Math.atan2(z2 - z, x2 - x); grp.add(rail);
    }
  }
  // straw floor + a little lean-to shed with a sign
  const straw = new THREE.Mesh(new THREE.CircleGeometry(PEN.r - 0.1, 24), new THREE.MeshStandardMaterial({ color: 0xc9a85a, roughness: 1 }));
  straw.rotation.x = -Math.PI / 2; straw.position.set(PEN.x, y + 0.02, PEN.z); straw.receiveShadow = true; grp.add(straw);
  const shed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.2), wood); shed.position.set(PEN.x - 1.6, y + 0.55, PEN.z); grp.add(shed);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.6), new THREE.MeshStandardMaterial({ color: 0x9a3a2a })); roof.position.set(PEN.x - 1.6, y + 1.2, PEN.z); roof.rotation.z = 0.12; grp.add(roof);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x2 = c.getContext('2d'); x2.fillStyle = '#f4e3b0'; x2.fillRect(0, 0, 256, 96); x2.fillStyle = '#7a1a10'; x2.font = 'bold 64px "PingFang SC",sans-serif'; x2.textAlign = 'center'; x2.fillText('鵝寮', 128, 72);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshStandardMaterial({ map: tex })); sign.position.set(PEN.x - 1.6, y + 1.45, PEN.z + 0.85); grp.add(sign);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), wood); post.position.set(PEN.x - 1.6, y + 1.2, PEN.z + 0.84); grp.add(post);
  scene.add(grp);
  return grp;
}

// ---------------------------------------------------------------- 抓大鵝 side game
export const gooseGame = { on: false, t: 0, flock: [], carried: 0, home: 0, total: 6, blips: [], ring: null, startAt: 0 };
const LIMIT = 75, CARRY = 2;
let ctxRef = null;
export function initGoose(ctx) {
  ctxRef = ctx;
  if (initGoose.done) return;
  initGoose.done = true;
  // a charging goose that reaches 阿嬤 bites her
  on('gooseBite', (a) => {
    const p = ctxRef.player;
    if (!p || p.veh || p.down || p.diving) return;
    p.takeHit(a, 3, { knock: 0.35 });
    emit('sfx', 'slap', p.pos); emit('playerHurt', a);
    ui.toast(['被大鵝咬屁股！', '哎喲！這隻鵝會咬人！', '大鵝：嘎——！'][Math.floor(Math.random() * 3)], true);
  });
}

export function startGooseGame(ctx, marker) {
  const gg = gooseGame;
  if (gg.on) return;
  gg.on = true; gg.t = LIMIT; gg.carried = 0; gg.home = 0;
  // last round's penned geese go home; the roaming flock waits in the shed; six wild ones are loose in the field
  for (const a of gg.flock) { a.root.removeFromParent(); const i = animals.indexOf(a); if (i >= 0) animals.splice(i, 1); }
  for (const a of animals) if (a.sp === 'goose') { a.root.visible = false; a.parked = true; }
  gg.flock = [];
  for (let i = 0; i < gg.total; i++) {
    const x = rnd(-170, -143), z = rnd(68, 102);   // the grass between 竹圍巷's end and the garden
    const a = new Animal('goose', x, z, { r: 10 });
    a.wild = true; a.heading = rnd(0, 6.28);
    gg.flock.push(a);
  }
  gg.blips = gg.flock.map((a) => { const b = { x: a.pos.x, z: a.pos.z, color: '#ffffff', icon: '🪿' }; blips.push(b); return b; });
  gg.ring = marker(PEN.x, PEN.z, PEN.r + 0.4, 0xffffff);
  ctx.audio.play('phone');
  ui.banner('抓大鵝', '鵝寮的大鵝全跑出來了！', `${LIMIT} 秒內抓回 ${gg.total} 隻`);
  ui.help('靠近大鵝按 <kbd>E</kbd> <b>飛撲</b>抓牠，一次最多抱 2 隻，抱回<b>鵝寮</b>。<br>小心：被追急了大鵝會<b>飛</b>，還會<b>回頭咬人</b>！', 9);
}

function endGame(win) {
  const gg = gooseGame;
  gg.on = false;
  for (const b of gg.blips) { const i = blips.indexOf(b); if (i >= 0) blips.splice(i, 1); }
  gg.ring?.removeFromParent(); gg.ring = null;
  ui.timer(null); ui.counter(null); ctxRef.setObj('');
  // caught geese join the pen; the rest are rounded up by 阿明 off-screen
  for (const a of gg.flock) {
    if (a.caught && a.inPen) continue;
    a.root.removeFromParent(); const i = animals.indexOf(a); if (i >= 0) animals.splice(i, 1);
  }
  gg.flock = gg.flock.filter((a) => a.inPen);
  for (const a of animals) if (a.sp === 'goose' && a.parked) { a.root.visible = true; a.parked = false; }
  const used = LIMIT - gg.t;
  if (win) {
    const pay = 50 * gg.home + Math.round(gg.t) * 3;
    addMoney(pay, '抓大鵝');
    const best = G.flags.gooseBest;
    const rec = !best || used < best;
    if (rec) G.flags.gooseBest = Math.round(used * 10) / 10;
    ctxRef.audio.play('passed');
    ui.banner('任務完成', '抓大鵝', `+ NT$ ${pay}　用時 ${used.toFixed(1)} 秒${rec ? '　新紀錄！' : `　最佳 ${best} 秒`}`);
  } else {
    if (gg.home) addMoney(30 * gg.home, '抓大鵝');
    ctxRef.audio.play('failed');
    ui.banner('任務失敗', '時間到！大鵝贏了', gg.home ? `抓回 ${gg.home} 隻 · + NT$ ${30 * gg.home}` : '阿嬤被鵝耍了一圈……', true);
  }
  emit('save');
}

export function tickGoose(dt, ctx) {
  const gg = gooseGame;
  if (!gg.on) return;
  const p = ctx.player;
  gg.t -= dt;
  gg.flock.forEach((a, i) => { if (!a.caught) { gg.blips[i].x = a.pos.x; gg.blips[i].z = a.pos.z; } });
  // drop off at the pen
  if (gg.carried && !p.veh && Math.hypot(p.pos.x - PEN.x, p.pos.z - PEN.z) < PEN.r + 1.2) {
    for (const a of gg.flock) if (a.caught && !a.inPen) {
      a.inPen = true; a.root.visible = true; a.g.pen = true; a.wild = false; a.state = 'idle'; a.t = 1;
      const an = Math.random() * 6.28; a.pos.set(PEN.x + Math.cos(an) * 1.2, 0, PEN.z + Math.sin(an) * 1.2);
    }
    gg.home += gg.carried; gg.carried = 0;
    ctx.audio.play('pickup'); emit('sfx', 'honk', p.pos);
    ui.toast(`🪿 關進鵝寮！${gg.home} / ${gg.total}`);
  }
  ui.timer(gg.t);
  ui.counter(`🪿 鵝寮 <b>${gg.home}</b> / ${gg.total}${gg.carried ? ` · 手上抱著 ${gg.carried} 隻` : ''}`);
  ctxRef.setObj(gg.carried >= CARRY ? '抱滿了！先把大鵝送回<b>鵝寮</b>' : gg.carried ? '再抓一隻，或先送回<b>鵝寮</b>' : '<b>飛撲</b>抓住跑掉的大鵝');
  if (gg.home >= gg.total) endGame(true);
  else if (gg.t <= 0) endGame(false);
}

// E near the pen starts the game; during the game E near a goose is a flying dive
export function gooseInteract(p, ctx, marker, locked) {
  const gg = gooseGame;
  if (p.veh) return [];
  if (!gg.on) {
    if (locked || Math.hypot(p.pos.x - PEN.x, p.pos.z - PEN.z) > PEN.r + 2) return [];
    const best = G.flags.gooseBest;
    return [{ label: `<kbd>E</kbd> 抓大鵝挑戰（${LIMIT} 秒）${best ? ` · 最佳 ${best} 秒` : ''}`, act: () => startGooseGame(ctx, marker) }];
  }
  if (gg.carried >= CARRY || p.actor.busy || p.down) return [];
  let best = null, bd = 3.4;
  for (const a of gg.flock) {
    if (a.caught || a.g.fy > 0.9) continue;   // can't catch one that's flying high
    const d = a.distTo(p);
    if (d < bd) { bd = d; best = a; }
  }
  if (!best) return [];
  return [{ label: '<kbd>E</kbd> 飛撲抓鵝！', act: () => p.dive(best) }];
}

// the player's dive reaches its catch window (called from entities.js)
export function diveCatch(p, final = false) {
  const gg = gooseGame;
  if (!gg.on || gg.carried >= CARRY) return false;
  const f = p.actor.fwdAxis();
  const reachX = p.pos.x + f.x * 0.55, reachZ = p.pos.z + f.z * 0.55;
  for (const a of gg.flock) {
    if (a.caught || a.g.fy > 1.3) continue;
    if (Math.hypot(a.pos.x - reachX, a.pos.z - reachZ) < 1.3) {
      a.caught = true; a.root.visible = false; gg.carried++;
      const i = gg.flock.indexOf(a); const b = gg.blips[i]; const bi = blips.indexOf(b); if (bi >= 0) blips.splice(bi, 1);
      emit('sfx', 'honk', a.pos); emit('shake', 0.25);
      ui.toast(['抓到了！大鵝在阿嬤懷裡亂叫', '一把抱住！', '阿嬤：給我乖一點！'][Math.floor(Math.random() * 3)]);
      return true;
    }
  }
  if (!final) return false;
  // missed: every goose nearby takes off honking
  for (const a of gg.flock) if (!a.caught && a.distTo(p) < 4 && a.state !== 'fly') startFly(a, Math.atan2(a.pos.x - p.pos.x, a.pos.z - p.pos.z));
  ui.toast(['撲空了！', '阿嬤趴在草地上……', '大鵝飛走了！'][Math.floor(Math.random() * 3)], true);
  return false;
}
