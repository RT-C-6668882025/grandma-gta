import { loadModel } from './model-loader.js';
// Rigged characters. Two skeletons are in play:
//  - Tripo Studio / Mixamo preset (阿嬤): 65 bones named mixamorig*, 17 clips
//    (idle, walk, run, swagger, box_01/02, front_kick_01, slash, pitch_baseball,
//    hit_to_head, fall, defeat_02, dance_03, make_a_call_01, angry_01, ...)
//  - Tripo 41-bone rig (Combos NPCs): idle / walk / run / slash
// RIG maps semantic bone names onto either. Loop clips have their root drift
// stripped (and measured, so feet match ground speed). One-shot clips are
// analysed once: the frame where a hand/foot reaches furthest is the "hit".
// Procedural overlays (hurt flinch, smoking, sitting / pedalling, holding
// handlebars) are applied after the mixer, in world space, so they work on
// both skeletons.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { clamp, damp, lerp } from './util.js';

export const KINDS = {
  ama:        { file: 'ama', height: 1.5, rig: 'mixamo', hat: true },
  // 阿水伯 / 阿明 / 阿桃姨 / 阿凱 / 老林: Tripo Studio P2.0 quad → texture → Mixamo rig → 22 presets
  agong:      { file: 'agong', height: 1.62, rig: 'mixamo' },
  // the old Combos versions, kept as extras so the named cast stay one of a kind
  oldman:     { file: 'oldman', height: 1.62 },
  man2:       { file: 'man2', height: 1.72 },
  aunt2:      { file: 'aunt2', height: 1.54 },
  thug2:      { file: 'thug2', height: 1.74 },
  son:        { file: 'son', height: 1.72, rig: 'mixamo' },
  shopkeeper: { file: 'shopkeeper', height: 1.54, rig: 'mixamo' },
  thug:       { file: 'thug', height: 1.74, rig: 'mixamo' },
  police:     { file: 'police', height: 1.7, rig: 'mixamo' },
  auntie:     { file: 'auntie', height: 1.56 },
  farmer:     { file: 'farmer', height: 1.62 },
  qipao:      { file: 'qipao', height: 1.58 },
  jinya:      { file: 'jinya', height: 1.7, rig: 'mixamo' },   // Tripo Studio: P2.0 → texture → retopo → Mixamo rig → 15 presets + 1 text-to-motion
};
const RIG = {
  tripo: { hip: 'Hip', spine: 'Spine01', chest: 'Spine02', head: 'Head', lThigh: 'L_Thigh', rThigh: 'R_Thigh', lCalf: 'L_Calf', rCalf: 'R_Calf', lFoot: 'L_Foot', rFoot: 'R_Foot', lArm: 'L_Upperarm', rArm: 'R_Upperarm', lFore: 'L_Forearm', rFore: 'R_Forearm', lHand: 'L_Hand', rHand: 'R_Hand', lClav: 'L_Clavicle', rClav: 'R_Clavicle' },
  mixamo: { hip: 'mixamorigHips', spine: 'mixamorigSpine1', chest: 'mixamorigSpine2', head: 'mixamorigHead', lThigh: 'mixamorigLeftUpLeg', rThigh: 'mixamorigRightUpLeg', lCalf: 'mixamorigLeftLeg', rCalf: 'mixamorigRightLeg', lFoot: 'mixamorigLeftFoot', rFoot: 'mixamorigRightFoot', lArm: 'mixamorigLeftArm', rArm: 'mixamorigRightArm', lFore: 'mixamorigLeftForeArm', rFore: 'mixamorigRightForeArm', lHand: 'mixamorigLeftHand', rHand: 'mixamorigRightHand', lClav: 'mixamorigLeftShoulder', rClav: 'mixamorigRightShoulder' },
};
// one-shot moves: clip name per rig (first that exists wins); dur = on-screen seconds
export const MOVES = {
  jab:    { clips: ['box_01', 'slash'], dur: 0.5, strike: true },
  cross:  { clips: ['box_02', 'slash'], dur: 0.55, strike: true },
  kick:   { clips: ['front_kick_01', 'slash'], dur: 0.7, strike: true },
  swing:  { clips: ['slash'], dur: 0.72, strike: true },
  throw:  { clips: ['pitch_baseball', 'slash'], dur: 0.9, strike: true },
  hurt:   { clips: ['hit_to_head'], dur: 0.6 },
  fall:   { clips: ['fall'], dur: 1.6, hold: true },
  defeat: { clips: ['defeat_02', 'defeat_03'], dur: 3.0 },
  phone:  { clips: ['make_a_call_01'], dur: 4.5, window: [1.0, 9.0], loop: true },
  angry:  { clips: ['angry_01'], dur: 2.4 },
  complain: { clips: ['complain_01'], dur: 3.2 },
  lift:   { clips: ['lift_heavy'], dur: 3.0, window: [0, 6] },
  dance:  { clips: ['dance_03'], dur: 12.79, loop: true, full: true },
  laugh:  { clips: ['laugh_01'], dur: 3.2, full: true },
  brag:   { clips: ['brag'], dur: 4.96, full: true },          // text-to-motion: laughs, pats his belly, shows off the gold chain
  sing:   { clips: ['sing_01', 'sing_02'], dur: 15, loop: true, full: true },
  fold:   { clips: ['fold_arms'], dur: 17, loop: true, full: true },
  beaten: { clips: ['defeat_03', 'defeat_02'], dur: 5.5, hold: true, full: true },
  clap:   { clips: ['clap'], dur: 3, full: true },
  cheer:  { clips: ['cheer'], dur: 3, full: true },
  wave:   { clips: ['wave_goodbye_01'], dur: 2.5, full: true },
  dive:   { clips: ['dive_ip'], dur: 1.85, full: true },          // 鱼跃扑鹅: played in place, entities.js moves 阿嬤 along DIVE_CURVE
};

