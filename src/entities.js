import { loadModel } from './model-loader.js';
// People and animals: the player (阿嬤), townsfolk with simple GTA-ish brains
// (wander / flee / fight back / call it in), thugs, the old cop, family,
// taxi fares; dogs, cats and roosters; thrown slippers and newspapers;
// pickups (cash, cardboard, slippers). Nobody dies — knocked-out people see
// stars for a while, then get up and run off.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Actor } from './actor.js';
import { ITEMS, makeWear, cigMesh, slipperMesh, rolledPaper, outfitTexture, paperBundle } from './gear.js';
import { heightAt, isPaddy } from './world/terrain.js';
import { resolve } from './collide.js';
import { BOUND } from './world/layout.js';
import { clamp, damp, dampAngle, angDiff, lerp } from './util.js';
import { G, emit, give, count, addWanted, swag } from './game.js';
import { vehicles } from './vehicles.js';
import { updateBuffalo } from './buffalo-motion.js';
import { rigBuffalo } from './buffalo-rig.js';
import { setupGoose, updateGoose, diveCatch } from './goose.js';
import { DIVE_CURVE, DIVE_CLIP_LEN } from './actor.js';

export const ents = [];
const _bp = new THREE.Vector3();
export const env = { hour: 12, truce: false };
let scene = null;
export function setScene(s) { scene = s; }
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- dizzy stars
let starTex = null;
function stars() {
  if (!starTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.font = '52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⭐', 32, 36);
    starTex = new THREE.CanvasTexture(c); starTex.colorSpace = THREE.SRGBColorSpace;
  }
  const grp = new THREE.Group();
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, depthWrite: false })); s.scale.setScalar(0.22); grp.add(s); }
  grp.visible = false;
  return grp;
}

