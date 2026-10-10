import {economyPlaces} from './town.js';
// Street furniture that makes 番薯寮 read as a busy suburban town rather than
// open countryside: traffic lights that actually cycle (and that traffic
// obeys), election flags on every lamp post, rooftop billboards, red/green
// post boxes, hydrants, bus shelters, street trees in planters along 民生路,
// scooters parked kerbside and a gas station on the provincial road.

import * as THREE from 'three';
import { Kit, C, drawSign } from './kit.js';
import { P } from './layout.js';
import { heightAt } from './terrain.js';
import { rowUnits, parkSpots, doors, lamps } from './town.js';
import { rng } from '../util.js';

const R = rng(515);
const pick = (a) => a[Math.floor(R() * a.length)];

// ---------------------------------------------------------------- traffic lights
// Each crossing on 中正路 has a main (east-west) phase and a side-street phase.
export const signals = []; // {x, z} crossings on the main street
const LAMP = {};
function lampMats() {
  const mk = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  for (const g of ['ew', 'ns']) LAMP[g] = { r: mk(0x330808), y: mk(0x332a08), g: mk(0x083318) };
}
const ON = { r: new THREE.Color(0xff2a1a), y: new THREE.Color(0xffb020), g: new THREE.Color(0x20ff80) };
const OFF = { r: new THREE.Color(0x3a0c0a), y: new THREE.Color(0x3a300a), g: new THREE.Color(0x0a3a1c) };
const CYCLE = { ewG: 14, ewY: 3, nsG: 9, nsY: 3 };
const PERIOD = CYCLE.ewG + CYCLE.ewY + CYCLE.nsG + CYCLE.nsY;
let clock = 0;
// 'g' | 'y' | 'r' for a direction group at the current time
export function lightState(group) {
  const t = clock % PERIOD;
  if (group === 'ew') return t < CYCLE.ewG ? 'g' : t < CYCLE.ewG + CYCLE.ewY ? 'y' : 'r';
  const u = t - CYCLE.ewG - CYCLE.ewY;
  return u < 0 ? 'r' : u < CYCLE.nsG ? 'g' : u < CYCLE.nsG + CYCLE.nsY ? 'y' : 'r';
}
export function tickStreet(dt) {
  clock += dt;
  for (const g of ['ew', 'ns']) {
    const s = lightState(g);
    for (const c of ['r', 'y', 'g']) LAMP[g][c].color.copy(s === c ? ON[c] : OFF[c]);
  }
}
function signalHead(scene, x, y, z, ry, group) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.38, 0.3), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 }));
  box.position.set(x, y, z); box.rotation.y = ry;
  const disc = new THREE.CircleGeometry(0.12, 14);
  ['r', 'y', 'g'].forEach((c, i) => {
    const m = new THREE.Mesh(disc, LAMP[group][c]);
    m.position.set(-0.32 + i * 0.32, 0, 0.152);
    box.add(m);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x151515, side: THREE.DoubleSide }));
    hood.rotation.set(Math.PI / 2, 0, 0); hood.position.set(-0.32 + i * 0.32, 0.03, 0.2);
    box.add(hood);
  });
  scene.add(box);
}
function buildSignals(scene, k) {
  lampMats();
  for (const x of [-150, -60, -14, 50, 120]) {
    signals.push({ x, z: 0 });
    // north-east and south-west corners; the arm reaches over the lane that faces it
    for (const [px, pz, sd] of [[x + 6, -7.0, -1], [x - 6, 7.0, 1]]) {
      k.cyl(px, 0, pz, 0.11, 0.13, 6.2, 0x8a8e90, 8, { metal: true, collide: true });
      k.beam(px, 5.9, pz, px, 5.9, pz + sd * 4.8, 0.06, 0x8a8e90);
      // traffic heading east is on the south lane and looks west; and the other way round
      signalHead(scene, px, 5.6, pz + sd * 4.2, sd > 0 ? -Math.PI / 2 : Math.PI / 2, 'ew');
      // a small head for the side street, facing along z
      signalHead(scene, px + (sd > 0 ? 0.35 : -0.35), 3.6, pz, sd > 0 ? Math.PI : 0, 'ns');
      // push-button box and a pedestrian sign
      k.box(px, 1.1, pz + sd * 0.16, 0.18, 0.28, 0.1, 0xf0c020);
    }
  }
}