const T = {};
const loader = new GLTFLoader();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3(), _t4 = new THREE.Vector3();
const _i1 = new THREE.Vector3(), _i2 = new THREE.Vector3(), _i3 = new THREE.Vector3(), _i4 = new THREE.Vector3(), _i5 = new THREE.Vector3(), _i6 = new THREE.Vector3(), _i7 = new THREE.Vector3(), _i8 = new THREE.Vector3();
const _t5 = new THREE.Vector3(), _t6 = new THREE.Vector3(), _t7 = new THREE.Vector3(), _t8 = new THREE.Vector3();
const _l1 = new THREE.Vector3(), _l2 = new THREE.Vector3(), _l3 = new THREE.Vector3(), _l4 = new THREE.Vector3(), _l5 = new THREE.Vector3(), _l6 = new THREE.Vector3(), _l7 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _hp = new THREE.Vector3(), _hs = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hx = new THREE.Vector3();

// strip root translation drift from the hips track (horizontal axes only)
function fixClip(clip, hipName, hipScale, upAxis, keepVertical = true) {
  const c = clip.clone();
  let drift = 0;
  for (const tr of c.tracks) {
    if (!tr.name.endsWith(hipName + '.position')) continue;
    const v = tr.values, t = tr.times, n = t.length, dur = t[n - 1] || 1;
    let ax = -1, best = 0;
    for (let a = 0; a < 3; a++) { if (a === upAxis) continue; const d = Math.abs(v[(n - 1) * 3 + a] - v[a]); if (d > best) { best = d; ax = a; } }
    if (ax >= 0 && best > 0.02) {
      const d = v[(n - 1) * 3 + ax] - v[ax];
      for (let i = 0; i < n; i++) v[i * 3 + ax] -= d * (t[i] / dur);
      drift = (best * hipScale) / dur;
    }
    // also pin the start so blending in doesn't pop sideways
    for (let a = 0; a < 3; a++) {
      if (a === upAxis) continue;
      const o = v[a];
      for (let i = 0; i < n; i++) v[i * 3 + a] -= o * 0; // keep; offsets are small on these rigs
    }
  }
  c.userData = { drift };
  return c;
}

// pin the hips' horizontal position to the first frame (keep the up axis): the caller moves the body instead
function inPlace(clip, hipName, upAxis) {
  const c = clip.clone();
  for (const tr of c.tracks) {
    if (!tr.name.endsWith(hipName + '.position')) continue;
    const v = tr.values;
    for (let i = 3; i < v.length; i += 3) for (let a = 0; a < 3; a++) if (a !== upAxis) v[i + a] = v[a];
  }
  c.name = clip.name + '_ip';
  return c;
}
// forward travel (m) of 阿嬤's hips through the raw dive clip, sampled every 0.1 s of its 2.7 s
export const DIVE_CURVE = [-0.03, -0.02, 0.01, 0.07, 0.17, 0.26, 0.39, 0.6, 0.8, 1, 1.22, 1.47, 1.72, 1.97, 2.22, 2.48, 2.73, 2.98, 3.17, 3.25, 3.31, 3.42, 3.54, 3.66, 3.75, 3.82, 3.87, 3.89];
export const DIVE_CLIP_LEN = 2.7083;

async function loadKind(kind) {
  if (T[kind]) return T[kind];
  const def = KINDS[kind];
  const rig = RIG[def.rig || 'tripo'];
  const g = await loadModel(loader, `assets/chars/${def.file}.glb`);
  const scene = g.scene;
  scene.updateMatrixWorld(true);
  const bones = {};
  let skinned = null;
  scene.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) { skinned = skinned || o; o.castShadow = true; }
  });
  const box = new THREE.Box3().setFromObject(scene);
  const hRaw = box.max.y - box.min.y;
  const L = bones[rig.lThigh].getWorldPosition(new THREE.Vector3()), Rt = bones[rig.rThigh].getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3().subVectors(L, Rt).cross(UP).setY(0).normalize();
  const yaw = -Math.atan2(fwd.x, fwd.z);
  const hip = bones[rig.hip];
  const hipScale = hip.parent.getWorldScale(new THREE.Vector3()).x;
  // which local axis of the hips' parent is "up": the one the hips sit highest on
  const hp = hip.position;
  const upAxis = [Math.abs(hp.x), Math.abs(hp.y), Math.abs(hp.z)].indexOf(Math.max(Math.abs(hp.x), Math.abs(hp.y), Math.abs(hp.z)));
  const clips = {};
  for (const c of g.animations) {
    // text-to-motion clips come out named after their prompt: give them a short name
    // (Studio re-exports suffix every clip with .001)
    const nm = /^[\x00-\x7f]+$/.test(c.name) ? c.name.replace(/\.\d+$/, '') : 'brag';
    clips[nm] = fixClip(c, rig.hip, hipScale, upAxis);
    if (nm === 'dive') clips.dive_ip = inPlace(c, rig.hip, upAxis);
  }
  if (clips.idle && clips.idle.userData.drift > 0.2) delete clips.idle;
  const t = { kind, def, rig, scene, bones, hRaw, yaw, fwd, clips, skinned, minY: box.min.y, hipScale, upAxis };
  if (def.hat) markHat(t);
  analyseMoves(t);
  t.attach = computeAttach(t, def.height);
  T[kind] = t;
  return t;
}

