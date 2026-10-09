// Vehicles: Tripo models of an 80s–90s Taiwanese street — 阿嬤's tricycle,
// bicycle, scooters, a sedan, the little blue pickup (發財車) and the yellow
// taxi. Arcade handling (bicycle model steering), collision as a chain of
// circles against the static world and each other, traffic AI that follows
// the lane loops on the right-hand side, and a seat for a rider actor.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt } from './world/terrain.js';
import { resolve } from './collide.js';
import { LOOPS, BOUND } from './world/layout.js';
import { clamp, damp, dampAngle, angDiff, lerp } from './util.js';

// rotY turns the file's front onto +Z. seat: local [x, y, z] of the rider's hips.
export const VTYPES = {
  // 阿嬤's tricycle has a hub motor fitted (電動三輪車): feet rest on the pedals, no pedalling
  tricycle: { glb: 'tricycle', rotY: -Math.PI / 2, len: 1.55, measLen: 1.85, name: '阿嬤的電動三輪車', max: 9.5, acc: 3.8, turn: 0.75, wb: 1.1, r: 0.55, electric: true, horn: 'beep', seat: [0, 1.0, -0.04], bars: [0.33, 0.07, 0.41], feet: { rest: [[0.17, 0.35, 0.25], [-0.17, 0.35, -0.02]] }, lean: 0, grip: 1, radio: true, hp: 80 },
  bicycle:  { glb: 'bicycle', rotY: 0, len: 1.45, measLen: 1.8, name: '腳踏車', max: 9, acc: 3.5, turn: 0.7, wb: 1.1, r: 0.35, pedal: true, seat: [0, 1.0, -0.31], bars: [0.33, 0.07, 0.53], feet: { crank: [0.29, -0.06, 0.16, 0.17] }, grip: 1, hp: 50, lean: 0.35 },
  scooter:  { glb: 'scooter', rotY: 0, len: 1.85, name: '機車', max: 17, acc: 6, turn: 0.62, wb: 1.3, r: 0.4, seat: [0, 0.78, -0.06], bars: [0.35, 0.3, 0.48], feet: { rest: [[0.13, 0.33, 0.14], [-0.13, 0.33, 0.14]] }, grip: 1, hp: 70, lean: 0.4, horn: 'beep' },
  sedan:    { glb: 'sedan', rotY: -Math.PI / 2, len: 4.3, name: '裕隆老轎車', max: 24, acc: 7, turn: 0.55, wb: 2.5, r: 0.9, seat: [0.4, 0.5, 0.05], bars: [0.17, 0.28, 0.5], grip: 1, car: true, radio: true, hp: 140, lean: 0 },
  minitruck:{ glb: 'minitruck', rotY: 0, len: 3.4, name: '發財車', max: 20, acc: 6, turn: 0.58, wb: 2.0, r: 0.8, seat: [0.35, 0.72, 0.9], bars: [0.17, 0.28, 0.5], grip: 1, car: true, radio: true, hp: 150, lean: 0 },
  luxcar:   { glb: 'luxcar', rotY: -Math.PI / 2, len: 4.9, name: '金牙伯的進口大轎車', max: 26, acc: 7.5, turn: 0.52, wb: 2.8, r: 0.95, seat: [0.42, 0.5, 0.1], bars: [0.17, 0.28, 0.5], grip: 1, car: true, radio: true, hp: 170, lean: 0 },
  taxi:     { glb: 'taxi', rotY: -Math.PI / 2, len: 4.4, name: '小黃計程車', max: 24, acc: 7.5, turn: 0.56, wb: 2.5, r: 0.9, seat: [0.4, 0.5, 0.05], bars: [0.17, 0.28, 0.5], grip: 1, car: true, radio: true, taxi: true, hp: 140, lean: 0 },
};
const T = {};
const loader = new GLTFLoader();
// seat / bars / feet were measured at measLen; scale them to the length actually used
for (const d of Object.values(VTYPES)) {
  const k = d.measLen ? d.len / d.measLen : 1;
  if (k === 1) continue;
  d.seat = d.seat.map((x) => x * k);
  if (d.bars) d.bars = d.bars.map((x) => x * k);
  if (d.feet?.rest) d.feet.rest = d.feet.rest.map((p) => p.map((x) => x * k));
  if (d.feet?.crank) d.feet.crank = d.feet.crank.map((x) => x * k);
}
export async function loadVehicles() {
  await Promise.all(Object.entries(VTYPES).map(async ([k, v]) => {
    try {
      const g = await loader.loadAsync(`assets/props/${v.glb}.glb`);
      const obj = g.scene;
      obj.rotation.y = v.rotY;
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
      const sc = v.len / s.z;
      obj.scale.setScalar(sc);
      obj.position.set(-c.x * sc, -b.min.y * sc, -c.z * sc);
      const wrap = new THREE.Group(); wrap.add(obj);
      wrap.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      T[k] = { obj: wrap, size: s.clone().multiplyScalar(sc) };
    } catch (e) { console.warn('vehicle missing', k, e); }
  }));
}