// ---------------------------------------------------------------- election flags on the lamp posts
const CANDIDATES = [
  ['3號 林金水 凍蒜', '#1f8a3a', '#fff'], ['7號 陳阿美 拜託', '#1a4fa0', '#fff'], ['1號 黃大發 感恩', '#e8a21a', '#1a1a1a'],
  ['2號 張有財 做事', '#c8201a', '#fff'], ['5號 王秀琴 挺你', '#8a2ab8', '#fff'],
];
function buildFlags(k) {
  const boards = CANDIDATES.map(([t, bg, fg]) => drawSign(t, { bg, fg, border: '#fff' }, true));
  for (let x = -220; x <= 220; x += 30) for (const [px, pz] of [[x, -6.4], [x + 15, 6.4]]) {
    if (R() < 0.25) continue;
    const b = boards[Math.floor(R() * boards.length)];
    k.box(px, 3.0, pz, 0.04, 0.04, 0.7, C.greyD);
    k.sign(px, 3.05, pz + 0.35, 0.62, 2.3, b, Math.PI / 2, { back: true });
  }
}

// ---------------------------------------------------------------- rooftop billboards
const ADS = [
  ['寶力大補 喝了才有力', '#c8201a', '#ffe060', '一瓶 60 元 · 各大柑仔店有售'],
  ['幸福美地 首購自備 20 萬', '#1a3a8a', '#fff', '番薯寮新市鎮 · 捷運預定地旁'],
  ['阿嬤牌米粉 · 炒就是要這味', '#f0c020', '#a01a10', '新竹直送 · 過年送禮最大方'],
  ['好鄰居超商 24H', '#1a9a4a', '#fff', '繳費 · 咖啡 · 關東煮 · 刮刮樂'],
  ['大發檳榔 清涼有勁', '#1f8a3a', '#ffe95a', '台一線 214 號 · 24 小時'],
  ['歡樂卡拉OK 唱到天亮', '#301a60', '#ff6adf', '包廂 · 那卡西 · 啤酒無限暢飲'],
  ['仁愛診所 夜間門診', '#ffffff', '#c0201a', '內科 · 小兒科 · 骨科'],
  ['番薯寮農會 · 豐收', '#2a6a3a', '#fff', '肥料 · 農藥 · 存款 · 保險'],
];
function buildBillboards(k) {
  const tall = rowUnits.filter((u) => u.top > 8);
  let n = 0;
  for (let i = 0; i < tall.length; i += 5) {
    const u = tall[i];
    const [t, bg, fg, sub] = ADS[n++ % ADS.length];
    const uv = drawSign(t, { bg, fg, sub, border: fg });
    const ry = u.side < 0 ? 0 : Math.PI;
    const zf = u.side * 6.3 - u.side * 4;   // a few metres behind the facade
    const y = u.top + 0.9;
    for (const sx of [-2.4, 2.4]) k.box(u.x + sx, y, zf, 0.14, 1.6, 0.14, 0x5a5e62, 0, { metal: true });
    k.box(u.x, y + 1.5, zf, 6.2, 2.5, 0.2, 0x3a3e42, ry, { metal: true });
    k.sign(u.x, y + 1.55, zf - u.side * 0.11, 6.0, 2.4, uv, ry);
    lamps.push({ x: u.x, y: y + 3.2, z: zf - u.side * 0.6, small: true });
  }
}