export class Ent {
  constructor(kind, x, z, o = {}) {
    this.actor = new Actor(kind, o);
    this.kind = kind;
    this.name = o.name || '路人';
    this.role = o.role || 'ped';
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.vel = new THREE.Vector3();
    this.heading = o.ry ?? Math.random() * Math.PI * 2;
    this.r = 0.35;
    this.maxHp = o.hp || 40; this.hp = this.maxHp;
    this.down = false; this.downT = 0; this.dizzy = 0;
    this.veh = null;
    this.stars = stars();
    this.actor.root.add(this.stars);
    scene.add(this.actor.root);
    ents.push(this);
    this.actor.heading = this.heading;
    this.actor.root.position.copy(this.pos);
  }
  distTo(e) { return Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z); }
  faceTo(x, z, dt = 1, k = 10) { this.heading = dampAngle(this.heading, Math.atan2(x - this.pos.x, z - this.pos.z), k, dt); }
  // walk toward a point at speed; returns remaining distance
  steer(dt, tx, tz, speed, k = 8) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      this.heading = dampAngle(this.heading, Math.atan2(dx, dz), k, dt);
      const s = Math.min(speed, d / Math.max(dt, 1e-3));
      this.vel.x = damp(this.vel.x, Math.sin(this.heading) * s, 8, dt);
      this.vel.z = damp(this.vel.z, Math.cos(this.heading) * s, 8, dt);
    } else { this.vel.x = damp(this.vel.x, 0, 10, dt); this.vel.z = damp(this.vel.z, 0, 10, dt); }
    return d;
  }
  integrate(dt) {
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const [x, z] = resolve(this.pos.x, this.pos.z, this.r, this.pos.y);
    this.pos.x = clamp(x, -BOUND, BOUND); this.pos.z = clamp(z, -BOUND, BOUND);
    const g = heightAt(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, g, 20, dt);
    this.wading = !!isPaddy(this.pos.x, this.pos.z);
  }
  // damage from someone (att may be null)
  takeHit(att, dmg, o = {}) {
    if (this.down || this.invuln) return false;
    emit('damage', this, att, o.kind || 'assault');
    this.hp -= dmg;
    this.actor.hurt();
    this.lastHitBy = att; this.lastHurt = performance.now();
    if (att) {
      const dx = this.pos.x - att.pos.x, dz = this.pos.z - att.pos.z, d = Math.hypot(dx, dz) || 1;
      const kb = o.knock ?? 0.5;
      this.vel.x += (dx / d) * kb * 6; this.vel.z += (dz / d) * kb * 6;
    }
    if (this.hp <= 0) this.knockOut(o.long ? 14 : 8);
    else if (this.actor.has('hurt') && this.actor.t.moves.hurt.own && !this.actor.busy) this.actor.play('hurt');
    return true;
  }
  knockOut(t = 8) {
    this.down = true; this.downT = t; this.hp = 0;
    this.actor.knockDown();
    this.stars.visible = true;
    emit('sfx', 'stars', this.pos);
    emit('ko', this);
  }
  wake() {
    this.down = false; this.hp = Math.round(this.maxHp * 0.5);
    this.actor.getUp();
    this.stars.visible = false;
  }
  tickCommon(dt) {
    if (this.down) {
      this.downT -= dt;
      this.vel.x = damp(this.vel.x, 0, 6, dt); this.vel.z = damp(this.vel.z, 0, 6, dt);
      if (this.downT <= 0 && !this.stayDown) this.wake();
      // a body lying on the ground is ~1.5 m long but only collides as a small circle at the feet:
      // if the head or chest has fallen into a wall, slide the whole body back out along the wall normal
      for (const key of ['head', 'chest']) {
        const p = this.actor.bonePos(key, _bp);
        const [rx, rz] = resolve(p.x, p.z, 0.14, Math.max(0, p.y - 0.25));
        if (rx !== p.x || rz !== p.z) { this.pos.x += rx - p.x; this.pos.z += rz - p.z; this.actor.root.position.x += rx - p.x; this.actor.root.position.z += rz - p.z; this.actor.root.updateMatrixWorld(true); }
      }
    }
    if (this.stars.visible) {
      const t = performance.now() / 1000;
      const hy = (this.actor.t.headTop - this.actor.t.minY) * this.actor.scale;
      this.stars.children.forEach((s, i) => { const a = t * 4 + (i * Math.PI * 2) / 3; s.position.set(Math.cos(a) * 0.3, (this.down ? 0.45 : hy + 0.15), Math.sin(a) * 0.3 + (this.down ? -hy * 0.6 : 0)); });
    }
  }
  place() {
    if (this.veh) return;
    this.actor.speed = Math.hypot(this.vel.x, this.vel.z);
    this.actor.heading = this.heading;
    this.actor.root.position.copy(this.pos);
    if (this.sit) {
      // sitting on a bench/stool: drop the hips to seat height
      const a = this.actor;
      if (a.hipH == null) { a.root.updateMatrixWorld(true); a.hipH = a.bonePos('hip', _v2).y - a.root.position.y; }
      a.root.position.y += (this.seatH ?? 0.46) - a.hipH * 0.95;
    }
  }
  // sit on a vehicle seat (driver or passenger)
  ride(v, pass = false) {
    this.veh = v; this.pass = pass;
    if (pass) v.passenger = this; else v.driver = this;
    this.actor.sit = 1; this.actor.grip = pass ? 0 : v.def.grip;
    this.vel.set(0, 0, 0);
    if (this.actor.gear.bag) this.actor.gear.bag.obj.visible = false;
  }
  unride(knock = false) {
    const v = this.veh;
    if (!v) return;
    if (this.pass) v.passenger = null; else v.driver = null;
    const p = v.doorPos(_v);
    if (this.pass) { const f = v.forward(_v2); p.addScaledVector(f, -1.2); }
    this.pos.set(p.x, heightAt(p.x, p.z), p.z);
    this.veh = null; this.pass = false;
    this.actor.sit = 0; this.actor.grip = 0; this.actor.pedalAmp = 0; this.actor.feet = null; this.actor.bars = null; this.actor.rootQ = null;
    if (this.actor.gear.bag) this.actor.gear.bag.obj.visible = true;
    this.actor.root.rotation.set(0, this.heading, 0);
    if (knock) this.knockOut(4);
  }
  syncSeat() {
    const v = this.veh;
    const seat = v.seatWorld(this.pass, _v);
    const a = this.actor;
    const hipH = a.hipH ?? (a.hipH = (a.bonePos('hip', _v2).y - a.root.position.y));
    // hip joints sit ~8 cm above the saddle surface
    a.root.position.set(seat.x, seat.y + 0.08 - hipH, seat.z);
    a.root.quaternion.copy(v.body.getWorldQuaternion(new THREE.Quaternion()));
    a.heading = v.heading; this.heading = v.heading;
    this.pos.set(v.pos.x, v.pos.y, v.pos.z);
    a.speed = 0;
    a.pedalAmp = 0;
    if (!this.pass) {
      a.bars = a.bars || [new THREE.Vector3(), new THREE.Vector3()]; v.barsWorld(a.bars);
      a.carSeat = !!v.def.car;  // hands on a wheel inside a cabin: no need for the finger grip
      // pedalling: crank turns with ground speed (about 1.7 rad per metre)
      if (v.def.pedal) a.crank = (a.crank || 0) + v.speed * 1.7 * (this._dt || 0.016);
      a.feetT = a.feetT || [new THREE.Vector3(), new THREE.Vector3()];
      a.feet = v.def.feet ? v.feetWorld(a.feetT, a.crank || 0) : null;
    } else { a.bars = null; a.feet = null; }
  }
  updateActor(dt) {
    this._dt = dt;
    if (this.veh) {
      this.syncSeat();
      // keep the vehicle's roll: actor.update sets rotation.y from heading, so restore the full quaternion after
      // hand the vehicle's full orientation to the actor so the riding IK is solved with the lean already in
      this.actor.rootQ = this.actor.rootQ || new THREE.Quaternion();
      this.actor.rootQ.copy(this.actor.root.quaternion);
      this.actor.update(dt);
      this.actor.updateGear();
    } else this.actor.update(dt);
  }
  remove() { this.actor.dispose(); const i = ents.indexOf(this); if (i >= 0) ents.splice(i, 1); if (this.veh) this.unride(); }
}