export const vehicles = [];
let scene = null;
export function setVehicleScene(s) { scene = s; }
const _v = new THREE.Vector3();

export class Vehicle {
  constructor(type, x, z, heading = 0, o = {}) {
    this.type = type;
    this.def = VTYPES[type];
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const t = T[type];
    if (t) { this.body.add(t.obj.clone(true)); this.size = t.size; }
    else { this.body.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, this.def.len), new THREE.MeshStandardMaterial({ color: 0x888888 }))); this.size = new THREE.Vector3(1.4, 1.2, this.def.len); }
    if (o.tint) this.body.traverse((m) => { if (m.isMesh && m.material?.color) { m.material = m.material.clone(); m.material.color.multiply(new THREE.Color(o.tint)); } });
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.heading = heading;
    this.speed = 0; this.steer = 0; this.yawRate = 0;
    this.pitch = 0; this.roll = 0;
    this.hp = this.def.hp; this.broken = false;
    this.driver = null;      // Ent
    this.passenger = null;
    this.ai = null;          // traffic brain {loop, i, dir}
    this.owner = o.owner || null; // 'ama' for her own
    this.parked = !!o.parked;
    this.radioOn = !!this.def.radio;
    this.horn = 0;
    this.lastCrash = 0;
    this.skid = 0;
    // headlights (cars and scooters), shown at night
    if (!this.def.pedal) {
      const hl = new THREE.Mesh(new THREE.PlaneGeometry(this.def.car ? 1.2 : 0.2, 0.12), new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false }));
      hl.position.set(0, this.def.car ? 0.72 : 0.9, this.def.len / 2 + 0.02);
      this.lights = hl; hl.visible = false;
      this.body.add(hl);
    }
    scene.add(this.root);
    vehicles.push(this);
    this.sync();
  }
  // world position of a seat
  seatWorld(pass = false, out = new THREE.Vector3()) {
    const s = this.def.seat;
    const lx = pass ? (this.def.car ? -s[0] : 0) : s[0];
    const lz = pass ? (this.def.car ? s[2] - 1.0 : s[2] - 0.55) : s[2];
    out.set(lx, s[1], lz).applyMatrix4(this.body.matrixWorld);
    return out;
  }
  // world positions of the two hand grips (handlebar ends / steering wheel)
  barsWorld(out) {
    const s = this.def.seat, b = this.def.bars;
    if (!b) return null;
    const steer = this.steer * (this.def.car ? 0 : 0.5);
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? 1 : -1; // left grip is +x
      const lx = s[0] + sd * b[0] * Math.cos(steer), lz = s[2] + b[2] - sd * b[0] * Math.sin(steer);
      out[i].set(lx, s[1] + b[1], lz).applyMatrix4(this.body.matrixWorld);
    }
    return out;
  }
  // world positions of the two feet: resting on pegs/pedals, or following the crank circle (phase in radians)
  feetWorld(out, phase = 0) {
    const f = this.def.feet;
    if (!f) return null;
    if (f.rest) { for (let i = 0; i < 2; i++) out[i].set(...f.rest[i]).applyMatrix4(this.body.matrixWorld); return out; }
    const [cy, cz, r, x] = f.crank;
    for (let i = 0; i < 2; i++) {
      const a = phase + (i ? Math.PI : 0);
      out[i].set(i ? -x : x, cy + Math.sin(a) * r + 0.03, cz + Math.cos(a) * r).applyMatrix4(this.body.matrixWorld);
    }
    return out;
  }
  // where someone stands to get in (left side for cars, beside the saddle for bikes)
  doorPos(out = new THREE.Vector3()) {
    const w = (this.size?.x || 1.4) / 2 + 0.6;
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return out.set(this.pos.x + c * w, this.pos.y, this.pos.z - s * w);
  }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  circles() {
    const n = this.def.car ? 3 : 2, f = this.forward(_v), L = this.def.len;
    const out = [];
    for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * (L - this.def.r * 2); out.push([this.pos.x + f.x * t, this.pos.z + f.z * t]); }
    return out;
  }
  // ctl: {throttle -1..1, steer -1..1, brake bool}
  drive(dt, ctl) {
    const d = this.def;
    if (this.broken) { ctl = { throttle: 0, steer: ctl.steer, brake: true }; }
    const fwdSpeed = this.speed;
    let acc = 0;
    if (ctl.throttle > 0) acc = fwdSpeed < -0.3 ? 12 : d.acc * ctl.throttle * (1 - Math.max(0, fwdSpeed) / d.max * 0.85);
    else if (ctl.throttle < 0) acc = fwdSpeed > 0.3 ? -12 : -d.acc * 0.6;
    this.speed += acc * dt;
    if (ctl.brake) this.speed = damp(this.speed, 0, 3.5, dt);
    if (!ctl.throttle) this.speed = damp(this.speed, 0, d.pedal ? 0.5 : 0.35, dt);
    this.speed = clamp(this.speed, -d.max * 0.3, d.max);
    const steerMax = d.turn * (1 - Math.min(0.55, Math.abs(this.speed) / d.max * 0.6));
    this.steer = damp(this.steer, ctl.steer * steerMax, 7, dt);
    this.yawRate = (this.speed * Math.tan(this.steer)) / d.wb;
    if (ctl.brake && Math.abs(this.speed) > 8 && Math.abs(this.steer) > 0.2) { this.yawRate *= 1.5; this.skid = 1; } else this.skid = Math.max(0, this.skid - dt * 3);
    this.heading += this.yawRate * dt;
    const f = this.forward(_v);
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
  }
  // collide with the static world; returns impact speed
  collide() {
    const f = this.forward(new THREE.Vector3());
    const cs = this.circles();
    let hit = 0, px = 0, pz = 0;
    for (const [cx, cz] of cs) {
      const [rx, rz] = resolve(cx, cz, this.def.r, this.pos.y + 0.2);
      const dx = rx - cx, dz = rz - cz;
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) { px += dx; pz += dz; hit++; }
    }
    if (hit) {
      this.pos.x += px / hit; this.pos.z += pz / hit;
      const n = Math.hypot(px, pz) || 1;
      const into = -(f.x * px + f.z * pz) / n * this.speed; // speed along the wall normal
      if (into > 0.5) { const imp = into; this.speed *= 0.3; return imp; }
    }
    // world bound
    this.pos.x = clamp(this.pos.x, -BOUND, BOUND); this.pos.z = clamp(this.pos.z, -BOUND, BOUND);
    return 0;
  }
  damage(n) {
    this.hp -= n;
    if (this.hp <= 0 && !this.broken) { this.broken = true; this.hp = 0; }
  }
  sync(dt = 0.016) {
    const f = this.forward(_v);
    const half = this.def.len * 0.4;
    const hf = heightAt(this.pos.x + f.x * half, this.pos.z + f.z * half), hb = heightAt(this.pos.x - f.x * half, this.pos.z - f.z * half);
    this.pos.y = Math.max(hf, hb, heightAt(this.pos.x, this.pos.z));
    const targetPitch = Math.atan2(hb - hf, half * 2);
    this.pitch = damp(this.pitch, targetPitch, 10, dt);
    const leanT = this.def.lean ? clamp(-this.yawRate * Math.abs(this.speed) * 0.05, -this.def.lean, this.def.lean) : clamp(this.yawRate * this.speed * 0.004, -0.06, 0.06);
    this.roll = damp(this.roll, leanT, 6, dt);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.heading, 0);
    this.body.rotation.set(this.pitch, 0, this.roll);
    this.root.updateMatrixWorld(true);
  }
  dispose() { this.root.removeFromParent(); const i = vehicles.indexOf(this); if (i >= 0) vehicles.splice(i, 1); }
}