// the straw hat is baked into 阿嬤's mesh: flag its vertices so it can be hidden
// when another hat is worn (the new hat covers the crown).
function markHat(t) {
  const { skinned, rig } = t;
  const g = skinned.geometry;
  const hi = skinned.skeleton.bones.findIndex((b) => b.name === rig.head);
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
  const n = pos.count;
  const hw = new Float32Array(n);
  let cx = 0, cz = 0, cnt = 0, ymin = 1e9, ymax = -1e9;
  for (let i = 0; i < n; i++) {
    let w = 0;
    for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === hi) w += sw.getComponent(i, c);
    hw[i] = w;
    if (w > 0.5) { cx += pos.getX(i); cz += pos.getZ(i); cnt++; ymin = Math.min(ymin, pos.getY(i)); ymax = Math.max(ymax, pos.getY(i)); }
  }
  cx /= cnt; cz /= cnt;
  const H = ymax - ymin;
  const hat = new Float32Array(n);
  const brimR = 0.085 * t.hRaw, crownY = ymin + 0.56 * H;
  let hb = new THREE.Box3();
  for (let i = 0; i < n; i++) {
    if (hw[i] < 0.5) continue;
    const r = Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz), y = pos.getY(i);
    if (r > brimR || y > crownY) hat[i] = 1;
    else hb.expandByPoint(_v.set(pos.getX(i), y, pos.getZ(i)));
  }
  g.setAttribute('aHat', new THREE.BufferAttribute(hat, 1));
  t.faceBox = hb; // head without the hat, mesh space
}
function hatShader(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHatOff = U;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHat; varying float vHat;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHat = aHat;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uHatOff; varying float vHat;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uHatOff > 0.5 && vHat > 0.5) discard;');
  };
  mat.customProgramCacheKey = () => 'hatmask';
}

// find the strike frame of each one-shot clip: when a hand or foot is furthest
// out horizontally from the hips
function analyseMoves(t) {
  const model = SkeletonUtils.clone(t.scene);
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const mixer = new THREE.AnimationMixer(model);
  t.moves = {};
  const ends = ['rHand', 'lHand', 'rFoot', 'lFoot'].map((k) => bones[t.rig[k]]);
  const hip = bones[t.rig.hip];
  for (const [name, m] of Object.entries(MOVES)) {
    const clipName = m.clips.find((c) => t.clips[c]);
    if (!clipName) continue;
    const clip = t.clips[clipName];
    const D = clip.duration;
    let t0 = 0, t1 = D, hit = D * 0.5;
    if (clipName === 'slash' && t.def.rig !== 'mixamo') { t0 = 0.9; hit = 2.12; t1 = 3.25; }
    else if (m.strike) {
      const a = mixer.clipAction(clip); a.play(); a.setEffectiveWeight(1);
      let best = -1;
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const tt = (i / N) * D;
        a.time = tt; mixer.update(0); model.updateMatrixWorld(true);
        const hp = hip.getWorldPosition(_v);
        for (const e of ends) {
          const ep = e.getWorldPosition(_v2);
          const d = Math.hypot(ep.x - hp.x, ep.z - hp.z);
          if (d > best) { best = d; hit = tt; }
        }
      }
      a.stop();
      const pre = clipName === 'slash' ? 1.1 : clipName === 'pitch_baseball' ? 1.0 : 0.45;
      const post = clipName === 'slash' ? 1.0 : 0.5;
      t0 = Math.max(0, hit - pre); t1 = Math.min(D, hit + post);
    } else if (m.window) { t0 = Math.min(m.window[0], D * 0.2); t1 = Math.min(m.window[1], D); }
    if (m.full) { t0 = 0; t1 = D; }
    t.moves[name] = { clip, t0, t1, hitP: (hit - t0) / (t1 - t0), dur: m.dur, hold: !!m.hold, loop: !!m.loop, own: clipName !== 'slash' || name === 'swing' };
  }
  mixer.stopAllAction();
}

// bone-relative offsets for weapon / glasses / hat / chain / cigarette, in the bind pose
function computeAttach(t, height) {
  const { bones, fwd, hRaw, skinned, rig } = t;
  const k = hRaw / height; // model units per metre
  const wp = (n) => bones[rig[n]].getWorldPosition(new THREE.Vector3());
  const F = fwd.clone(), U = UP.clone(), Rgt = new THREE.Vector3().crossVectors(F, U).normalize(); // actor's right
  const out = {};
  const basis = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const rel = (boneKey, pos, quat, scale) => {
    const D = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(scale, scale, scale));
    return { bone: rig[boneKey], off: bones[rig[boneKey]].matrixWorld.clone().invert().multiply(D) };
  };
  // weapons: grip in the right fist, tip forward, flat side vertical
  {
    const a = wp('rHand').sub(wp('rFore')).normalize();
    const grip = wp('rHand').addScaledVector(a, 0.05 * hRaw).addScaledVector(U, -0.012 * hRaw);
    out.weapon = rel('rHand', grip, basis(new THREE.Vector3().crossVectors(U, F), U, F), k);
    const cig = wp('rHand').addScaledVector(a, 0.07 * hRaw).addScaledVector(F, 0.02 * hRaw);
    out.cig = rel('rHand', cig, basis(F.clone().negate(), U, a.clone()), k);
    out.paper = rel('lHand', wp('lHand').addScaledVector(U, 0.04 * hRaw), basis(Rgt, U, F), k);
    out.bag = rel('lHand', wp('lHand').addScaledVector(wp('lHand').sub(wp('lFore')).normalize(), 0.04 * hRaw), basis(Rgt, U, F), k);
    out.bag.hang = true;
  }
  // head: box of the head-weighted vertices (minus the hat), world space
  {
    let hb;
    if (t.faceBox) { hb = t.faceBox.clone().applyMatrix4(skinned.matrixWorld); }
    else {
      const hi = skinned.skeleton.bones.findIndex((b) => b.name === rig.head);
      const g = skinned.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      hb = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = 0; i < si.count; i++) {
        let w = 0;
        for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === hi) w += sw.getComponent(i, c);
        if (w > 0.5) { skinned.getVertexPosition(i, v); v.applyMatrix4(skinned.matrixWorld); hb.expandByPoint(v); }
      }
    }
    const c = hb.getCenter(new THREE.Vector3()), s = hb.getSize(new THREE.Vector3());
    const width = Math.max(Math.min(s.x, s.z) * 1.0, 0.1 * hRaw);
    t.headTop = hb.max.y; t.headBox = hb;
    const frontDist = Math.abs(F.x) > Math.abs(F.z) ? s.x / 2 : s.z / 2;
    const eyes = c.clone().setY(hb.min.y + s.y * (t.faceBox ? 0.62 : 0.55)).addScaledVector(F, frontDist * 0.92);
    const q = basis(Rgt, U, F);
    out.glasses = rel('head', eyes, q, k); out.glasses.width = (width / k) * 1.18;
    const crown = c.clone().setY(hb.min.y + s.y * (t.faceBox ? 0.78 : 0.72)).addScaledVector(F, -frontDist * 0.05);
    out.hat = rel('head', crown, q, k); out.hat.width = (width / k) * 1.2;
    const mouth = c.clone().setY(hb.min.y + s.y * 0.25).addScaledVector(F, frontDist * 0.95);
    out.mouth = rel('head', mouth, q, k);
  }
  // chest: chain hangs from the base of the neck
  {
    const neck = wp('head').lerp(wp('chest'), 0.55).addScaledVector(F, 0.03 * hRaw);
    out.chain = rel('chest', neck, basis(Rgt, U, F), k);
    out.chain.width = (wp('lClav').distanceTo(wp('rClav')) / k) * 0.62;
  }
  return out;
}