// ---------------------------------------------------------------- the player
export class Player extends Ent {
  constructor(x, z, ry) {
    super('ama', x, z, { name: '秀琴阿嬤', role: 'player', hp: 100, ry });
    this.maxHp = G.maxHp; this.hp = G.hp || 100;
    this.stamina = 100;
    this.combo = 0; this.comboT = 0; this.queued = false;
    this.smokeT = 0; this.betelT = 0;
    this.lastHurt = 0;
    this.walkMode = false;
    this.applyGear();
  }
  get swagWalk() { return this.walkMode || swag() >= 20; }
  applyGear() {
    const a = this.actor;
    for (const slot of ['hat', 'glasses', 'chain', 'bag', 'weapon']) {
      const id = G.eq[slot];
      const at = a.t.attach[slot];
      a.wear(slot, makeWear(id, at), slot);
    }
    a.hideHat(G.eq.hat && G.eq.hat !== 'straw');
    a.setMap(G.eq.top && G.eq.top !== 'floral' ? outfitTexture(a, G.eq.top) : null);
    this.weapon = ITEMS[G.eq.weapon] || ITEMS.fist;
  }
  // ctl: move {x,z}, sprint, attack, throw, target
  update(dt, ctl) {
    const a = this.actor;
    this.tickCommon(dt);
    if (this.veh) { this.updateActor(dt); return; }
    if (this.diving) { this.updateDive(dt); return; }
    const busy = a.busy;
    const down = this.down;
    const mv = ctl.move;
    const mag = Math.min(1, Math.hypot(mv.x, mv.z));
    const sprint = ctl.sprint && this.stamina > 5 && mag > 0.1;
    let speed = mag * (sprint ? 4.6 : this.walkMode ? 1.3 : 2.5);
    if (this.wading) speed *= 0.55;
    if (busy && a.cur && ['jab', 'cross', 'kick', 'swing', 'throw'].includes(a.cur.name)) speed *= 0.25;
    if (a.cur && ['phone', 'lift', 'dance', 'angry', 'complain'].includes(a.cur.name)) speed = 0;
    if (down) speed = 0;
    if (mag > 0.1 && !down) this.heading = dampAngle(this.heading, Math.atan2(mv.x, mv.z), 12, dt);
    const tvx = mag > 0.1 ? Math.sin(this.heading) * speed : 0, tvz = mag > 0.1 ? Math.cos(this.heading) * speed : 0;
    this.vel.x = damp(this.vel.x, tvx, 10, dt); this.vel.z = damp(this.vel.z, tvz, 10, dt);
    this.stamina = clamp(this.stamina + (sprint ? -14 : 9 * (G.flags.smoking ? 1.6 : 1)) * dt, 0, 100);
    this.integrate(dt);
    a.swag = this.walkMode || (swag() >= 20 && !sprint);
    // combat
    this.comboT -= dt;
    if (ctl.attack && !down) {
      if (busy) this.queued = true; else this.strike(ctl.target);
    } else if (this.queued && !busy && !down) { this.queued = false; this.strike(ctl.target); }
    if (ctl.throw && !down && !busy) this.throwSlipper(ctl.target, ctl.aim);
    // smoking
    if (this.smokeT > 0) {
      this.smokeT -= dt;
      a.smoke = damp(a.smoke, busy ? 0 : 1, 6, dt);
      if (this.smokeT <= 0) { a.wear('cig', null); a.smoke = 0; G.flags.smoking = false; emit('swag'); }
      else if (Math.random() < dt * 5) { const tip = a.gearTip('cig', _v, 0.04); emit('fx', 'wisp', tip); }
      if (a.exhale && Math.random() < dt * 5) { const m = a.headPos(_v); const f = a.fwdAxis(); m.addScaledVector(f, 0.12); m.y -= 0.05; emit('fx', 'puff', m); }
    }
    if (this.betelT > 0) { this.betelT -= dt; if (this.betelT <= 0) { const m = a.headPos(_v); m.addScaledVector(a.fwdAxis(), 0.15); emit('fx', 'spit', m); emit('sfx', 'spit', this.pos); } }
    this.place();
    this.updateActor(dt);
  }
  // 飛撲: the dive clip plays in place while 阿嬤 travels along the measured leap; the catch is checked as she lands
  dive(target) {
    if (this.diving || this.actor.busy) return;
    if (target) this.heading = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    this.diving = { z: 0, checked: false, got: false };
    if (target?.g) target.g.stun = 0.55;
    this.vel.set(0, 0, 0);
    this.actor.play('dive', { dur: 1.85 });
    emit('sfx', 'whoosh', this.pos);
  }
  updateDive(dt) {
    const a = this.actor, d = this.diving, c = a.cur;
    if (!c || c.name !== 'dive' || c.done) { this.diving = null; this.place(); this.updateActor(dt); return; }
    const tc = clamp(c.el / c.dur, 0, 1) * DIVE_CLIP_LEN;
    const i = Math.min(DIVE_CURVE.length - 2, Math.floor(tc / 0.1)), u = tc / 0.1 - i;
    const z = (DIVE_CURVE[i] + (DIVE_CURVE[i + 1] - DIVE_CURVE[i]) * u) * (this.actor.height / 1.5);
    const dz = z - d.z; d.z = z;
    this.pos.x += Math.sin(this.heading) * dz; this.pos.z += Math.cos(this.heading) * dz;
    const [x, zz] = resolve(this.pos.x, this.pos.z, this.r, this.pos.y);
    this.pos.x = x; this.pos.z = zz; this.pos.y = heightAt(x, zz);
    // belly lands at ~1.75 s of the clip: grab whatever is under her hands
    // grab window: from mid-leap until the belly lands (~1.25–1.95 s of the clip)
    if (!d.got && tc >= 1.25 && tc <= 1.95) d.got = diveCatch(this);
    if (!d.checked && tc >= 1.75) { d.checked = true; emit('sfx', 'thud', this.pos); emit('shake', 0.3); }
    if (!d.got && !d.missed && tc > 1.95) { d.missed = true; diveCatch(this, true); }
    this.place();
    this.updateActor(dt);
  }
  strike(target) {
    const a = this.actor;
    if (target && !target.down) this.heading = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    const w = this.weapon;
    let move;
    if (G.eq.weapon === 'fist') { move = ['jab', 'cross', 'kick'][this.comboT > 0 ? this.combo % 3 : 0]; this.combo = this.comboT > 0 ? this.combo + 1 : 1; this.comboT = 1.1; }
    else move = 'swing';
    const dur = (a.t.moves[move]?.dur || 0.6) / (w.speed || 1);
    emit('sfx', 'whoosh', this.pos);
    a.play(move, { dur, onHit: () => this.resolveHit(move) });
  }
  resolveHit(move) {
    const w = this.weapon;
    const reach = (move === 'kick' ? 1.45 : w.reach) + 0.35;
    const f = this.actor.fwdAxis();
    let hits = 0;
    const list = ents.filter((e) => e !== this && !e.down && !e.veh && e.distTo(this) < reach + e.r).sort((p, q) => (q.hostile || q.state === 'fight' ? 1 : 0) - (p.hostile || p.state === 'fight' ? 1 : 0) || p.distTo(this) - q.distTo(this));
    for (const e of list) {
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      if ((dx * f.x + dz * f.z) / d < 0.35) continue;
      const dmg = Math.round((move === 'kick' ? 12 : w.dmg) * (1 + swag() * 0.006) * rnd(0.85, 1.2));
      if (e.takeHit(this, dmg, { knock: move === 'kick' ? 1 : 0.55 })) {
        hits++;
        emit('sfx', G.eq.weapon === 'fist' ? 'hit' : 'bonk', e.pos);
        emit('hit', e, this);
        if (hits >= (G.eq.weapon === 'fist' ? 1 : 2)) break;
      }
    }
    if (hits) { emit('shake', 0.35); G.stats.hits++; if (Math.random() < 0.28) emit('voice', ['hit1', 'hit2', 'hit3'][Math.floor(Math.random() * 3)]); }
  }
  throwSlipper(target, aim) {
    if (count('slipper') <= 0) { emit('toast', '沒有藍白拖了！柑仔店、五金行有賣，丟出去的也可以撿回來。', true); return; }
    const a = this.actor;
    if (target) this.heading = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    else if (aim) this.heading = Math.atan2(aim.x, aim.z);
    give('slipper', -1);
    a.play('throw', {
      onHit: () => {
        const from = a.bonePos('rHand', new THREE.Vector3());
        spawnProjectile('slipper', from, target, a.fwdAxis(), this);
        emit('sfx', 'whoosh', this.pos);
      },
    });
    if (Math.random() < 0.5) emit('voice', 'hit1');
  }
  lightUp() {
    if (this.veh) return;
    if (this.smokeT > 0) { emit('toast', '還在抽啦。'); return; }
    if (count('cig') <= 0) { emit('toast', '沒菸了。柑仔店有賣長壽菸。', true); return; }
    give('cig', -1);
    this.smokeT = 40;
    this.actor.wear('cig', cigMesh(), 'cig');
    this.actor.smokeT = 0;
    G.flags.smoking = true;
    emit('sfx', 'lighter', this.pos);
    emit('swag');
  }
}