// ---------------------------------------------------------------- small street things
function postBoxes(k, x, z) {
  for (const [dx, col] of [[-0.35, 0xc8201a], [0.35, 0x1a8a3a]]) {
    k.box(x + dx, 0, z, 0.55, 0.9, 0.5, col, 0, { collide: true });
    k.cyl(x + dx, 0.9, z, 0.27, 0.27, 0.25, col, 12, { rx: Math.PI / 2 });
    k.box(x + dx, 0.62, z + 0.26, 0.3, 0.05, 0.02, 0x111111);
  }
}
function hydrant(k, x, z) {
  k.cyl(x, 0, z, 0.14, 0.16, 0.7, 0xc8201a, 10, { collide: true });
  k.sphere(x, 0.72, z, 0.15, 0xe8c020, { seg: 8 });
  k.cyl(x, 0.35, z, 0.07, 0.07, 0.42, 0xc8201a, 8, { rz: Math.PI / 2 });
}
function busStop(k, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (const lx of [-1.8, 1.8]) { const [px, pz] = W(lx, -0.8); k.box(px, 0, pz, 0.1, 2.5, 0.1, C.steel, ry, { metal: true }); }
  const [rx, rz] = W(0, -0.3); k.box(rx, 2.5, rz, 4.2, 0.1, 1.6, 0x2a6ab8, ry);
  const [bx, bz] = W(0, -0.7); k.box(bx, 0, bz, 3.4, 2.4, 0.06, 0x9ac0d8, ry, { win: true });
  const [sx, sz] = W(0, -0.45); k.box(sx, 0.45, sz, 3.0, 0.06, 0.4, C.wood, ry);
  const uv = drawSign('番薯寮 公車站 · 7路', { bg: '#1a4fa0', fg: '#fff', sub: '往 車站 / 媽祖廟 / 國小' });
  const [gx, gz] = W(2.4, 0.2); k.box(gx, 0, gz, 0.08, 2.9, 0.08, C.steel, ry, { metal: true });
  k.sign(gx, 2.2, gz, 1.4, 0.55, uv, ry, { back: true });
}
function streetTree(k, x, z) {
  k.box(x, 0, z, 1.3, 0.35, 1.3, 0x9a948a, 0, { collide: true });
  k.box(x, 0.35, z, 1.1, 0.02, 1.1, 0x5a4a38);
  k.cyl(x, 0.35, z, 0.1, 0.13, 2.4, 0x5a4a3a, 7);
  for (let i = 0; i < 4; i++) k.sphere(x + (R() - 0.5) * 1.2, 2.8 + R() * 1.0, z + (R() - 0.5) * 1.2, 0.9 + R() * 0.4, R() < 0.5 ? C.leaf : C.leafD, { seg: 7, sy: 0.8 });
}
function gasStation(k) {
  const x = 216, z = -24;
  doors.gas = { x: x - 5, z };
  economyPlaces.push({id:'gas',name:'加油维修站',kind:'tools',x,z});
  k.box(x, 0, z, 20, 0.08, 16, 0xa7a39c);
  for (const [cx, cz] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) k.box(x + cx, 0, z + cz, 0.5, 5.2, 0.5, 0xe8e8e8, 0, { collide: true });
  k.box(x, 5.2, z, 14, 0.7, 11, 0xf0f0f0);
  k.box(x, 5.15, z, 13.6, 0.05, 10.6, 0xfff8e0, 0, { glow: true });
  k.box(x, 5.55, z - 5.51, 14, 0.4, 0.02, 0x1a4fa0);
  k.box(x, 5.15, z + 5.51, 14, 0.4, 0.02, 0xd02020);
  for (const px of [-2.5, 2.5]) {
    k.box(x + px, 0, z, 1.2, 0.2, 5, 0x8a8a84);
    for (const pz of [-1.4, 1.4]) { k.box(x + px, 0.2, z + pz, 0.7, 1.7, 0.45, 0xf0f0f0, 0, { collide: true }); k.box(x + px, 1.2, z + pz + 0.23, 0.5, 0.3, 0.02, 0x1a4fa0, 0, { glow: true }); }
  }
  const uv = drawSign('番薯寮加油站', { bg: '#1a4fa0', fg: '#fff', sub: '92無鉛 29.8 · 95無鉛 31.3 · 98無鉛 33.3' });
  k.box(x - 9, 0, z - 7, 0.3, 6, 0.3, 0x5a5e62);
  k.sign(x - 9, 4.2, z - 6.84, 3.6, 1.6, uv, Math.PI / 2, { back: true });
  const uv2 = drawSign('洗車 · 修車 · 換顏色', { bg: '#f0c020', fg: '#1a1a1a' });
  k.box(x + 9.5, 0, z + 2, 0.1, 3, 5, 0xd0d0d0);
  k.sign(x + 9.44, 2.0, z + 2, 4.6, 0.9, uv2, -Math.PI / 2);
}

export function buildStreet(scene) {
  const k = new Kit(606);
  buildSignals(scene, k);
  buildFlags(k);
  buildBillboards(k);
  for (const [x, z] of [[-96, 7.8], [24, -7.8], [84, 7.8], [-40, 32.6], [60, 43.4], [-176, 7.8]]) postBoxes(k, x, z);
  for (let x = -200; x <= 200; x += 55) { hydrant(k, x + 7, -6.7); hydrant(k, x + 30, 6.7); }
  busStop(k, -100, 7.4, Math.PI);
  busStop(k, 72, -7.4, 0);
  busStop(k, 40, 43.2, Math.PI);
  // 民生路: trees in planters and scooters parked along the kerb
  for (let x = -122; x < 108; x += 12) {
    if (Math.abs(x + 14) < 7) continue;
    streetTree(k, x, 33.0);
    streetTree(k, x + 6, 43.0);
    for (let i = 0; i < 3; i++) if (R() < 0.6) parkSpots.push([x + 2 + i * 1.1, 34.4, Math.PI, 'scooter'], [x + 8 + i * 1.1, 41.6, 0, 'scooter']);
  }
  gasStation(k);
  scene.add(k.build('street'));
}