export async function loadActors(kinds) {
  await Promise.all(kinds.map((k) => loadKind(k).catch((e) => console.warn('actor load failed', k, e))));
}
export const hasKind = (k) => !!T[k];
export const template = (k) => T[k];

export class Actor {
  constructor(kind, o = {}) {
    const t = T[kind] || T.farmer || Object.values(T)[0];
    this.kind = t.kind;
    this.t = t;
    this.rig = t.rig;
    this.height = o.height || KINDS[t.kind]?.height || 1.7;
    this.scale = this.height / t.hRaw;
    this.root = new THREE.Group();
    this.root.name = 'actor:' + kind;
    this.model = SkeletonUtils.clone(t.scene);
    this.pivot = new THREE.Group();
    this.pivot.rotation.y = t.yaw;
    this.pivot.scale.setScalar(this.scale);
    this.pivot.position.y = -t.minY * this.scale;
    this.pivot.add(this.model);
    this.root.add(this.pivot);
    this.bones = {};
    this.mats = [];
    this.skins = [];
    this.hatOff = { value: 0 };
    this.model.traverse((o2) => {
      if (o2.isBone) this.bones[o2.name] = o2;
      if (o2.isSkinnedMesh) {
        o2.material = o2.material.clone();
        if (t.def.hat) hatShader(o2.material, this.hatOff);
        o2.castShadow = true;
        o2.frustumCulled = true;
        this.mats.push(o2.material);
        this.skins.push(o2);
      }
    });
    this.baseMap = this.mats[0]?.map || null;
    this.pivot.updateMatrixWorld(true);
    for (const m of this.skins) { m.computeBoundingSphere(); m.boundingSphere.radius *= 1.8; }
    this.shadowOn = true;
    if (o.tint) this.setTint(o.tint);
    this.overlayPose = new Map();
    this.mixer = new THREE.AnimationMixer(this.model);
    this.acts = {};
    for (const n of ['idle', 'walk', 'run', 'swagger']) {
      const c = t.clips[n] || (n === 'idle' ? T.farmer?.clips.idle && this.rig === RIG.tripo ? T.farmer.clips.idle : null : null);
      if (!c) continue;
      const a = this.mixer.clipAction(c);
      a.userData = { drift: (c.userData?.drift || 0) * this.scale };
      this.acts[n] = a;
    }
    this.walkRef = this.acts.walk?.userData.drift || 1.2;
    this.runRef = this.acts.run?.userData.drift || 3.6;
    this.swagRef = this.acts.swagger?.userData.drift || this.walkRef;
    for (const n in this.acts) { this.acts[n].play(); this.acts[n].setEffectiveWeight(n === 'idle' ? 1 : 0); }
    if (this.acts.idle) this.acts.idle.time = Math.random() * 3;
    this.moveActs = {};
    this.w = { idle: 1, walk: 0, run: 0, swagger: 0 };
    this.swag = false;          // swagger walk instead of the normal one
    this.speed = 0;
    this.heading = 0;
    this.gear = {};
    this.hitW = 0; this.flash = 0;
    this.cur = null;            // current one-shot move
    this.down = 0;              // procedural knock-down (NPC rigs without a fall clip)
    this.downT = 0;
    this.sit = 0; this.pedal = 0; this.pedalAmp = 0; this.grip = 0; // riding
    this.smoke = 0; this.smokeT = 0; // smoking overlay 0..1
    this.lean = 0;
    this.root.updateMatrixWorld(true);
  }
  setShadow(on) {
    if (on === this.shadowOn) return;
    this.shadowOn = on;
    for (const m of this.skins) m.castShadow = on;
    for (const s in this.gear) this.gear[s]?.obj.traverse((o) => { if (o.isMesh) o.castShadow = on; });
  }
  setTint(hex) { const c = new THREE.Color(hex); for (const m of this.mats) m.color.copy(c); }
  setMap(tex) { for (const m of this.mats) { m.map = tex || this.baseMap; m.needsUpdate = true; } }
  hideHat(on) { this.hatOff.value = on ? 1 : 0; }
  // attach an Object3D (already in canonical frame) to a slot
  wear(slot, obj, at = slot) {
    const old = this.gear[slot];
    if (old) { this.root.remove(old.obj); this.gear[slot] = null; }
    if (!obj) return;
    obj.matrixAutoUpdate = false;
    obj.traverse((o) => { if (o.isMesh) o.castShadow = this.shadowOn; });
    this.root.add(obj);
    this.gear[slot] = { obj, at: this.t.attach[at] };
  }
  has(move) { return !!this.t.moves[move]; }
  // play a one-shot move. o: {dur, onHit, onEnd, speed}
  play(move, o = {}) {
    const m = this.t.moves[move];
    if (!m) { o.onHit && o.onHit(); o.onEnd && o.onEnd(); return false; }
    if (this.cur && !this.cur.done) { this.cur.a.stop(); }
    let a = this.moveActs[move];
    if (!a) { a = this.mixer.clipAction(m.clip); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; this.moveActs[move] = a; }
    a.reset();
    a.time = m.t0;
    const dur = o.dur || m.dur;
    a.timeScale = (m.t1 - m.t0) / dur;
    a.setEffectiveWeight(0);
    a.play();
    this.cur = { name: move, a, m, dur, el: 0, onHit: o.onHit, onEnd: o.onEnd, hit: false, done: false, hold: m.hold || o.hold, loop: m.loop && o.loop !== false, fade: o.fade ?? 0.12 };
    return true;
  }
  stopMove() { if (this.cur) { this.cur.done = true; this.cur.release = true; } }
  get busy() { return !!(this.cur && !this.cur.done); }
  get moving() { return this.cur?.name; }
  // procedural knock-down for rigs without a fall clip (and the fall clip holds for Mixamo)
  knockDown() { this.down = 1; this.downT = 0; if (this.has('fall') && this.t.moves.fall.own) this.play('fall', { hold: true }); }
  getUp() { this.down = 0; this.downT = 0; if (this.cur?.name === 'fall') this.stopMove(); this.pivot.rotation.x = 0; this.pivot.position.y = -this.t.minY * this.scale; }
  hurt() { this.hitW = 1; this.flash = 1; }