// ---------------------------------------------------------------- NPCs
// roles: ped (wander), vendor/family/sitter (stay), thug, cop, fare, dancer, driver
export class NPC extends Ent {
  constructor(kind, x, z, o = {}) {
    super(kind, x, z, o);
    this.home = { x, z };
    this.brave = o.brave ?? (o.role !== 'vendor' && o.role !== 'family' && (kind === 'thug' || kind === 'thug2' || kind === 'farmer' || kind === 'son' || kind === 'man2' || kind === 'police'));
    this.hostile = !!o.hostile;
    this.state = 'idle'; this.stateT = rnd(1, 4);
    this.target = null;
    this.path = o.path || null; this.pathI = 0;
    this.speedWalk = rnd(0.95, 1.25);
    this.atkCd = 0;
    this.talk = o.talk || null;   // fn when player presses E
    this.label = o.label || null;
    this.stayDown = false;
    this.weapon = o.weapon || null;
    if (o.weapon) this.actor.wear('weapon', makeWear(o.weapon, this.actor.t.attach.weapon));
    this.dmg = o.dmg || 7;
    this.sit = o.sit || false;
    this.dance = o.dance || false;
    this.fleeT = 0;
    this.lines = o.lines || null;
  }
  update(dt, player, spots) {
    this.tickCommon(dt);
    if (this.veh) { this.updateActor(dt); return; }
    const a = this.actor;
    const dp = this.distTo(player);
    this.atkCd -= dt;
    if (this.down) { this.place(); this.updateActor(dt); return; }
    // react to being hit
    const aggressor = this.lastHitBy;
    if (aggressor && !aggressor.down && ents.includes(aggressor) && this.lastReactedHit !== this.lastHurt) {
      const wasEngaged = this.state === 'fight' || this.state === 'flee';
      this.lastReactedHit = this.lastHurt;
      if (this.brave && (this.hostile || this.role === 'cop' || Math.random() < 0.6)) { this.state = 'fight'; this.target = aggressor; }
      else { this.state = 'flee'; this.fleeFrom = aggressor; this.fleeT = 8; }
      if (!wasEngaged && aggressor === player && this.role !== 'cop' && !this.hostile) emit('civilianHit', this);
    }
    if (this.hostile && this.state !== 'fight' && this.state !== 'flee' && dp < (this.aggro || 14) && !player.down) { this.state = 'fight'; this.target = player; }
    switch (this.state) {
      case 'fight': {
        const t = this.target;
        if (env.truce && !this.hostile) { this.state = 'idle'; this.stateT = 3; this.lastHitBy = null; break; }
        if (env.truce) { this.steer(dt, this.pos.x, this.pos.z, 0); break; }
        if (!t || t.down || (t.veh && this.role !== 'cop') || this.distTo(t) > (this.role === 'cop' ? 60 : 40)) { this.state = 'idle'; this.stateT = 2; this.lastHitBy = null; break; }
        const d = this.distTo(t);
        if (t.veh) { this.steer(dt, t.pos.x, t.pos.z, 3.6); break; }
        if (d > 1.35) this.steer(dt, t.pos.x, t.pos.z, d > 5 ? 3.4 : 1.8);
        else {
          this.steer(dt, this.pos.x, this.pos.z, 0); this.faceTo(t.pos.x, t.pos.z, dt, 10);
          if (this.atkCd <= 0 && !a.busy) {
            this.atkCd = rnd(1.6, 2.8);
            const mv = this.weapon || !(a.has('jab') && a.t.moves.jab.own) ? 'swing' : ['jab', 'cross', 'kick'][Math.floor(Math.random() * 3)];
            a.play(mv, { dur: mv === 'swing' ? 0.8 : 0.6, onHit: () => {
              if (this.state !== 'fight' || this.target !== t) return;
              if (!t.down && this.distTo(t) < 1.9) { const armor = t.role === 'player' ? (ITEMS[G.eq.hat]?.armor || 0) : 0; if (t.takeHit(this, Math.round(this.dmg * (1 - armor) * (t.role === 'player' ? 0.75 : 1) * rnd(0.8, 1.2)), { knock: 0.4 })) { emit('sfx', this.weapon ? 'bonk' : 'hit', t.pos); if (t === player) emit('playerHurt', this); } }
            } });
          }
        }
        break;
      }
      case 'flee': {
        this.fleeT -= dt;
        const threat = this.fleeFrom && ents.includes(this.fleeFrom) ? this.fleeFrom : player;
        const dx = this.pos.x - threat.pos.x, dz = this.pos.z - threat.pos.z, d = Math.hypot(dx, dz) || 1;
        this.steer(dt, this.pos.x + (dx / d) * 5, this.pos.z + (dz / d) * 5, 3.8);
        if (this.fleeT <= 0 && d > 18) { this.state = 'idle'; this.stateT = 2; this.lastHitBy = null; this.fleeFrom = null; }
        break;
      }
      case 'walk': {
        const d = this.steer(dt, this.goal[0], this.goal[1], this.speedWalk);
        this.stateT -= dt;
        if (d < 0.6 || this.stateT < 0) { this.state = 'idle'; this.stateT = rnd(2, 7); }
        break;
      }
      default: { // idle
        this.steer(dt, this.pos.x, this.pos.z, 0);
        if (this.faceGoal) this.faceTo(this.faceGoal[0], this.faceGoal[1], dt, 3);
        if (this.talk && dp < 4 && !this.hostile) this.faceTo(player.pos.x, player.pos.z, dt, 3);
        this.stateT -= dt;
        if (this.role === 'ped' && this.stateT <= 0 && spots && spots.length) {
          // pick a nearby sidewalk point
          let best = null;
          for (let k = 0; k < 6; k++) { const s = spots[Math.floor(Math.random() * spots.length)]; const dd = Math.hypot(s[0] - this.home.x, s[1] - this.home.z); if (dd < 45 && (!best || Math.random() < 0.5)) best = s; }
          if (best) { this.goal = [best[0] + rnd(-1, 1), best[1] + rnd(-0.6, 0.6)]; this.state = 'walk'; this.stateT = 30; }
          else this.stateT = 3;
        }
        // scared of a speeding vehicle or a fight nearby
        if (this.role === 'ped' && player.veh && Math.abs(player.veh.speed) > 8 && dp < 7) { this.state = 'flee'; this.fleeT = 3; }
      }
    }
    // the temple-square aunties dance every evening
    if (this.role === 'dancer') { const ev = env.hour > 18.2 && env.hour < 21.5; if (ev !== this.dance) { this.dance = ev; if (ev) { this.state = 'idle'; this.faceGoal = [this.home.x, this.home.z - 40]; } } }
    // procedural dance for the square-dance aunties
    if (this.dance) {
      this.danceTime = (this.danceTime || 0) + dt;
      const t = this.danceTime * (this.danceSpeed || Math.PI * 127.085 / 120) + (this.phase || 0);
      a.lean = Math.sin(t * 2) * 0.08;
      this.danceArms = t;
    } else if (this.danceArms !== undefined) {
      a.lean = 0;
      this.danceArms = undefined;
    }
    if (this.sit) { a.sit = 1; a.grip = 0; }
    this.integrate(dt);
    this.place();
    this.updateActor(dt);
    if (this.dance && !a.busy) {
      const t = this.danceArms, R = a.rightAxis(), F = a.fwdAxis();
      for (const [s, sp] of [['l', 1], ['r', -1]]) {
        const up = (Math.sin(t * 2 + (s === 'l' ? 0 : Math.PI)) * 0.5 + 0.5);
        a.turnBone(a.rig[s + 'Arm'], F, sp * (0.22 + up * 0.9));
        a.turnBone(a.rig[s + 'Fore'], R, 0.35 + 0.45 * up);
      }
      a.turnBone(a.rig.spine, UPV, Math.sin(t) * 0.15);
      a.updateGear();
    }
  }
}
const UPV = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- animals
const SPECIES = {
  dog:     { h: 0.62, speed: 3.6, rotY: 0, sfx: 'bark' },
  cat:     { h: 0.32, speed: 2.8, rotY: -Math.PI / 2, sfx: 'meow' },
  rooster: { h: 0.55, speed: 1.6, rotY: -Math.PI / 2, sfx: 'cluck' },
  // Tripo text-to-3D → decimation. Geese waddle; buffalo receive a runtime walking rig.
  goose:   { h: 0.78, speed: 1.4, rotY: 0, sfx: 'honk' },   // acting lives in goose.js
  buffalo: { h: 1.45, speed: 0.55, rotY: 0, sfx: 'moo', calm: true, r: 1.1 },
};
const AT = {};
export async function loadAnimals() {
  const loader = new GLTFLoader();
  await Promise.all(Object.keys(SPECIES).map(async (n) => {
    try {
      const g = await loadModel(loader, `assets/animals/${n}.glb`);
      g.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const box = new THREE.Box3().setFromObject(g.scene);
      AT[n] = { scene: g.scene, clip: g.animations[0], box };
    } catch (e) { console.warn('animal missing', n); }
  }));
}
export class Animal {
  constructor(sp, x, z, o = {}) {
    const t = AT[sp], S = SPECIES[sp];
    this.sp = sp; this.S = S;
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.home = { x, z, r: o.r || 8 };
    this.heading = Math.random() * 6.28; this.speed = 0;
    this.root = new THREE.Group();
    this.r = S.r || 0.3; this.down = false; this.animal = true; this.ph = Math.random() * 6;
    if (t) {
      const m = SkeletonUtils.clone(t.scene);
      if (sp === 'buffalo' && !t.clip) this.poseBuffalo = rigBuffalo(m);
      const inner = new THREE.Group(); inner.add(m);
      const s = S.h / (t.box.max.y - t.box.min.y);
      inner.scale.setScalar(s); inner.rotation.y = S.rotY; inner.position.y = -t.box.min.y * s;
      this.root.add(inner); this.inner = inner;
      if (sp === 'goose') { setupGoose(this, m, inner); this.innerY = inner.position.y; }
      if (t.clip) { this.mixer = new THREE.AnimationMixer(m); this.walk = this.mixer.clipAction(t.clip); this.walk.play(); }
    }
    this.state = 'idle'; this.t = Math.random() * 3; this.barkT = 0;
    this.follow = o.follow || null;
    scene.add(this.root);
    animals.push(this);
  }
  distTo(e) { return Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z); }
  update(dt, player) {
    if (this.sp === 'goose' && this.g) { if (this.parked || (this.caught && !this.inPen)) return; updateGoose(this, dt, player); return; }
    if (this.caught) return;
    if (this.sp === 'buffalo') {
      updateBuffalo(this, dt, resolve, heightAt, animals);
      const dp = this.distTo(player);
      this.root.visible = dp < 150;
      this.root.position.copy(this.pos); this.root.rotation.y = this.heading;
      if (dp < 90) this.poseBuffalo?.(this.walkDistance || 0, this.motionTime, this.gaitWeight || 0);
      this.barkT -= dt;
      if (this.barkT <= 0) { if (dp < 24) emit('sfx', 'moo', this.pos); this.barkT = rnd(18, 35); }
      return;
    }
    this.t -= dt; this.barkT -= dt;
    const dp = this.distTo(player);
    let tx = null, tz = null, sp = 0;
    if (this.S.calm && this.state === 'flee') this.state = 'idle';  // 水牛 doesn't scare
    if (this.state === 'flee') {
      const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
      tx = this.pos.x + dx / d * 4; tz = this.pos.z + dz / d * 4; sp = this.S.speed * 1.3;
      if (this.t <= 0) this.state = 'idle';
    } else if (this.sp === 'dog' && dp < 9 && !player.veh && swag() < 12) {
      // the village dog barks at 阿嬤 unless she looks too scary
      if (this.barkT <= 0) { emit('sfx', 'bark', this.pos); this.barkT = rnd(0.8, 1.6); }
      this.heading = dampAngle(this.heading, Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), 6, dt);
      if (dp > 3.2) { tx = player.pos.x; tz = player.pos.z; sp = 2.2; }
    } else if (this.state === 'walk') {
      tx = this.goal[0]; tz = this.goal[1]; sp = this.S.speed * 0.4;
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 0.5 || this.t <= 0) { this.state = 'idle'; this.t = rnd(2, 8); }
    } else if (this.t <= 0) {
      const a = Math.random() * 6.28, r = Math.random() * this.home.r;
      this.goal = [this.home.x + Math.cos(a) * r, this.home.z + Math.sin(a) * r]; this.state = 'walk'; this.t = 12;
      if (Math.random() < 0.3 && dp < 30) emit('sfx', this.S.sfx, this.pos);
    }
    if (tx !== null) {
      const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
      this.heading = dampAngle(this.heading, want, 6, dt);
      this.speed = damp(this.speed, sp, 6, dt);
    } else this.speed = damp(this.speed, 0, 6, dt);
    this.pos.x += Math.sin(this.heading) * this.speed * dt; this.pos.z += Math.cos(this.heading) * this.speed * dt;
    const [x, z] = resolve(this.pos.x, this.pos.z, this.r, this.pos.y);
    this.pos.x = x; this.pos.z = z; this.pos.y = heightAt(x, z);
    if (this.walk) { this.walk.setEffectiveWeight(clamp(this.speed / 0.4, 0, 1)); this.walk.timeScale = clamp(this.speed / (this.S.speed * 0.45), 0.4, 2.6); }
    // cull distant animation work
    if (this.mixer && dp < 90) this.mixer.update(dt);
    this.root.visible = dp < 150;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    if (this.S.waddle && this.inner && dp < 90) { // no skeleton: rock side to side and bob with each step
      this.ph += dt * (2 + this.speed * 7);
      const k = clamp(this.speed / (this.S.speed * 0.3), 0, 1);
      this.inner.rotation.z = Math.sin(this.ph) * this.S.waddle * k;
      this.inner.rotation.x = this.sp === 'buffalo' ? 0 : Math.sin(this.ph * 0.5) * 0.06 * (1 - k);  // geese peck about when idle
    }
  }
  scare(t = 4) { this.state = 'flee'; this.t = t; emit('sfx', this.S.sfx, this.pos); }
}
export const animals = [];