// ---------------------------------------------------------------- traffic
// lanes: each loop is driven clockwise or anticlockwise, keeping right
function lanePoint(loop, i, dir, off) {
  const n = loop.pts.length;
  const a = loop.pts[((i % n) + n) % n], b = loop.pts[(((i + dir) % n) + n) % n];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
  // right of the travel direction is (-dz, dx): heading +z has its right at -x
  return { ax: a[0] - dz * off, az: a[1] + dx * off, bx: b[0] - dz * off, bz: b[1] + dx * off, dx, dz, L };
}
export const SIG = { list: null, state: null };
export function setSignals(list, state) { SIG.list = list; SIG.state = state; }
export const LANES = LOOPS.map((pts) => ({ pts, closed: pts.length > 2 }));

export function trafficBrain(v, loopIdx, i, dir) {
  v.ai = { loop: LANES[loopIdx], i, dir, off: v.def.car ? 1.9 : 3.2, wait: 0, horn: 0 };
}
// steer toward the lane, slow for things ahead. others: array of {pos} to avoid
export function tickTraffic(v, dt, obstacles) {
  const ai = v.ai;
  let tx, tz, seg;
  if (ai.path) {
    // scripted route (races, the car being tailed): drive through each point in turn
    let p = ai.path[ai.pi];
    if (p && Math.hypot(p[0] - v.pos.x, p[1] - v.pos.z) < (ai.reach || 7)) { ai.pi++; p = ai.path[ai.pi]; }
    if (!p) { ai.done = true; v.drive(dt, { throttle: 0, steer: 0, brake: true }); return false; }
    tx = p[0]; tz = p[1];
    const q = ai.path[Math.max(0, ai.pi - 1)];
    const L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    seg = { ax: q[0], az: q[1], dx: (p[0] - q[0]) / L, dz: (p[1] - q[1]) / L, L };
  } else {
    const lp = ai.loop;
    const n = lp.pts.length;
    seg = lanePoint(lp, ai.i, ai.dir, ai.off);
    // progress along the segment
    const t = ((v.pos.x - seg.ax) * seg.dx + (v.pos.z - seg.az) * seg.dz);
    if (t > seg.L - (v.def.car ? 6 : 4)) {
      if (lp.closed) ai.i = (((ai.i + ai.dir) % n) + n) % n;
      else {
        // open road: U-turn at the far end (off in the hills where nobody sees it)
        const nxt = ai.i + ai.dir;
        if (ai.dir > 0 ? nxt >= n - 1 : nxt <= 0) ai.dir *= -1;
        ai.i = nxt;
      }
      seg = lanePoint(lp, ai.i, ai.dir, ai.off);
    }
    const t2 = clamp(((v.pos.x - seg.ax) * seg.dx + (v.pos.z - seg.az) * seg.dz) + 9, 0, seg.L);
    tx = seg.ax + seg.dx * t2; tz = seg.az + seg.dz * t2;
  }
  const want = Math.atan2(tx - v.pos.x, tz - v.pos.z);
  const err = angDiff(v.heading, want);
  // obstacle ahead?
  const f = v.forward(_v);
  let block = 99;
  // stuck (deadlocked at a corner, wedged on something): put it back on the lane
  ai.stuck = Math.abs(v.speed) < 0.6 ? (ai.stuck || 0) + dt : 0;
  if (ai.stuck > 5) {
    ai.stuck = 0; ai.ghost = 2.5;
    v.heading = Math.atan2(seg.dx, seg.dz);
    const tt = clamp(((v.pos.x - seg.ax) * seg.dx + (v.pos.z - seg.az) * seg.dz), 0, seg.L);
    v.pos.x = seg.ax + seg.dx * tt; v.pos.z = seg.az + seg.dz * tt;
  }
  if (ai.ghost > 0) ai.ghost -= dt;
  // red lights: stop ~7 m before the middle of the crossing
  if (SIG.list && !ai.ignoreLights) {
    const alongX = Math.abs(f.x) > 0.8, alongZ = Math.abs(f.z) > 0.8;
    for (const s of SIG.list) {
      if (alongX && Math.abs(v.pos.z - s.z) < 6) {
        const d = (s.x - v.pos.x) * Math.sign(f.x) - 7;
        if (d > 0 && d < 16 && SIG.state('ew') !== 'g') block = Math.min(block, d + v.def.len / 2 + 2.5);
      } else if (alongZ && Math.abs(v.pos.x - s.x) < 6) {
        const d = (s.z - v.pos.z) * Math.sign(f.z) - 7;
        if (d > 0 && d < 16 && SIG.state('ns') !== 'g') block = Math.min(block, d + v.def.len / 2 + 2.5);
      }
    }
  }
  for (const o of ai.ghost > 0 ? [] : obstacles) {
    if (o === v) continue;
    const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
    const along = dx * f.x + dz * f.z, side = Math.abs(dx * f.z - dz * f.x);
    if (along > 0 && along < 16 && side < (o.r || 1.2) + 1.2) block = Math.min(block, along);
  }
  const cruise = ai.cruise || (v.def.car ? 11 : v.def.pedal ? 4.5 : 9);
  let target = cruise * (1 - Math.min(0.6, Math.abs(err)));
  if (block < 99) target = Math.min(target, Math.max(0, (block - (v.def.len / 2 + 2.5)) * 1.2));
  ai.horn = block < 7 ? ai.horn + dt : 0;
  const thr = v.speed < target - 0.4 ? 1 : v.speed > target + 0.6 ? -0.4 : 0;
  v.drive(dt, { throttle: thr, steer: clamp(err * 2.2, -1, 1), brake: target < 0.5 });
  return ai.horn > 2.2 ? (ai.horn = 0, true) : false;
}