  update(dt) {
    // Undo last frame's procedural rotations before the mixer runs. Some rigs
    // have no usable idle clip, and unchanged mixer tracks are not re-applied.
    // Without this reset, dance/IK rotations accumulate and twist the limbs.
    for (const [bone, quaternion] of this.overlayPose) bone.quaternion.copy(quaternion);
    this.overlayPose.clear();
    const s = this.speed;
    let wi = 1, ww = 0, wr = 0;
    if (s > 0.12 && this.sit < 0.5) {
      const run = clamp((s - this.walkRef * 1.3) / (this.runRef * 0.75 - this.walkRef * 1.3), 0, 1);
      wi = clamp(1 - s / 0.5, 0, 1); ww = (1 - wi) * (1 - run); wr = (1 - wi) * run;
    }
    const k = 10;
    const swag = this.swag && this.acts.swagger ? 1 : 0;
    this.w.idle = damp(this.w.idle, wi, k, dt);
    this.w.walk = damp(this.w.walk, ww * (1 - swag), k, dt);
    this.w.swagger = damp(this.w.swagger, ww * swag, k, dt);
    this.w.run = damp(this.w.run, wr, k, dt);
    // one-shot move weight
    let mw = 0;
    const c = this.cur;
    if (c) {
      c.el += dt;
      const p = c.el / c.dur;
      if (!c.done) {
        mw = Math.min(1, c.el / c.fade);
        if (!c.hit && p >= c.m.hitP) { c.hit = true; c.onHit && c.onHit(); }
        if (p >= 1) {
          if (c.loop) { c.a.time = c.m.t0; c.el = 0; }
          else if (!c.hold) { c.done = true; c.outT = 0; c.onEnd && c.onEnd(); }
          else mw = 1;
        }
        if (c.release) { c.done = true; c.outT = 0; }
      }
      if (c.done) {
        c.outT = (c.outT || 0) + dt;
        mw = Math.max(0, 1 - c.outT / 0.18);
        if (mw <= 0) { c.a.stop(); this.cur = null; }
      }
      if (this.cur) c.a.setEffectiveWeight(mw);
    }
    const body = 1 - mw;
    if (this.acts.idle) this.acts.idle.setEffectiveWeight(Math.max(0.001, this.w.idle * body + (this.sit > 0.5 ? body * 0 : 0)));
    if (this.acts.walk) { this.acts.walk.setEffectiveWeight(this.w.walk * body); this.acts.walk.timeScale = clamp(s / this.walkRef, 0.5, 1.8); }
    if (this.acts.swagger) { this.acts.swagger.setEffectiveWeight(this.w.swagger * body); this.acts.swagger.timeScale = clamp(s / this.swagRef, 0.5, 1.6); }
    if (this.acts.run) { this.acts.run.setEffectiveWeight(this.w.run * body); this.acts.run.timeScale = clamp(s / this.runRef, 0.6, 1.5); }
    this.mixer.update(dt);

    // riding: the root carries the vehicle's lean/roll, so the IK below is solved in the final pose
    if (this.rootQ) this.root.quaternion.copy(this.rootQ); else this.root.rotation.y = this.heading;
    this.root.updateMatrixWorld(true);
    const R = this.rightAxis(), F = this.fwdAxis();
    const B = this.rig;
    // flinch
    this.hitW = Math.max(0, this.hitW - dt * 4);
    if (this.hitW > 0 && !(this.cur && this.cur.name === 'hurt')) this.turnBone(B.spine, R, -0.45 * Math.sin(this.hitW * Math.PI));
    if (this.lean) this.turnBone(B.spine, R, this.lean);
    // riding / sitting: hips flexed, knees bent, hands forward to the bars
    if (this.sit > 0.01) {
      const kk = this.sit;
      const onBike = !!this.feet;
      // base pose: hips flexed, knees bent; IK below puts feet and hands exactly where they belong
      for (const [side, sp] of [['l', 1], ['r', -1]]) {
        this.turnBone(B[side + 'Thigh'], R, (onBike ? 1.05 : 1.45) * kk);
        this.turnBone(B[side + 'Thigh'], F, 0.1 * sp * kk);
        this.turnBone(B[side + 'Calf'], R, (onBike ? -1.1 : -1.35) * kk);
      }
      // lean toward the handlebars: as far as needed for the shoulders to reach the grips
      if (this.grip > 0 && !this.busy && this.bars) this.leanToBars(R, kk * this.grip);
      else if (this.grip > 0 && !this.busy) this.turnBone(B.spine, R, -0.2 * kk * this.grip);
      if (onBike) for (const [side, sp] of [['l', 1], ['r', -1]]) {
        const hip = this.bonePos(side + 'Thigh', _t2);
        // knees point forward, a little up and out
        const pole = _t3.copy(hip).addScaledVector(F, 0.8).addScaledVector(UP, 0.15).addScaledVector(R, -0.12 * sp);
        this.ikChain(B[side + 'Thigh'], B[side + 'Calf'], B[side + 'Foot'], this.feet[side === 'l' ? 0 : 1], pole, kk);
        // keep the sole roughly level, toes forward
        this.levelFoot(B[side + 'Foot'], F, kk);
      }
      for (const [side, sp] of [['l', 1], ['r', -1]]) {
        if (!this.busy && this.grip > 0.01 && this.bars) {
          const sh = this.bonePos(side + 'Arm', _t2);
          const grip = this.bars[side === 'l' ? 0 : 1];
          // the hand bone is the wrist: stop it a palm's width short of the grip, a little above the bar
          const wrist = _t4.subVectors(grip, sh).normalize().multiplyScalar(-0.065 * this.height / 1.5).add(grip).addScaledVector(UP, 0.025);
          // out of reach: let the shoulder blade slide forward toward the grip
          const arm = this.armLen || 0.4;
          if (sh.distanceTo(wrist) > arm * 0.97 && this.bones[B[side + 'Clav']]) {
            const cb = this.bones[B[side + 'Clav']].getWorldPosition(_t5);
            const ax = _t6.crossVectors(_t7.subVectors(sh, cb), _t8.subVectors(wrist, cb));
            const al = ax.length();
            if (al > 1e-6) {
              const ang = Math.min(0.45, (sh.distanceTo(wrist) - arm * 0.97) / Math.max(0.05, sh.distanceTo(cb)));
              this.turnBone(B[side + 'Clav'], ax.divideScalar(al), ang * this.grip * kk);
              this.bonePos(side + 'Arm', sh);
            }
          }
          // elbows bend down and outward
          const pole = _t3.copy(sh).addScaledVector(UP, -0.35).addScaledVector(R, -0.35 * sp).addScaledVector(F, -0.05);
          this.ik(side, wrist, pole, this.grip * kk);
          if (!this.carSeat) this.gripHand(side, sp, R, F, this.grip * kk);
        } else if (!this.busy && this.grip > 0.01) {
          const g = this.grip * kk;
          this.turnBone(B[side + 'Arm'], R, 0.9 * g);
          this.turnBone(B[side + 'Fore'], R, 0.55 * g);
        }
      }
    }
    // smoking: right hand to the mouth every few seconds (two-bone IK)
    if (this.smoke > 0.01 && !this.busy) {
      this.smokeT += dt;
      const cyc = this.smokeT % 5.5;
      const up = cyc < 0.6 ? cyc / 0.6 : cyc < 2.0 ? 1 : cyc < 2.6 ? 1 - (cyc - 2.0) / 0.6 : 0;
      const e = up * up * (3 - 2 * up);
      this.puff = cyc > 1.1 && cyc < 1.9 ? 1 : 0;
      this.exhale = cyc > 2.3 && cyc < 3.4;
      const h = this.height;
      const sh = this.bonePos('rArm', _t1);
      const mouth = this.attachPos('mouth', _t2).addScaledVector(R, 0.03 * h).addScaledVector(F, 0.04 * h).addScaledVector(UP, -0.045 * h);
      const rest = _t3.copy(sh).addScaledVector(UP, -0.3 * h).addScaledVector(F, 0.13 * h).addScaledVector(R, 0.05 * h);
      const target = rest.lerp(mouth, e);
      const pole = _t4.copy(sh).addScaledVector(UP, -0.3 * h).addScaledVector(R, 0.25 * h).addScaledVector(F, -0.05 * h);
      this.ik('r', target, pole, this.smoke);
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 5);
      for (const m of this.mats) m.emissive.setRGB(this.flash * 0.5, this.flash * 0.1, 0);
    }
    // procedural fall for rigs without a clip
    if (this.down > 0 && !(this.cur && this.cur.name === 'fall')) {
      this.downT += dt;
      const f = Math.min(1, this.downT / 0.5);
      this.pivot.rotation.x = -(f * f) * Math.PI / 2 * 0.97;
      this.pivot.position.y = -this.t.minY * this.scale + f * 0.13;
    }
    this.updateGear();
  }
  // lean spine + chest forward about the rider's right axis until the shoulder line is within arm's reach of the grips
  leanToBars(R, w) {
    const B = this.rig;
    const arm = this.armLen ?? (this.armLen = this.bonePos('lArm', _l1).distanceTo(this.bonePos('lFore', _l2)) + _l2.distanceTo(this.bonePos('lHand', _l1)));
    const reach = arm * 0.93 + 0.065 * this.height / 1.5;
    const G = _l3.addVectors(this.bars[0], this.bars[1]).multiplyScalar(0.5);
    for (const [bone, share] of [[B.spine, 0.6], [B.chest, 1]]) {
      const P = this.bones[bone].getWorldPosition(_l4);
      const SL = this.bonePos('lArm', _l1), SR = this.bonePos('rArm', _l2);
      // search both directions (which sign is "forward" depends on the rig's bone axes); aim so the farther shoulder reaches its grip
      let best = 0, bestErr = Infinity, fwd = 1, fwdD = Infinity;
      for (let i = -15; i <= 15; i++) {  // at most ~0.45 rad per bone: a rider leans, she doesn't fold over the bars
        const th = i * 0.03;
        const d = Math.max(_l6.subVectors(SL, P).applyAxisAngle(R, th).add(P).distanceTo(this.bars[0]), _l5.subVectors(SR, P).applyAxisAngle(R, th).add(P).distanceTo(this.bars[1]));
        if (i === 5 || i === -5) { if (d < fwdD) { fwdD = d; fwd = Math.sign(i); } }
        const err = Math.max(0, d - reach) + Math.abs(th) * 0.02;  // smallest lean that gets there
        if (err < bestErr) { bestErr = err; best = th; }
      }
      // always a little forward lean, never backwards
      const th = Math.sign(best) === fwd ? best * share : 0;
      this.turnBone(bone, R, (th + fwd * 0.06) * w);
    }
    // square the shoulders to the grips (idle sway and steering leave one hand farther than the other)
    const C = this.bones[B.chest].getWorldPosition(_l4);
    const up = _l3.subVectors(C, this.bonePos('hip', _l7)).normalize();
    const L0 = this.bonePos('lArm', _l1), R0 = this.bonePos('rArm', _l2);
    let bt = 0, be = Infinity;
    for (let i = -20; i <= 20; i++) {
      const t = i * 0.025;
      const dl = _l5.subVectors(L0, C).applyAxisAngle(up, t).add(C).distanceTo(this.bars[0]);
      const dr = _l6.subVectors(R0, C).applyAxisAngle(up, t).add(C).distanceTo(this.bars[1]);
      const e = Math.max(dl, dr) + Math.abs(dl - dr) * 0.5;
      if (e < be) { be = e; bt = t; }
    }
    this.turnBone(B.chest, up, bt * w);
  }
  // palm down on the bar, fingers wrapped round it
  gripHand(side, sp, R, F, w) {
    if (w < 0.05) return;
    const pre = this.rig.lHand.replace(/LeftHand$/, '').replace(/L_Hand$/, '');
    const S = side === 'l' ? 'Left' : 'Right';
    const hand = this.bones[this.rig[side + 'Hand']];
    const mid = this.bones[pre + S + 'HandMiddle1'], idx = this.bones[pre + S + 'HandIndex1'], pky = this.bones[pre + S + 'HandPinky1'];
    if (!hand || !mid || !idx || !pky) return;
    const out = _l1.copy(R).multiplyScalar(-sp);  // outward along the bar (left grip is on -R)
    // 1) fingers point forward and down over the bar
    const want = _l2.copy(F).multiplyScalar(0.7).addScaledVector(out, 0.25).addScaledVector(UP, -0.55).normalize();
    const H = hand.getWorldPosition(_l3);
    const cur = _l4.subVectors(mid.getWorldPosition(_l5), H).normalize();
    const ax = _l6.crossVectors(cur, want); const sn = ax.length();
    if (sn > 1e-5) this.turnBone(hand.name, ax.divideScalar(sn), Math.atan2(sn, cur.dot(want)) * w);
    // 2) twist about the finger line so index→pinky runs outward along the bar (palm down)
    hand.getWorldPosition(H);
    const line = _l4.subVectors(mid.getWorldPosition(_l5), H).normalize();
    const lat = _l5.subVectors(pky.getWorldPosition(_l6), idx.getWorldPosition(_l7)); lat.addScaledVector(line, -lat.dot(line));
    const o2 = _l6.copy(out).addScaledVector(line, -out.dot(line));
    if (lat.lengthSq() > 1e-8 && o2.lengthSq() > 1e-8) {
      lat.normalize(); o2.normalize();
      this.turnBone(hand.name, line, Math.atan2(_l7.crossVectors(lat, o2).dot(line), lat.dot(o2)) * w);
    }
    // 3) curl each finger toward the palm (palm normal faces down)
    const pn = _l6.crossVectors(_l5.subVectors(pky.getWorldPosition(_l5), idx.getWorldPosition(_l7)), line).normalize();
    if (pn.y > 0) pn.negate();
    for (const fg of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
      const amt = fg === 'Thumb' ? [0.25, 0.35, 0.3] : [0.95, 1.05, 0.7];
      for (let j = 1; j <= 3; j++) {
        const b = this.bones[pre + S + 'Hand' + fg + j], c = this.bones[pre + S + 'Hand' + fg + (j + 1)];
        if (!b || !c) break;
        const seg = _l3.subVectors(c.getWorldPosition(_l3), b.getWorldPosition(_l4)).normalize();
        const k = _l4.crossVectors(seg, pn); const kl = k.length();
        if (kl > 1e-5) this.turnBone(b.name, k.divideScalar(kl), amt[j - 1] * w);
      }
    }
  }
  // world position of an attach point (e.g. 'mouth')
  attachPos(slot, out = new THREE.Vector3()) {
    const at = this.t.attach[slot];
    return out.set(0, 0, 0).applyMatrix4(_m3.multiplyMatrices(this.bones[at.bone].matrixWorld, at.off));
  }
  // two-bone IK on an arm: side 'l' | 'r', world target, world pole (where the elbow should point)
  ik(side, target, pole, w = 1) {
    const B = this.rig;
    this.ikChain(B[side + 'Arm'], B[side + 'Fore'], B[side + 'Hand'], target, pole, w);
  }
  // rotate a foot so its toe line points along F and its sole is level
  levelFoot(name, F, w = 1) {
    const foot = this.bones[name];
    const toe = foot && foot.children[0];
    if (!toe) return;
    const a = foot.getWorldPosition(_i1), b = toe.getWorldPosition(_i2);
    const cur = _i3.subVectors(b, a).normalize();
    const want = _i4.copy(F).setY(-0.25).normalize();
    const ax = _i5.crossVectors(cur, want);
    const s = ax.length();
    if (s > 1e-5) { ax.divideScalar(s); this.turnBone(name, ax, Math.atan2(s, cur.dot(want)) * w); }
  }
  // generic two-bone IK (upper, lower, end bone names)
  ikChain(upName, loName, enName, target, pole, w = 1) {
    const B = this.rig;
    const up = this.bones[upName], lo = this.bones[loName], en = this.bones[enName];
    if (!up || !lo || !en) return;
    const S = up.getWorldPosition(_i1), E = lo.getWorldPosition(_i2), H = en.getWorldPosition(_i3);
    const a = S.distanceTo(E), b = E.distanceTo(H);
    const d = Math.min(Math.max(S.distanceTo(target), Math.abs(a - b) + 1e-3), a + b - 1e-3);
    // 1) bend the elbow so shoulder-to-hand distance is d, bending toward the pole
    const want = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
    const v1 = _i4.subVectors(S, E).normalize(), v2 = _i5.subVectors(H, E).normalize();
    const cur = Math.acos(clamp(v1.dot(v2), -1, 1));
    const toPole = _i6.subVectors(pole, S);
    const axis = _i7.crossVectors(_i8.subVectors(target, S), toPole);
    if (axis.lengthSq() < 1e-8) axis.crossVectors(v1, v2);
    axis.normalize();
    // rotating the forearm about axis by +x opens or closes the elbow; test which
    const tryAng = (ang) => { const r = v2.clone().applyAxisAngle(axis, ang); return Math.abs(Math.acos(clamp(v1.dot(r), -1, 1)) - want); };
    const delta = cur - want;
    const ang = tryAng(delta) < tryAng(-delta) ? delta : -delta;
    this.turnBone(loName, axis, ang * w);
    // 2) swing the upper bone so the end points at the target
    en.getWorldPosition(H);
    const from = _i4.subVectors(H, S).normalize(), to = _i5.subVectors(target, S).normalize();
    const ax2 = _i6.crossVectors(from, to);
    const s2 = ax2.length();
    if (s2 > 1e-6) { ax2.divideScalar(s2); this.turnBone(upName, ax2, Math.atan2(s2, from.dot(to)) * w); }
    // 3) twist about the shoulder-target line so the elbow/knee faces the pole
    lo.getWorldPosition(E);
    const line = _i4.subVectors(target, S).normalize();
    const eOff = _i5.subVectors(E, S); eOff.addScaledVector(line, -eOff.dot(line));
    const pOff = _i6.subVectors(pole, S); pOff.addScaledVector(line, -pOff.dot(line));
    if (eOff.lengthSq() > 1e-8 && pOff.lengthSq() > 1e-8) {
      eOff.normalize(); pOff.normalize();
      const tw = Math.atan2(_i7.crossVectors(eOff, pOff).dot(line), eOff.dot(pOff));
      this.turnBone(upName, line, tw * w);
    }
  }
  rightAxis() { return _v2.set(-1, 0, 0).applyQuaternion(this.root.quaternion).clone(); }
  fwdAxis() { return _v3.set(0, 0, 1).applyQuaternion(this.root.quaternion).clone(); }
  turnBone(name, axis, angle) {
    const bone = this.bones[name];
    if (!bone) return;
    if (!this.overlayPose.has(bone)) this.overlayPose.set(bone, bone.quaternion.clone());
    _q.setFromAxisAngle(axis, angle);
    bone.getWorldQuaternion(_q2).premultiply(_q);
    bone.parent.getWorldQuaternion(_q3).invert();
    bone.quaternion.copy(_q3.multiply(_q2));
    bone.updateMatrixWorld(true);
  }
  updateGear() {
    const inv = _m2.copy(this.root.matrixWorld).invert();
    for (const slot in this.gear) {
      const g = this.gear[slot];
      if (!g || !g.at) continue;
      const bone = this.bones[g.at.bone];
      g.obj.matrix.multiplyMatrices(inv, bone.matrixWorld).multiply(g.at.off);
      if (g.at.hang) {
        // keep the position, drop the rotation: it hangs from the hand, swaying a little with the walk
        _hp.setFromMatrixPosition(g.obj.matrix); _hs.setFromMatrixScale(g.obj.matrix);
        _hq.setFromAxisAngle(_hx.set(1, 0, 0), Math.sin(this.mixer.time * 7) * 0.12 * Math.min(1, this.speed));
        g.obj.matrix.compose(_hp, _hq, _hs);
      }
    }
  }
  bonePos(key, out = new THREE.Vector3()) { return this.bones[this.rig[key]].getWorldPosition(out); }
  headPos(out = new THREE.Vector3()) { return this.bonePos('head', out); }
  gearTip(slot, out = new THREE.Vector3(), along = 0.9) {
    const g = this.gear[slot];
    if (!g) return this.bonePos('rHand', out);
    return out.set(0, 0, along).applyMatrix4(g.obj.matrixWorld);
  }
  dispose() { this.mixer.stopAllAction(); this.root.removeFromParent(); }
}