// ---------------------------------------------------------------- projectiles & pickups
export const projectiles = [];
export function spawnProjectile(kind, from, target, fwd, owner, dest = null) {
  const obj = kind === 'slipper' ? slipperMesh() : rolledPaper();
  obj.position.copy(from);
  scene.add(obj);
  const to = target ? target.pos.clone().setY(target.pos.y + 1.0) : dest ? dest.clone() : from.clone().addScaledVector(fwd, 16).setY(heightAt(from.x + fwd.x * 16, from.z + fwd.z * 16) + 0.3);
  const d = from.distanceTo(to);
  const T = clamp(d / 17, 0.25, 1.1);
  const vel = new THREE.Vector3().subVectors(to, from).divideScalar(T);
  vel.y += 0.5 * 9.8 * T;
  projectiles.push({ kind, obj, vel, owner, target, t: 0, spin: rnd(12, 20), dest });
}
export function tickProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.t += dt;
    p.vel.y -= 9.8 * dt;
    p.obj.position.addScaledVector(p.vel, dt);
    p.obj.rotation.x += p.spin * dt; p.obj.rotation.y += p.spin * 0.3 * dt;
    let hit = null;
    if (p.kind === 'slipper') for (const e of ents) {
      if (e === p.owner || e.down || e.veh) continue;
      const hy = e.pos.y + 1.1;
      if (Math.hypot(e.pos.x - p.obj.position.x, e.pos.z - p.obj.position.z) < 0.55 && Math.abs(p.obj.position.y - hy) < 0.9) { hit = e; break; }
    }
    const g = heightAt(p.obj.position.x, p.obj.position.z);
    if (hit) {
      hit.takeHit(p.owner, ITEMS.slipper.dmg, { knock: 0.4 });
      emit('sfx', 'slap', hit.pos); emit('hit', hit, p.owner); emit('shake', 0.2);
      p.vel.multiplyScalar(-0.2);
    }
    if (hit || p.obj.position.y < g + 0.05 || p.t > 4) {
      if (p.kind === 'slipper') { spawnPickup('slipper', p.obj.position.x, p.obj.position.z); }
      else emit('paperLanded', p.obj.position.clone(), p);
      p.obj.removeFromParent();
      projectiles.splice(i, 1);
    }
  }
}
export const pickups = [];
export function spawnPickup(kind, x, z, o = {}) {
  let obj;
  if (kind === 'slipper') obj = slipperMesh();
  else if (kind === 'cash') {
    obj = new THREE.Group();
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: 0x9ab0e0, emissive: 0x203050 }));
    for (let i = 0; i < 3; i++) { const b = bill.clone(); b.position.y = i * 0.02; b.rotation.y = i * 0.4; obj.add(b); }
  } else if (kind === 'cardboard') {
    obj = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.45), new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.95 }));
    obj.position.y = 0.17;
  } else if (kind === 'papers') obj = paperBundle();
  else if (ITEMS[kind]?.slot === 'weapon') { obj = makeWear(kind) || new THREE.Group(); obj.rotation.set(Math.PI / 2, 0, 0.3); }
  else if (kind === 'passbook') obj = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.22), new THREE.MeshStandardMaterial({ color: 0x2a5ab8, emissive: 0x102040 }));
  else obj = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshStandardMaterial({ color: 0xffd040 }));
  const g = new THREE.Group(); g.add(obj);
  g.position.set(x, heightAt(x, z) + (kind === 'cardboard' ? 0 : 0.25), z);
  scene.add(g);
  const p = { kind, obj: g, x, z, amount: o.amount || 1, spin: kind !== 'cardboard', ref: o.ref };
  pickups.push(p);
  return p;
}
export function tickPickups(dt, player, onTake) {
  const t = performance.now() / 1000;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (p.spin) { p.obj.rotation.y = t * 2; p.obj.position.y = heightAt(p.x, p.z) + 0.3 + Math.sin(t * 3 + p.x) * 0.06; }
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (d < (player.veh ? 2.2 : 1.1) && !player.down && (p.kind !== 'cardboard' || !player.veh || player.veh.type === 'tricycle' || player.veh.type === 'minitruck')) {
      onTake(p);
      p.obj.removeFromParent();
      pickups.splice(i, 1);
    }
  }
}

// keep people apart; vehicles push people over
export function separate(player) {
  const n = ents.length;
  for (let i = 0; i < n; i++) {
    const a = ents[i];
    if (a.veh) continue;
    for (let j = i + 1; j < n; j++) {
      const b = ents[j];
      if (b.veh) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      if (Math.abs(dx) > 1 || Math.abs(dz) > 1) continue;
      const d = Math.hypot(dx, dz), m = a.r + b.r;
      if (d < m && d > 1e-4) {
        const k = (m - d) / 2 / d; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k;
        // pushing two people apart must not shove either of them into a wall
        [a.pos.x, a.pos.z] = resolve(a.pos.x, a.pos.z, a.r, a.pos.y); [b.pos.x, b.pos.z] = resolve(b.pos.x, b.pos.z, b.r, b.pos.y);
      }
    }
  }
  for (const v of vehicles) {
    const sp = Math.abs(v.speed);
    let cs = null; // computed lazily, once per vehicle
    for (const e of ents) {
      if (e.veh || e.down) continue;
      if (Math.abs(e.pos.x - v.pos.x) > 3.5 || Math.abs(e.pos.z - v.pos.z) > 3.5) continue;
      cs = cs || v.circles();
      for (const [cx, cz] of cs) {
        const dx = e.pos.x - cx, dz = e.pos.z - cz, d = Math.hypot(dx, dz), m = v.def.r + e.r;
        if (d < m && d > 1e-4) {
          e.pos.x = cx + dx / d * m; e.pos.z = cz + dz / d * m;
          [e.pos.x, e.pos.z] = resolve(e.pos.x, e.pos.z, e.r, e.pos.y);
          if (sp > 3.5 && e !== player) {
            e.takeHit(v.driver, Math.round(sp * 3), { knock: 1.2, kind: 'runOver' });
            if (e.hp > 0) e.knockOut(5);
            emit('sfx', 'thud', e.pos);
            if (v.driver === player) emit('runOver', e);
            v.speed *= 0.8;
          } else if (sp > 5 && e === player && v.driver !== player) {
            e.takeHit(v.driver, Math.round(sp * 2), { knock: 1, kind: 'runOver' });
          }
          break;
        }
      }
    }
  }
  // vehicle vs vehicle
  // vehicle vs vehicle: only pairs where at least one of them is moving
  const moving = vehicles.filter((v) => Math.abs(v.speed) > 0.05 || v.driver);
  for (let i = 0; i < moving.length; i++) for (let j = 0; j < vehicles.length; j++) {
    const A = moving[i], B = vehicles[j];
    if (A === B || (moving.includes(B) && vehicles.indexOf(B) < vehicles.indexOf(A))) continue;
    if (Math.abs(A.pos.x - B.pos.x) > 6 || Math.abs(A.pos.z - B.pos.z) > 6) continue;
    for (const [ax, az] of A.circles()) for (const [bx, bz] of B.circles()) {
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), m = A.def.r + B.def.r;
      if (d < m && d > 1e-4) {
        const k = (m - d) / 2 / d;
        A.pos.x -= dx * k; A.pos.z -= dz * k; B.pos.x += dx * k; B.pos.z += dz * k;
        const rel = Math.abs(A.speed - B.speed);
        if (rel > 3) { emit('carCrash', A, B, rel); A.speed *= 0.5; B.speed *= 0.5; }
      }
    }
  }
}
