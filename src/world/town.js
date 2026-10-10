// 番薯寮 town builder: arcade shophouses (騎樓透天厝) along 中正路, the corner
// shop, hardware store, police box, temple and square, the courtyard house,
// station, school, recycling yard, betel-nut stand, electric poles and wires,
// trees and paddy huts. Geometry goes through Kit and is merged per district.

import * as THREE from 'three';
import { Kit, C, FACADE, drawSign, drawPic } from './kit.js';
import { ROWS, SIDE_ROWS, P, ROADS, LOTS, PADDIES, GARDEN } from './layout.js';
import { hasModel } from './props.js';
import { heightAt, roadDist } from './terrain.js';
import { addBox, addCircle } from '../collide.js';
import { rng } from '../util.js';

export const lamps = [];      // {x,y,z} street lamps (glow at night)
export const doors = {};      // named interaction points
export const spawnSpots = []; // pedestrian waypoints on sidewalks / arcades
export const parkSpots = [];  // [x, z, ry] where parked vehicles go
export const seats = [];      // stools where NPCs sit
export const cardboard = [];  // recyclable pickups {x,z}
export const sideUnits = [];
export const rowUnits = [];
export const economyPlaces = [];

const R = rng(2024);
const pick = (a) => a[Math.floor(R() * a.length)];
const SHOPS = [
  ['好吃麵店', '#d62a1f', '#fff'], ['美美髮廊', '#e05aa0', '#fff'], ['大發檳榔', '#1f8a3a', '#ffe95a'], ['鴻福銀樓', '#b8141a', '#ffd76a'],
  ['順發機車行', '#1a4fa0', '#fff'], ['建興中藥行', '#6a3a1a', '#ffe0a0'], ['阿美早餐店', '#f0c020', '#c01a10'], ['新光眼鏡', '#fff', '#1a4fa0'],
  ['麗華布莊', '#8a1a6a', '#fff'], ['永和豆漿', '#fff6d0', '#c0201a'], ['德昌碾米廠', '#2a6a3a', '#fff'], ['歡樂卡拉OK', '#301a60', '#ff6adf'],
  ['發財彩券行', '#e0281e', '#ffe060'], ['全家福餐廳', '#c0281e', '#fff'], ['阿財理髮', '#1a3a8a', '#fff'], ['金牌婚紗', '#fff', '#b0183a'],
  ['海產粥', '#1a5aa0', '#fff'], ['萬巒豬腳', '#d0301e', '#fff'], ['彰化肉圓', '#f0d020', '#a01a10'], ['冰果室', '#20a0c0', '#fff'],
  ['大同電器行', '#1a3aa0', '#fff'], ['仁心牙科', '#fff', '#1a7a4a'], ['明星補習班', '#f0e020', '#1a1a8a'], ['永大當舖', '#1a1a1a', '#ffd040'],
  ['香香服飾', '#e070a0', '#fff'], ['快樂洗衣', '#50b0e0', '#fff'], ['大眾汽車修理', '#303030', '#f0c020'], ['福記瓦斯行', '#e05010', '#fff'],
  ['水電行', '#1060b0', '#fff'], ['金紙香舖', '#c01a10', '#ffd040'], ['阿嬌自助餐', '#f08020', '#fff'], ['茶葉蛋', '#6a3010', '#fff'],
  ['鎖匠', '#303030', '#fff'], ['藥局', '#1a8a4a', '#fff'], ['冬瓜茶', '#3a2a10', '#ffd060'], ['碗粿', '#f0f0e0', '#2a2a8a'],
];
let shopI = 0;

// roll-up doors: pictures in the atlas
let DOORS = null;
function doorPics() {
  if (DOORS) return DOORS;
  const mk = (base, dark, graffiti) => drawPic((g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 5) { g.fillStyle = dark; g.fillRect(0, y, w, 1.6); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 8, w, 8);
    if (graffiti) { g.fillStyle = 'rgba(220,40,40,0.9)'; g.font = 'bold 30px "PingFang TC",sans-serif'; g.fillText(graffiti, 30 + Math.random() * 200, 70); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,80,40,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 20, 2 + Math.random() * 6); }
  });
  DOORS = [mk('#a8acae', '#7d8184'), mk('#8fa7b8', '#5f7a8d', '內有惡犬'), mk('#b3b0a0', '#838070'), mk('#7f9a7a', '#5a7456', '車庫前請勿停車'), mk('#b8b8b8', '#888', '店面出租')];
  return DOORS;
}

// ---------------------------------------------------------------- shophouse
// origin (cx,cz) = centre of the unit's front column line, ry = facing (local +z = street)
function shophouse(k, cx, cz, ry, w, o = {}) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const W = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  const y0 = o.y ?? 0;
  const gh = 3.6, fh = 3.25;
  const n = o.floors ?? (2 + Math.floor(R() * 3.2));
  const depth = o.depth ?? 14;
  const face = o.color ?? pick(FACADE);
  const top = gh + (n - 1) * fh;
  const open = o.open ?? R() < 0.55;
  const inset = open ? 7 : 3; // open shops have a deep lit interior
  const B = (lx, ly, lz, bw, bh, bd, col, oo = {}) => { const [x, z] = W(lx, lz); k.box(x, y0 + ly, z, bw, bh, bd, col, ry, oo); };
  // upper block (tiles), arcade ceiling, ground body behind the shopfront
  B(0, gh, -depth / 2, w, top - gh, depth, face, { tile: true, collide: false });
  B(0, gh - 0.35, -1.5, w, 0.35, 3, C.concrete);
  B(0, 0, -(inset + depth) / 2, w, gh, depth - inset, C.concreteD, { collide: true });
  // columns: square, tiled like the facade
  for (const sd of [-1, 1]) {
    const lx = sd * (w / 2 - 0.25);
    B(lx, 0, -0.25, 0.5, gh - 0.35, 0.5, o.colColor ?? face, { tile: true });
    const [x, z] = W(lx, -0.25); addBox(x, z, 0.25, 0.25, ry, gh);
  }
  // step at the arcade edge
  B(0, 0, -1.5, w, 0.12, 3, C.concrete);
  // shopfront
  if (open) {
    // interior: side walls and a back wall, then one of several shop fit-outs
    const kind = o.special === 'ktv' ? 'ktv' : o.special === 'mart' ? 'mart' : o.special === 'shop' || o.special === 'hardware' ? 'shelves' : o.special === 'clinic' ? 'clinic' : pick(['shelves', 'diner', 'diner', 'bikes', 'salon', 'boxes']);
    const wallC = pick([C.cream, 0xd8e0d8, 0xe8d8c8, 0xc8d0d8]);
    for (const sd of [-1, 1]) B(sd * (w / 2 - 0.08), 0, -5, 0.16, gh - 0.35, 4, wallC, { collide: true });
    B(0, 0, -7, w, gh, 0.1, wallC);
    B(0, 0.01, -5, w - 0.2, 0.02, 4, pick([0xb8b0a0, 0x8a8a84, 0xc8c0b0]));
    if (kind === 'shelves') {
      for (const sd of [-1, 1]) for (let yy = 0.4; yy < 2.6; yy += 0.55) {
        B(sd * (w / 2 - 0.4), yy, -5, 0.5, 0.05, 3.6, C.wood);
        for (let zz = -6.6; zz < -3.3; zz += 0.3) B(sd * (w / 2 - 0.4), yy + 0.05, zz, 0.36, 0.18 + R() * 0.2, 0.22, pick([C.red, C.yellow, C.blue, C.green, C.orange, C.white, 0xe060a0]));
      }
      for (let yy = 0.5; yy < 2.8; yy += 0.6) B(0, yy, -6.8, w - 1, 0.05, 0.35, C.wood);
      B(w / 2 - 1.3, 0, -3.9, 1.6, 1.0, 0.6, C.woodD, { collide: true });
    } else if (kind === 'diner') {
      // round tables, red stools, a menu board, the noodle counter at the front
      for (let i = 0; i < 2; i++) { const tz = -4.6 - i * 1.6; B(0, 0, tz, 0.08, 0.72, 0.08, C.steel); const [tx2, tz2] = W(0, tz); k.cyl(tx2, y0 + 0.72, tz2, 0.5, 0.5, 0.04, pick([0xe8e0d0, 0xd84030]), 14); for (const sx of [-0.7, 0.7]) { const [sx2, sz2] = W(sx, tz); k.cyl(sx2, y0, sz2, 0.16, 0.18, 0.45, C.red, 8); } }
      const menu = drawSign(pick(['陽春麵 30 · 乾麵 35 · 餛飩湯 40', '滷肉飯 25 · 貢丸湯 30', '肉圓 40 · 四神湯 45', '魯肉飯 · 虱目魚粥 · 燙青菜']), { bg: '#f8f0d8', fg: '#b01810' });
      const [mx2, mz2] = W(0, -6.93); k.sign(mx2, y0 + 2.0, mz2, w - 0.8, 0.7, menu, ry);
      B(-w / 2 + 0.8, 0, -0.9, 1.2, 0.95, 0.7, C.steel, { metal: true, collide: true });
      const [px2, pz2] = W(-w / 2 + 0.6, -0.9); k.cyl(px2, y0 + 0.95, pz2, 0.22, 0.22, 0.3, C.steel, 10, { metal: true });
    } else if (kind === 'bikes') {
      for (let i = 0; i < 3; i++) { B(-w / 2 + 1 + i * 1.2, 0.3, -5, 0.3, 0.55, 1.5, pick([C.white, C.red, C.blue, 0xe0e0e0])); B(-w / 2 + 1 + i * 1.2, 0, -4.3, 0.1, 0.45, 0.45, C.black); B(-w / 2 + 1 + i * 1.2, 0, -5.7, 0.1, 0.45, 0.45, C.black); }
      for (let i = 0; i < 6; i++) B(w / 2 - 0.5, 0.1 + i * 0.35, -6.2, 0.6, 0.3, 0.6, pick([C.black, 0x3a3a3a]));
    } else if (kind === 'salon') {
      for (let i = 0; i < 2; i++) { const zz = -4.4 - i * 1.4; B(w / 2 - 0.9, 0, zz, 0.6, 0.5, 0.6, C.red); B(w / 2 - 0.9, 0.5, zz, 0.6, 0.6, 0.12, C.red); B(w / 2 - 0.12, 0.9, zz, 0.05, 0.9, 0.7, 0xb8d8e8, { win: true }); }
      const [bx2, bz2] = W(-w / 2 + 0.35, 0.2); for (let i = 0; i < 6; i++) k.cyl(bx2, y0 + 0.4 + i * 0.25, bz2, 0.13, 0.13, 0.13, i % 3 === 0 ? C.red : i % 3 === 1 ? C.white : C.blue, 10, { glow: true });
    } else if (kind === 'ktv') {
      // dark room, purple sofas, a big CRT on a stand, disco strips
      B(0, 0.01, -5, w - 0.3, 0.02, 4, 0x2a1a3a);
      for (const sd of [-1, 1]) { B(sd * (w / 2 - 0.6), 0, -5, 0.9, 0.45, 3.4, 0x6a2a8a, { collide: true }); B(sd * (w / 2 - 0.2), 0.45, -5, 0.3, 0.5, 3.4, 0x6a2a8a); }
      // the karaoke set itself is the Tripo prop (placed in props.js)
      B(0, 0, -5, 1.4, 0.45, 0.8, 0x3a2a1a, { collide: true });
      for (const [i, c] of [[0, 0xff40c0], [1, 0x40e0ff], [2, 0xffe040]]) { const [sx2, sz2] = W(0, -5); k.box(sx2, y0 + gh - 0.6 - i * 0.06, sz2 - 0, w - 0.6, 0.03, 0.03, c, ry, { glow: true }); }
    } else if (kind === 'mart') {
      // bright aisles, the drinks cooler along the back, a counter with the oden pot
      for (let i = -1; i <= 1; i++) {
        B(i * (w / 3.2), 0, -5.2, 0.5, 1.5, 2.2, C.white);
        for (let yy = 0.3; yy < 1.5; yy += 0.4) for (let zz = -6.1; zz < -4.2; zz += 0.28) for (const s2 of [-0.3, 0.3]) B(i * (w / 3.2) + s2, yy, zz, 0.08, 0.22, 0.2, pick([C.red, C.yellow, C.blue, C.green, C.orange, 0xe060a0, C.white]));
      }
      B(0, 0, -6.8, w - 0.4, 2.1, 0.5, 0xdfe8ee, { win: true });
      B(-w / 2 + 1.2, 0, -3.8, 1.9, 1.0, 0.6, C.white, { collide: true });
      const [ox, oz] = W(-w / 2 + 0.7, -3.8); k.box(ox, y0 + 1.0, oz, 0.5, 0.18, 0.4, C.steel, ry, { metal: true });
      for (const lz of [-4, -5.3, -6.4]) { const [tx2, tz2] = W(0, lz); k.box(tx2, y0 + gh - 0.45, tz2, w - 1, 0.05, 0.14, 0xf8fffc, ry, { glow: true }); }
      // the signature stripes above the glass
      for (const [i, c] of [[0, 0x1a9a4a], [1, 0xf08a1a], [2, 0xd0201a]]) { const [sx2, sz2] = W(0, 0.26); k.box(sx2, y0 + gh + 1.12 + i * 0.12, sz2, w - 0.2, 0.1, 0.05, c, ry); }
    } else if (kind === 'clinic') {
      B(0, 0, -6.4, w - 1, 0.45, 0.6, 0x7a9ab8); B(-w / 2 + 1, 0, -4, 0.8, 1.05, 0.5, C.white, { collide: true });
      const uv2 = drawSign('掛號 · 批價 · 領藥', { bg: '#fff', fg: '#1a7a4a' }); const [cx2, cz2] = W(0, -6.93); k.sign(cx2, y0 + 2.1, cz2, w - 1, 0.6, uv2, ry);
    } else {
      for (let i = 0; i < 10; i++) B(-w / 2 + 0.6 + R() * (w - 1.2), (i % 3) * 0.5, -6.4 + R() * 2.4, 0.7, 0.5, 0.6, pick([0xa88a5a, 0x9a7a4a, 0xb89a6a, 0xe8e0d0]));
    }
    const [tx, tz] = W(0, -5);
    k.box(tx, y0 + gh - 0.5, tz, 0.12, 0.05, 2.5, 0xf4fff8, ry + Math.PI / 2, { glow: true });
  } else {
    const [dx, dz] = W(0, -3.02);
    const pic = pick(doorPics());
    k.sign(dx, y0 + 0.02, dz, w - 0.5, gh - 0.45, pic, ry);
    addBox(dx, dz, w / 2, 0.1, ry, gh);
    if (R() < 0.5) B(-w / 2 + 0.9, 0, -3.1, 0.9, 2.2, 0.06, C.dark); // side door
  }
  // arcade ceiling light
  { const [lx, lz] = W(0, -1.5); k.box(lx, y0 + gh - 0.4, lz, 0.5, 0.05, 0.12, 0xfff6e0, ry, { glow: true }); }
  // horizontal sign board above the arcade
  const sh = SHOPS[shopI++ % SHOPS.length];
  const name = o.name || sh[0];
  economyPlaces.push({id:o.special || 'building:'+economyPlaces.length,name,x:cx,z:cz,kind:o.sub?.includes('住戶')||['永和社區','番薯寮新村','幸福大廈'].includes(name)?'housing':'business',special:o.special});
  // each shop name always gets the same board (so identical boards share one atlas cell)
  const hn = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const uv = drawSign(name, { bg: o.signBg || sh[1], fg: o.signFg || sh[2], border: hn % 2 ? 'rgba(255,255,255,0.6)' : null, sub: o.sub || (hn % 5 < 2 ? ['電話：(05)2-XXXXX', '營業中', '老店 · 四十年', '批發零售', '歡迎光臨'][hn % 5] : null) });
  { const [x, z] = W(0, 0.12); k.box(x, y0 + gh + 0.02, z, w - 0.2, 1.05, 0.2, C.greyD, ry); const [x2, z2] = W(0, 0.23); k.sign(x2, y0 + gh + 0.08, z2, w - 0.4, 0.93, uv, ry); }
  // vertical protruding sign
  if (R() < 0.55 && n >= 3) {
    const sh2 = SHOPS[(shopI * 7) % SHOPS.length];
    const vuv = drawSign(sh2[0].slice(0, 5), { bg: sh2[1], fg: sh2[2], border: '#fff' }, true);
    const side = R() < 0.5 ? -1 : 1, lx = side * (w / 2 - 0.3), yb = gh + 1.3, hh = Math.min(3.8, top - yb - 0.3);
    B(lx, yb, 0.55, 0.22, hh, 1.1, C.greyD);
    const [x1, z1] = W(lx + 0.12, 0.55), [x2, z2] = W(lx - 0.12, 0.55);
    k.sign(x1, y0 + yb + 0.05, z1, 1.0, hh - 0.1, vuv, ry + Math.PI / 2);
    k.sign(x2, y0 + yb + 0.05, z2, 1.0, hh - 0.1, vuv, ry - Math.PI / 2);
  }
  // upper floors: windows with iron grilles, AC units, balconies, laundry
  for (let f = 1; f < n; f++) {
    const fy = gh + (f - 1) * fh;
    const wins = w > 5 ? 2 : 1;
    const balcony = f === 1 && R() < 0.3;
    if (balcony) {
      B(0, fy - 0.05, 0.45, w - 0.3, 0.15, 0.9, C.concrete);
      B(0, fy + 0.1, 0.86, w - 0.3, 1.0, 0.06, C.grey, { metal: true });
      if (R() < 0.7) { for (let i = 0; i < 4; i++) B(-w / 2 + 1 + i * 0.9, fy + 1.3, 0.6, 0.5, 0.7, 0.02, pick([C.red, C.blue, C.white, C.yellow, 0xe070a0])); B(0, fy + 2.0, 0.6, w - 0.6, 0.03, 0.03, C.steel, { metal: true }); }
      if (R() < 0.6) for (let i = 0; i < 3; i++) { const [px, pz] = W(-w / 2 + 0.8 + i * 1.1, 0.6); k.cyl(px, y0 + fy + 0.1, pz, 0.2, 0.15, 0.3, C.brick, 8); k.sphere(px, y0 + fy + 0.55, pz, 0.28, C.leaf); }
    }
    for (let i = 0; i < wins; i++) {
      const lx = wins === 1 ? 0 : (i - 0.5) * (w / 2);
      const ww = Math.min(2.2, w / wins - 0.9), wh = 1.5;
      B(lx, fy + 0.9, 0.01, ww + 0.16, wh + 0.16, 0.06, 0xd8dcdc);
      const [gx, gz] = W(lx, 0.05); k.box(gx, y0 + fy + 0.98, gz, ww, wh, 0.03, C.glass, ry, { win: true });
      // iron grille cage (鐵窗)
      if (!balcony && R() < 0.75) {
        const gc = pick([C.steel, 0x6a7a6a, 0x9a3a2a, 0xcfcfcf]);
        B(lx, fy + 0.75, 0.2, ww + 0.4, 0.05, 0.42, gc, { metal: true });
        B(lx, fy + 0.95 + wh, 0.2, ww + 0.4, 0.05, 0.42, gc, { metal: true });
        for (let bx = -ww / 2 - 0.15; bx <= ww / 2 + 0.16; bx += 0.14) B(lx + bx, fy + 0.8, 0.41, 0.02, wh + 0.15, 0.02, gc, { metal: true });
        if (R() < 0.4) { for (let t = 0; t < 3; t++) { const [px, pz] = W(lx - ww / 2 + 0.3 + t * 0.5, 0.3); k.sphere(px, y0 + fy + 0.95, pz, 0.18, C.leaf); } }
      }
      if (R() < 0.45) {
        const ax = lx + (R() < 0.5 ? -1 : 1) * (ww / 2 - 0.2);
        B(ax, fy + 0.15, 0.3, 0.8, 0.5, 0.35, 0xe6e4dc);
        const [fx2, fz2] = W(ax + 0.12, 0.49); k.cyl(fx2, y0 + fy + 0.4 - 0.18, fz2, 0.17, 0.17, 0.02, 0x555555, 12, { rx: Math.PI / 2, ry });
      }
    }
  }
  // roof: parapet, water tanks, rebar, rooftop shed
  B(0, top, -0.08, w, 0.9, 0.16, face, { tile: true });
  B(0, top, -depth + 0.08, w, 0.9, 0.16, C.concrete);
  for (const sd of [-1, 1]) B(sd * (w / 2 - 0.08), top, -depth / 2, 0.16, 0.9, depth, C.concrete);
  if (R() < 0.8) {
    const [tx, tz] = W((R() - 0.5) * (w - 2), -depth * (0.3 + R() * 0.4));
    for (const [ox, oz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) k.box(tx + ox, y0 + top, tz + oz, 0.08, 1.3, 0.08, C.greyD, 0, { metal: true });
    const tank = R() < 0.7;
    k.cyl(tx, y0 + top + 1.3, tz, 0.62, 0.62, 1.5, tank ? C.steel : C.blue, 14, { metal: tank });
    k.sphere(tx, y0 + top + 2.8, tz, 0.62, tank ? C.steel : C.blue, { sy: 0.3, metal: tank });
  }
  if (R() < 0.5) for (const sd of [-1, 1]) for (let r = 0; r < 3; r++) { const [x, z] = W(sd * (w / 2 - 0.2 - r * 0.15), -0.3); k.beam(x, y0 + top + 0.9, z, x + (R() - 0.5) * 0.2, y0 + top + 2.2, z, 0.02, 0x6a3a22); }
  if (R() < 0.35) {
    const sd = -depth * 0.55, sw = w - 0.4, sdp = depth * 0.5;
    B(0, top, sd, sw, 2.4, sdp, R() < 0.5 ? C.tin : 0x7fa0b8, { metal: true });
    const [rx, rz] = W(0, sd); k.tin(rx, y0 + top + 2.55, rz, sw + 0.4, sdp + 0.6, pick([C.tin, C.tinRust, 0x5a8ac0]), ry, 0.08);
  }
  // walk points in the arcade
  const [ax, az] = W(0, -1.5);
  spawnSpots.push([ax, az]);
  return { top, door: W(0, open ? -4.6 : -2.4), front: W(0, 0.6), open };
}

// a row of shophouses along the main street
function buildRow(scene, x0, x1, side) {
  const k = new Kit(Math.floor(x0 * 7 + side * 13 + 999));
  const ry = side < 0 ? 0 : Math.PI;
  const cz = side * 6.3;
  let x = x0;
  const units = [];
  while (x < x1 - 3.5) {
    const w = Math.min(x1 - x, 4.6 + Math.floor(R() * 3) * 0.7);
    const mid = x + w / 2;
    let o = {};
    if (Math.abs(mid - P.shop.x) < w / 2 + 0.01 && side < 0) o = { name: '阿桃柑仔店', signBg: ['#f4e7b8', '#e8d08a'], signFg: '#b01810', sub: '菸酒 · 雜貨 · 刮刮樂', open: true, floors: 2, color: C.cream, special: 'shop' };
    else if (Math.abs(mid - P.hardware.x) < w / 2 + 0.01 && side < 0) o = { name: '金興五金行', signBg: '#1a4fa0', signFg: '#fff', sub: '棍棒 · 雨傘 · 工具', open: true, floors: 3, special: 'hardware' };
    else if (Math.abs(mid - P.police.x) < w / 2 + 0.01 && side < 0) o = { name: '番薯寮派出所', signBg: '#f4f6f8', signFg: '#1a3a8a', open: false, floors: 3, color: C.white, special: 'police' };
    else if (Math.abs(mid - P.clinic.x) < w / 2 + 0.01 && side > 0) o = { name: '仁愛診所', signBg: '#fff', signFg: '#c0201a', sub: '內科 · 小兒科', open: true, floors: 3, color: C.white, special: 'clinic' };
    const u = shophouse(k, mid, cz, ry, w, o);
    if (o.special) doors[o.special] = { x: u.door[0], z: u.door[1] };
    units.push({ x: mid, side, w, ...u });
    x += w;
  }
  const g = k.build('row');
  scene.add(g);
  return units;
}

// a row along any straight street segment. side +1 = right of travel a->b
function buildRowSeg(scene, ax, az, bx, bz, side, off, specials = [], depth = 14) {
  const k = new Kit(Math.floor(ax * 13 + az * 7 + side * 31 + 5000));
  const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
  const nx = -dz * side, nz = dx * side; // toward the buildings
  const ry = Math.atan2(-nx, -nz);
  const units = [];
  let s = 0;
  while (s < L - 4) {
    const w = Math.min(L - s, 4.6 + Math.floor(R() * 3) * 0.7);
    const t = s + w / 2;
    const cx = ax + dx * t + nx * off, cz = az + dz * t + nz * off;
    const sp = specials.find((q) => Math.hypot(q.near[0] - cx, q.near[1] - cz) < w / 2 + 0.6);
    const u = shophouse(k, cx, cz, ry, w, sp ? { depth, ...sp.o } : { floors: 2 + Math.floor(R() * 2.4), depth });
    if (sp) doors[sp.o.special] = { x: u.door[0], z: u.door[1] };
    units.push({ x: cx, z: cz, w, ry, nx, nz, ...u });
    s += w;
  }
  scene.add(k.build('siderow'));
  return units;
}
// low houses filling the blocks behind the shophouse rows
function backfill(scene) {
  const k = new Kit(4242);
  // behind the main street: 4–8 storey walk-ups and 華廈 — the suburban skyline
  const resid = ['幸福大廈', '金龍華廈', '吉祥公寓', '富貴名門', '番薯寮新村', '國宅', '福星大樓', '長安華廈'];
  let ri = 0;
  for (let x = -144; x < 90;) {
    const w = 9 + Math.floor(R() * 3) * 2;
    const mid = x + w / 2;
    if ((mid > -86 && mid < -34) || (mid > 26 && mid < 74)) { x += 4; continue; }
    shophouse(k, mid, -24, 0, w, { floors: 4 + Math.floor(R() * 5), open: false, depth: 12, name: resid[ri++ % resid.length], signBg: '#ece8dc', signFg: '#3a3a3a', sub: '住戶專用 · 請勿停車' });
    x += w + (R() < 0.3 ? 3 : 0);
  }
  // farmhouses at the rural fringe only (west of the banyan, and behind the market)
  const spots = [];
  for (let x = -215; x < -168; x += 11 + R() * 6) spots.push([x, 29 + R() * 12, Math.PI]);
  for (let x = -215; x < -160; x += 11 + R() * 6) spots.push([x, -(29 + R() * 12), 0]);
  for (const [x, z] of [[-92, -70], [-92, -100], [-34, -70], [-34, -100]]) spots.push([x + (R() - 0.5) * 4, z, R() < 0.5 ? Math.PI / 2 : -Math.PI / 2]);
  for (const [x, z, ry] of spots) farmhouse(k, x, z, ry);
  scene.add(k.build('backfill'));
}

// ---------------------------------------------------------------- electric poles, wires, lamps
function buildPoles(scene) {
  const k = new Kit(77);
  const wires = [];
  const poles = [];
  const addLine = (a, b, sag = 0.5) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, a[2] + (b[2] - a[2]) * t];
      wires.push(...p(t0), ...p(t1));
    }
  };
  const poleAt = (x, z, lamp, lampDir) => {
    const y = heightAt(x, z);
    k.cyl(x, y, z, 0.13, 0.18, 9.5, 0x8d8a82, 8, { collide: true });
    k.box(x, y + 8.6, z, 1.8, 0.1, 0.1, C.greyD, Math.atan2(lampDir[0], lampDir[1]) + Math.PI / 2);
    for (const o of [-0.7, 0, 0.7]) k.cyl(x + lampDir[1] * o, y + 8.7, z - lampDir[0] * o, 0.04, 0.04, 0.12, 0xdddddd, 6);
    if (R() < 0.3) k.cyl(x - lampDir[0] * 0.35, y + 7.2, z - lampDir[1] * 0.35, 0.28, 0.28, 0.8, 0x7a7e80, 10, { metal: true });
    // yellow/black striped guard
    k.cyl(x, y, z, 0.2, 0.2, 1.6, C.yellow, 8);
    for (let i = 0; i < 4; i++) k.cyl(x, y + 0.2 + i * 0.4, z, 0.205, 0.205, 0.18, C.black, 8);
    if (lamp) {
      const lx = x + lampDir[0] * 1.8, lz = z + lampDir[1] * 1.8;
      k.beam(x, y + 6.8, z, lx, y + 7.2, lz, 0.05, C.grey);
      k.box(lx, y + 7.0, lz, 0.5, 0.18, 0.3, C.greyD, Math.atan2(lampDir[0], lampDir[1]));
      k.box(lx, y + 6.95, lz, 0.4, 0.05, 0.24, 0xfff0c0, Math.atan2(lampDir[0], lampDir[1]), { glow: true });
      lamps.push({ x: lx, y: y + 6.9, z: lz });
    }
    poles.push([x, y + 8.7, z, lampDir]);
  };
  // main street: poles on both kerbs, alternating
  for (let x = -220; x <= 220; x += 30) { poleAt(x, -6.4, true, [0, 1]); poleAt(x + 15, 6.4, true, [0, -1]); }
  for (let i = 0; i < poles.length; i++) {
    const a = poles[i], b = poles[i + 2];
    if (!b) continue;
    for (const o of [-0.7, 0, 0.7]) addLine([a[0] + o * a[3][1] * 0, a[1] + 0.05, a[2] + o], [b[0], b[1] + 0.05, b[2] + o], 0.6);
    addLine([a[0], a[1] - 1.5, a[2]], [b[0], b[1] - 1.5, b[2]], 0.9);
    // drop wires into the buildings
    if (i % 2 === 0) addLine([a[0], a[1] - 1.5, a[2]], [a[0] + 3, 5.2, a[2] - 5 * Math.sign(a[2] || 1) * -1], 0.3);
  }
  // other roads: one side, every 34 m
  for (const r of ROADS) {
    if (r.kind === 'main') continue;
    for (let s = 0; s < r.pts.length - 1; s++) {
      const [ax, az] = r.pts[s], [bx, bz] = r.pts[s + 1];
      const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      const nx = -dz, nz = dx;
      let prev = null;
      for (let t = 14; t < L - 6; t += 34) {
        const x = ax + dx * t + nx * (r.w / 2 + 0.8), z = az + dz * t + nz * (r.w / 2 + 0.8);
        if (Math.abs(z) < 14 && Math.abs(x) < 232) continue;
        poleAt(x, z, r.kind !== 'field', [-nx, -nz]);
        const p = poles[poles.length - 1];
        if (prev) { addLine([prev[0], prev[1], prev[2]], [p[0], p[1], p[2]], 0.7); addLine([prev[0], prev[1] - 1.5, prev[2]], [p[0], p[1] - 1.5, p[2]], 0.9); }
        prev = p;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x151515, fog: true }));
  lines.name = 'wires';
  scene.add(lines);
  scene.add(k.build('poles'));
}

// ---------------------------------------------------------------- temple 媽祖廟
function buildTemple(scene) {
  const k = new Kit(31);
  const kh = new Kit(32); // the hall itself: swapped for the Tripo temple when it's available
  const { x, z } = P.temple;
  const y = 0;
  // platform with steps
  kh.box(x, y, z - 8, 30, 0.9, 20, 0xa89e90, 0, { collide: true, tag: 'hall' });
  for (let i = 0; i < 4; i++) kh.box(x, y, z + 2.5 + i * 0.5, 14, 0.9 - i * 0.22, 1.0, 0xb8ae9e);
  // main hall: red columns, carved doors, walls
  const hy = y + 0.9;
  kh.box(x, hy, z - 10, 22, 5.2, 12, 0xd8c8b0, 0, { collide: true, tag: 'hall' });
  for (let i = -3; i <= 3; i++) { kh.cyl(x + i * 3.2, hy, z - 3.2, 0.28, 0.3, 5.0, C.red, 12, { collide: true, tag: 'hall' }); kh.box(x + i * 3.2, hy, z - 3.2, 0.8, 0.4, 0.8, 0x6a6a64); }
  // front wall with three carved doors
  kh.box(x, hy, z - 4.05, 22, 5.2, 0.1, 0xb8321e);
  for (const dx of [-6.4, 0, 6.4]) {
    const uv = drawPic((g, w, h) => {
      g.fillStyle = '#9a1a12'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d9a23a';
      for (let r = 0; r < 12; r++) for (let c = 0; c < 3; c++) { g.beginPath(); g.arc(24 + c * 40, 30 + r * 40, 6, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#e8c060'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    }, true);
    kh.sign(x + dx, hy, z - 3.98, dx === 0 ? 3 : 2.4, 3.8, uv);
  }
  // plaque 番薯寮 天后宮
  const plq = drawSign('天后宮', { bg: '#1a1a1a', fg: '#e8c060', border: '#c8a040', serif: true });
  kh.sign(x, hy + 4.0, z - 3.9, 3.6, 0.95, plq);
  // roofs: two stacked swallowtail roofs with upturned ridge ends
  const roofC = 0xa8412a;
  kh.box(x, hy + 5.2, z - 9.2, 24, 0.5, 14, C.red);
  kh.roof(x, hy + 5.7, z - 9.2, 25, 15, 3.2, roofC);
  kh.box(x, hy + 8.8, z - 9.2, 25, 0.35, 0.5, 0xe8c060);
  for (const sd of [-1, 1]) {
    // swallowtail: ridge ends sweep up and split
    for (let t = 0; t < 5; t++) kh.box(x + sd * (12.5 + t * 0.5), hy + 8.85 + t * t * 0.1, z - 9.2, 0.6, 0.3, 0.45 - t * 0.05, 0xe8c060, 0, { rz: -sd * (0.25 + t * 0.12) });
    kh.box(x + sd * 14.8, hy + 10.4, z - 9.2 - 0.25, 0.25, 0.9, 0.15, 0xe8c060, 0, { rz: -sd * 0.9 });
    kh.box(x + sd * 14.8, hy + 10.4, z - 9.2 + 0.25, 0.25, 0.9, 0.15, 0xe8c060, 0, { rz: -sd * 0.9 });
  }
  // ridge ornaments: dragons (colourful ceramic 剪黏), pearl in the middle
  kh.sphere(x, hy + 9.6, z - 9.2, 0.55, 0xf05030, { seg: 12 });
  kh.box(x, hy + 9.1, z - 9.2, 1.5, 0.2, 0.4, 0xe8c060);
  for (const sd of [-1, 1]) {
    for (let t = 0; t < 10; t++) {
      const px = x + sd * (1.3 + t * 0.55), py = hy + 9.2 + Math.sin(t * 0.9) * 0.35 + 0.2;
      kh.sphere(px, py, z - 9.2, 0.26 - t * 0.012, t % 3 === 0 ? 0x2a9a6a : t % 3 === 1 ? 0x2a6ab8 : 0xe8c060, { seg: 8 });
    }
    kh.box(x + sd * 1.1, hy + 9.6, z - 9.2, 0.3, 0.6, 0.3, 0x2a9a6a, 0, { rz: sd * 0.5 });
  }
  // lower front porch roof
  kh.roof(x, hy + 4.4, z - 2.6, 23, 4.2, 1.1, roofC);
  // lanterns under the porch
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    kh.sphere(x + i * 3.2, hy + 3.4, z - 2.4, 0.42, 0xe8301e, { sy: 1.25, seg: 12, glow: true });
    kh.box(x + i * 3.2, hy + 2.8, z - 2.4, 0.2, 0.12, 0.2, 0xe8c060);
    lamps.push({ x: x + i * 3.2, y: hy + 3.4, z: z - 2.4, red: true });
  }
  // stone lions
  for (const sd of [-1, 1]) { kh.box(x + sd * 5, y, z + 4.2, 1.1, 1.0, 1.1, 0x8a8a84, 0, { collide: true, tag: 'hall' }); kh.sphere(x + sd * 5, y + 1.6, z + 4.2, 0.6, 0x8a8a84); kh.sphere(x + sd * 5, y + 2.1, z + 4.4, 0.42, 0x7a7a74); }
  // incense burner (天公爐) in front
  const bx = x, bz = z + 9;
  k.cyl(bx, y, bz, 0.7, 0.9, 0.5, 0x6a5a3a, 10, { collide: true });
  k.cyl(bx, y + 0.5, bz, 1.15, 0.8, 1.1, 0x8a6a2a, 14, { metal: true });
  k.cyl(bx, y + 1.6, bz, 1.2, 1.2, 0.12, 0xa8843a, 14, { metal: true });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.box(bx + Math.cos(a) * 0.9, y + 1.7, bz + Math.sin(a) * 0.9, 0.12, 0.6, 0.12, 0x8a6a2a); }
  doors.incense = { x: bx, z: bz + 1.6 };
  doors.temple = { x, z: z + 4 };
  // gold-paper furnace (金爐) to the side
  k.box(x + 17, y, z - 2, 2.4, 3.2, 2.4, 0xa8412a, 0, { collide: true });
  k.roof(x + 17, y + 3.2, z - 2, 3, 3, 1, roofC);
  k.box(x + 17, y + 0.6, z - 0.78, 1.0, 1.0, 0.05, 0x201008);
  // opposite: open-air stage (戲台) at the south end of the square
  const sz = P.square.z + 20;
  k.box(x, y, sz, 14, 1.3, 6, 0x8a3a24, 0, { collide: true });
  for (const sd of [-1, 1]) k.box(x + sd * 6.8, y + 1.3, sz, 0.35, 4.2, 0.35, C.red);
  k.box(x, y + 5.5, sz, 15, 0.6, 7, C.red);
  const st = drawSign('番薯寮 · 廟口歌舞', { bg: '#1a1060', fg: '#ffe060', border: '#ff60c0' });
  k.sign(x, y + 5.5, sz - 3.52, 8, 0.6, st, Math.PI);
  // a string of flags across the square
  const flags = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const fx = x - 26 + t * 52, fy = y + 7 - Math.sin(Math.PI * t) * 1.2, fz = P.square.z - 6;
    const prev = flags[flags.length - 1];
    if (prev) k.beam(prev[0], prev[1], prev[2], fx, fy, fz, 0.012, 0x222222);
    if (i < 24) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.0, 0, 0, 0.5, -0.55, 0, 0, 0, 0, 0.5, -0.55, 0, 1.0, 0, 0], 3)); g.computeVertexNormals(); k._push(g, [C.red, C.yellow, C.blue, C.green, 0xf060a0][i % 5], fx + 0.05, fy - Math.sin(Math.PI * (i + 0.5) / 24) * 0.05, fz, 0, 0, 0, 0.05, k.parts, false); }
    flags.push([fx, fy, fz]);
  }
  // banyan in the square with a stone ring bench
  banyan(k, x - 22, P.square.z + 8, 1.2);
  k.cyl(x - 22, y, P.square.z + 8, 4.2, 4.2, 0.45, 0x9a948a, 20);
  seats.push([x - 22 + 4, P.square.z + 8, -Math.PI / 2], [x - 22 - 4, P.square.z + 8, Math.PI / 2], [x - 22, P.square.z + 12, Math.PI]);
  scene.add(k.build('temple'));
  const hall = kh.build('templeHall');
  scene.add(hall);
  court.templeHall = hall;
}

// ---------------------------------------------------------------- 三合院 home
function buildHome(scene) {
  const k = new Kit(5);
  const { x, z } = P.home;
  const brick = C.brick, roof = 0x8a3a28, roofG = 0x6a6660;
  // main hall (正身) at the south, wings (護龍) east and west; courtyard opens north
  const hall = (cx, cz, w, d, ry) => {
    k.box(cx, 0, cz, w, 0.35, d, 0x9a948a, ry);
    k.box(cx, 0.35, cz, w, 3.2, d, brick, ry, { collide: true, brick: true });
    k.roof(cx, 3.55, cz, w + 0.9, d + 1.4, 1.9, roof, ry);
  };
  hall(x, z + 9, 18, 6.5, 0);
  // eave beams and the grey tile ridge caps
  for (const [cx, cz, w, d] of [[x, z + 9, 18, 6.5], [x - 8, z - 1, 5.5, 13], [x + 8, z - 1, 5.5, 13]]) k.box(cx, 3.5, cz, w + 0.3, 0.12, d + 0.3, 0xe8e0d0);
  hall(x - 8, z - 1, 5.5, 13, 0);
  hall(x + 8, z - 1, 5.5, 13, 0);
  // front faces (doors, windows, couplets)
  const door = drawPic((g, w, h) => { g.fillStyle = '#7a2a1a'; g.fillRect(0, 0, w, h); g.fillStyle = '#e02a1e'; g.fillRect(8, 30, 36, 440); g.fillRect(84, 30, 36, 440); g.fillStyle = '#1a1a1a'; g.font = 'bold 30px "Songti TC",serif'; [...'天增歲月人增壽'].forEach((ch, i) => g.fillText(ch, 12, 70 + i * 58)); [...'春滿乾坤福滿門'].forEach((ch, i) => g.fillText(ch, 88, 70 + i * 58)); }, true);
  k.sign(x, 0.35, z + 5.72, 2.4, 2.8, door);
  const hui = drawSign('福', { bg: '#e02a1e', fg: '#1a1a1a', serif: true });
  k.sign(x, 3.0, z + 5.73, 1.2, 0.5, hui);
  for (const sd of [-1, 1]) {
    k.box(x + sd * 4.5, 1.3, z + 5.72, 1.4, 1.2, 0.06, 0x3a2a1a);
    for (let b = -0.6; b <= 0.61; b += 0.2) k.box(x + sd * 4.5 + b, 1.3, z + 5.76, 0.05, 1.2, 0.05, 0x5a3a20);
    k.box(x + sd * 5.22, 0.35, z - 1, 0.06, 2.2, 1.1, 0x5a2a1a); // wing doors facing the yard
    k.box(x + sd * 5.22, 1.4, z - 5, 0.06, 1.0, 1.4, 0x3a2a1a);
  }
  // yard: drying rice mat, bamboo, washing basin, laundry, bench, altar table
  // drying rice: a woven mat with low raked ridges of grain
  k.box(x - 1, 0.01, z - 1, 7, 0.02, 5, 0x9a8a5a);
  for (let i = 0; i < 11; i++) k.box(x - 1, 0.02, z - 3.2 + i * 0.44, 6.6, 0.05, 0.3, 0xd9b95a, 0, { jitter: 0.12 });
  k.box(x + 3.2, 0, z + 1.8, 0.05, 0.05, 1.6, C.wood, 0.4); k.box(x + 3.2, 0, z + 2.6, 0.7, 0.08, 0.06, C.wood, 0.4); // rake
  k.cyl(x + 4.5, 0, z + 3.5, 0.5, 0.45, 0.35, 0x3a6ab8, 12);
  k.box(x - 3.5, 0, z + 4.2, 2.2, 0.45, 0.45, C.wood, 0, { collide: true });
  seats.push([x - 3.5, z + 4.2, Math.PI]);
  k.beam(x - 5, 1.9, z - 6, x + 5, 1.9, z - 6, 0.02, C.steel);
  for (let i = 0; i < 7; i++) k.box(x - 4.2 + i * 1.3, 1.1, z - 6, 0.7, 0.8, 0.02, pick([0xe07090, C.blue, C.white, 0x8a2a8a, C.yellow]));
  // front wall with the gate toward the field road
  k.box(x - 7, 0, z - 8, 8, 1.4, 0.3, brick, 0, { collide: true, brick: true }); k.box(x - 7, 1.4, z - 8, 8.1, 0.12, 0.4, 0x9a948a);
  k.box(x + 7, 0, z - 8, 8, 1.4, 0.3, brick, 0, { collide: true, brick: true }); k.box(x + 7, 1.4, z - 8, 8.1, 0.12, 0.4, 0x9a948a);
  for (const sd of [-1, 1]) { k.box(x + sd * 3, 0, z - 8, 0.6, 2.2, 0.6, brick, 0, { brick: true, collide: true }); k.sphere(x + sd * 3, 2.35, z - 8, 0.28, 0xd0c8b8); }
  // garden with cabbages
  for (let gz = GARDEN.z0 + 1; gz < GARDEN.z1 - 0.5; gz += 1.1) for (let gx = GARDEN.x0 + 0.8; gx < GARDEN.x1 - 0.5; gx += 1.1) k.sphere(gx, 0.2, gz, 0.32, 0x8ac060, { sy: 0.75, seg: 8 });
  // bamboo grove behind the house
  for (let i = 0; i < 26; i++) bamboo(k, x - 12 + R() * 24, z + 14 + R() * 5);
  // well + chicken coop
  k.cyl(x + 13, 0, z + 2, 0.8, 0.8, 0.8, 0x8a8478, 12, { collide: true });
  k.box(x + 14, 0, z - 5, 2.5, 1.2, 2, 0x8a6a4a, 0, { collide: true }); k.tin(x + 14, 1.35, z - 5, 2.9, 2.4, C.tinRust, 0, 0.15);
  // a bare bulb under the eaves (lights the yard at night)
  k.box(x, 3.2, z + 5.7, 0.06, 0.3, 0.06, C.greyD);
  k.sphere(x, 3.1, z + 5.7, 0.09, 0xfff0c0, { glow: true });
  lamps.push({ x, y: 3.2, z: z + 5.2 }, { x: x - 6, y: 2.6, z: z - 1, small: true });
  doors.home = { x, z: z + 4.8 };
  doors.homeGate = { x, z: z - 8 };
  doors.closet = { x: x + 4.2, z: z - 1 };
  doors.garden = { x: (GARDEN.x0 + GARDEN.x1) / 2, z: (GARDEN.z0 + GARDEN.z1) / 2 };
  scene.add(k.build('home'));
}

// ---------------------------------------------------------------- station / school / police yard / recycling / betel / shrine / market
function buildOthers(scene) {
  const k = new Kit(9);
  // station: Japanese-era wooden station
  {
    const { x, z } = P.station;
    k.box(x, 0, z, 16, 0.4, 8, 0x9a948a);
    k.box(x, 0.4, z, 15, 4, 7, 0xe8e2d4, 0, { collide: true });
    for (let i = -7; i <= 7; i += 1.5) k.box(x + i, 0.4, z + 3.52, 0.12, 4, 0.06, 0x4a3a2a);
    k.roof(x, 4.4, z, 17, 9.4, 2.6, 0x3a4048);
    k.box(x, 0.4, z + 3.5, 2.6, 2.6, 0.08, 0x2a2a2a);
    const nm = drawSign('番薯寮站', { bg: '#f4f0e4', fg: '#1a1a1a', border: '#4a3a2a', serif: true });
    k.sign(x, 4.5, z + 4.75, 4.2, 1.05, nm, 0, { rx: -0.3 });
    k.cyl(x, 5.8, z + 4.4, 0.45, 0.45, 0.1, 0xf8f8f0, 16, { rx: Math.PI / 2 });
    // platform and tracks running north-south behind
    k.box(x - 14, 0, z, 4, 0.9, 120, 0x8a857a, 0, { collide: false });
    for (let tz = -170; tz < 170; tz += 0.8) k.box(x - 19, 0.02, z + tz, 2.6, 0.12, 0.25, 0x5a4a3a);
    for (const sd of [-0.72, 0.72]) k.box(x - 19 + sd, 0.14, z, 0.08, 0.14, 340, 0x70706a, 0, { metal: true });
    k.box(x - 12.5, 0.9, z, 0.3, 3, 20, 0x3a4a5a, 0, { collide: true });
    k.tin(x - 13.5, 3.8, z, 3, 22, 0x6a8a9a, Math.PI / 2, 0.05);
    doors.station = { x, z: z + 5 };
  }
  // police station yard: flagpole, patrol scooter parking
  {
    const { x, z } = P.police;
    k.cyl(x + 6, 0, z - 10, 0.06, 0.08, 9, C.steel, 8, { metal: true });
    k.box(x + 6.05, 7.4, z - 10, 0.02, 1.1, 1.6, 0xd02020);
    k.box(x + 6.06, 7.95, z - 10.4, 0.02, 0.55, 0.8, 0x1a3aa0);
  }
  // school: long 3-storey block with corridors, gate
  {
    const { x, z } = P.school;
    const bx = x, bz = z - 24;
    k.box(bx, 0, bz, 46, 10.5, 8, 0xe8dcc0, 0, { collide: true, tile: true });
    for (let f = 0; f < 3; f++) {
      k.box(bx, f * 3.5 + 3.2, bz + 5, 46, 0.3, 2.6, 0xd8ccb0);
      k.box(bx, f * 3.5 + 3.5, bz + 6.2, 46, 1.0, 0.1, 0xf0e8d0);
      for (let i = -21; i <= 21; i += 3.5) k.box(bx + i, f * 3.5, bz + 6.1, 0.35, 3.5, 0.35, 0xd8ccb0);
      for (let i = -20; i <= 20; i += 3.5) k.box(bx + i, f * 3.5 + 1.1, bz + 4.02, 2.2, 1.4, 0.05, C.glass, 0, { win: true });
    }
    k.box(bx, 10.5, bz, 46.4, 0.4, 8.4, 0xb8321e);
    const sn = drawSign('番薯寮國民小學', { bg: '#f8f4e8', fg: '#1a3a8a', serif: true });
    k.sign(bx, 10.95, bz + 4.25, 12, 1.5, sn);
    // gate on the school road
    for (const sd of [-1, 1]) k.box(x - 26.2, 0, z + sd * 5, 0.8, 3, 0.8, 0xb8321e, 0, { collide: true });
    k.box(x - 26.2, 3, z, 0.9, 0.8, 11, 0xb8321e);
    k.cyl(x + 8, 0, z + 14, 0.08, 0.1, 10, C.steel, 8);
  }
  // recycling yard: fence, bales of cardboard, bottles
  {
    const { x, z } = P.recycle;
    for (const [ax, az, bx, bz] of [[x - 20, z - 16, x + 20, z - 16], [x + 20, z - 16, x + 20, z + 16], [x - 20, z + 16, x + 20, z + 16], [x - 20, z - 16, x - 20, z - 4]]) k.wall(ax, az, bx, bz, 0, 2.2, 0.1, C.tinRust, { tile: false });
    for (let i = 0; i < 18; i++) { const px = x - 14 + R() * 30, pz = z - 10 + R() * 22; const h = 0.8 + R() * 1.2; k.box(px, 0, pz, 1.2 + R(), h, 1.1 + R() * 0.6, pick([0xa88a5a, 0x9a7a4a, 0xb89a6a]), R() * 3, { collide: true }); }
    for (let i = 0; i < 40; i++) k.cyl(x + 8 + R() * 8, 0, z - 12 + R() * 6, 0.05, 0.05, 0.28, pick([0x6ab04a, 0xd8e0e8, 0x8a5a2a]), 6);
    k.box(x - 10, 0, z + 10, 6, 3, 4, C.tin, 0, { collide: true, metal: true }); k.tin(x - 10, 3.1, z + 10, 7, 5, C.tinRust, 0, 0.12);
    const sn = drawSign('資源回收', { bg: '#1a8a3a', fg: '#fff', sub: '紙箱 · 寶特瓶 · 廢鐵', border: '#fff' });
    k.box(x - 20, 0, z - 10, 0.12, 3.8, 0.12, C.greyD); k.box(x - 20, 0, z - 6, 0.12, 3.8, 0.12, C.greyD);
    k.sign(x - 20.1, 2.4, z - 8, 4.2, 1.2, sn, -Math.PI / 2);
    doors.recycle = { x: x - 18, z: z - 8 };
  }
  // earth-god shrine
  {
    const { x, z } = P.shrine;
    k.box(x, 0, z, 2.6, 0.4, 2.2, 0x9a948a, 0, { collide: true });
    k.box(x, 0.4, z, 2, 1.8, 1.6, 0xc8321e);
    k.roof(x, 2.2, z, 2.8, 2.4, 0.9, 0xa8412a);
    k.box(x, 0.6, z - 0.81, 0.9, 1.1, 0.05, 0x201008);
    k.box(x, 0.9, z - 0.84, 0.3, 0.45, 0.05, 0xe8c060);
    k.cyl(x, 0, z - 2, 0.3, 0.35, 0.8, 0x8a6a2a, 10);
    doors.shrine = { x, z: z - 2.6 };
  }
  // betel-nut stand: glass booth with neon edges by the highway
  {
    const { x, z } = P.betel;
    k.box(x, 0, z, 3.4, 0.3, 2.6, C.concrete);
    k.box(x + 1.1, 0.3, z, 0.9, 2.4, 2.4, C.glass, 0, { collide: true, win: true });
    k.box(x - 0.6, 0.3, z, 2.2, 1.0, 2.4, 0xeae8e2, 0, { collide: true });
    k.box(x, 2.7, z, 3.6, 0.25, 2.8, 0xe8e0d0);
    for (const [ox, oz] of [[-1.8, -1.4], [-1.8, 1.4], [1.8, -1.4], [1.8, 1.4]]) k.box(x + ox, 0.3, z + oz, 0.06, 2.45, 0.06, 0xff40c0, 0, { glow: true });
    k.box(x, 2.95, z - 1.4, 3.6, 0.06, 0.06, 0x40ffe0, 0, { glow: true });
    const sn = drawSign('檳榔 · 香菸 · 飲料', { bg: ['#ff2a8a', '#ff9a2a'], fg: '#fff', stroke: '#6a0a3a' });
    k.box(x, 3.0, z, 3.6, 0.9, 0.1, C.greyD);
    k.sign(x - 1.86, 3.0, z, 3.4, 0.85, sn, -Math.PI / 2);
    const sn2 = drawSign('大發', { bg: '#1f8a3a', fg: '#ffe95a', border: '#ffe95a' }, true);
    k.box(x - 1.4, 0, z + 2, 0.16, 5, 0.16, C.greyD);
    k.sign(x - 1.49, 1.5, z + 2, 0.8, 3.2, sn2, -Math.PI / 2);
    doors.betel = { x: x - 2.4, z };
  }
  // market street: tarps over the stalls (the Tripo stalls are placed in dressProps)
  {
    const { x } = P.market;
    for (let mz = -14; mz > -112; mz -= 7) for (const sd of [-1, 1]) {
      const cx = x + sd * 5.6, col = pick([0x2a6ab8, 0xd8401e, 0x2a9a5a, 0xe8b02a, 0x8a3ab8, 0xe8e8e8]);
      k.tin(cx, 3.1, mz, 3.8, 6.6, col, 0, -sd * 0.18);
      for (const oz of [-3, 3]) k.box(cx + sd * 1.7, 0, mz + oz, 0.07, 3.1 + sd * 0.35, 0.07, C.greyD, 0, { metal: true });
      k.box(cx, 2.6, mz, 0.1, 0.1, 0.1, 0xfff4d0, 0, { glow: true });
      if (R() < 0.5) lamps.push({ x: cx, y: 2.6, z: mz, small: true });
    }
    // hanging clothes rack at the clothing stall
    const { x: cx, z: cz } = P.cloth;
    k.box(cx - 1.4, 0, cz, 0.06, 2.2, 3.4, C.steel, 0, { metal: true });
    for (let i = 0; i < 9; i++) k.box(cx - 1.4, 1.0, cz - 1.5 + i * 0.36, 0.5, 1.0, 0.05, pick([0xe060a0, 0xf0d020, 0x8a2ab8, 0x20a0e0, 0xe03a2a, 0x1a1a1a]), Math.PI / 2);
    doors.cloth = { x: cx + 0.6, z: cz };
  }
  // taxi stand sign
  {
    const { x, z } = P.taxiStand;
    k.box(x + 3, 0, z, 0.1, 3, 0.1, C.greyD);
    const sn = drawSign('計程車招呼站', { bg: '#f0c020', fg: '#1a1a1a' });
    k.sign(x + 3, 2.2, z + 0.06, 2.4, 0.6, sn);
    k.sign(x + 3, 2.2, z - 0.06, 2.4, 0.6, sn, Math.PI);
    doors.taxi = { x, z };
  }
  scene.add(k.build('others'));
}

function drawPicTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(55,90,70,1)'; g.lineWidth = 2.2;
  for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// ---------------------------------------------------------------- 活動中心 court: 廣場舞大賽
export const court = { fence: null, banner: null };
function buildCourt(scene) {
  const k = new Kit(808);
  const { x, z } = P.court;
  // chain-link fence cage around the basketball court (open on the west side)
  const fx0 = x - 15, fx1 = x + 15, fz0 = z - 9, fz1 = z + 8.2, H = 4.2;
  const posts = [];
  for (let px = fx0; px <= fx1 + 0.01; px += 3) posts.push([px, fz0], [px, fz1]);
  for (let pz = fz0 + 3; pz < fz1; pz += 3) posts.push([fx1, pz]);
  for (const [px, pz] of posts) k.cyl(px, 0, pz, 0.05, 0.05, H, 0x2f6a4a, 6, { metal: true });
  const fence = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az); const ry = -Math.atan2(bz - az, bx - ax); court.segs.push([ax, az, bx, bz, len, ry]); k.box((ax + bx) / 2, H - 0.05, (az + bz) / 2, len, 0.06, 0.06, 0x2f6a4a, ry, { metal: true }); k.box((ax + bx) / 2, 1.2, (az + bz) / 2, len, 0.05, 0.05, 0x2f6a4a, ry, { metal: true }); };
  court.segs = [];
  fence(fx0, fz0, fx1, fz0); fence(fx0, fz1, fx1, fz1); fence(fx1, fz0, fx1, fz1);
  fence(fx0, fz0, fx0, z - 3); fence(fx0, z + 2.5, fx0, fz1);
  // red contest banner on the north fence
  const ban = drawSign('番薯寮第一屆廣場舞大賽', { bg: '#c8201a', fg: '#ffe98a', border: '#ffe98a', sub: '主辦：番薯寮里辦公處 · 冠軍獎金 NT$5000' });
  k.sign(x, 2.2, fz0 + 0.06, 9, 1.8, ban, 0);
  k.sign(x, 2.2, fz0 - 0.06, 9, 1.8, ban, Math.PI);
  // benches
  for (const [bx2, bz2, ry] of [[x - 6, fz1 + 2.2, Math.PI], [x + 4, fz1 + 2.2, Math.PI], [x + 18.5, z - 4, -Math.PI / 2]]) { k.box(bx2, 0.42, bz2, 1.8, 0.07, 0.45, C.wood, ry); for (const s of [-0.75, 0.75]) k.box(bx2 + Math.cos(ry) * s, 0, bz2 - Math.sin(ry) * s, 0.08, 0.42, 0.4, C.greyD, ry); seats.push([bx2, bz2, ry]); }
  // trees along the south edge
  for (let i = 0; i < 5; i++) broadleaf(k, x - 18 + i * 9, z + 14.5);
  // 5-storey walk-up apartments behind (north), like the ones in every town
  for (let i = 0; i < 3; i++) shophouse(k, x - 14 + i * 14, z - 19, 0, 13, { floors: 6, open: false, depth: 12, name: ['永和社區', '番薯寮新村', '幸福大廈'][i], signBg: '#e8e4d8', signFg: '#3a3a3a' });
  court.fx0 = fx0; court.fx1 = fx1; court.fz0 = fz0; court.fz1 = fz1;
  // see-through chain-link panels
  const tex = drawPicTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.5 });
  for (const [ax, az, bx, bz, len, ry] of court.segs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H - 0.1), mat);
    tex.repeat.set(1, 1);
    const g2 = m.geometry.attributes.uv; for (let i = 0; i < g2.count; i++) g2.setXY(i, g2.getX(i) * len / 1.2, g2.getY(i) * (H - 0.1) / 1.2);
    m.position.set((ax + bx) / 2, H / 2, (az + bz) / 2); m.rotation.y = ry;
    scene.add(m);
    addBox((ax + bx) / 2, (az + bz) / 2, len / 2, 0.06, ry, H);
  }
  doors.court = { x: x - 17, z: z };
  scene.add(k.build('court'));
}

// ---------------------------------------------------------------- 舊鐵皮倉庫: the scam call centre (chapter 2)
export const hideout = { desks: [], door: null };
function buildHideout(scene) {
  const k = new Kit(1313);
  const { x, z } = P.hideout;
  const W = 26, D = 16, H = 6.2;
  // tin walls with a wide roll-up opening on the east side (facing the road)
  k.box(x, 0, z - D / 2, W, H, 0.2, C.tin, 0, { collide: true, metal: true });
  k.box(x, 0, z + D / 2, W, H, 0.2, C.tin, 0, { collide: true, metal: true });
  k.box(x - W / 2, 0, z, 0.2, H, D, C.tin, 0, { collide: true, metal: true });
  k.box(x + W / 2, 0, z - D / 2 + 2.75, 0.2, H, 5.5, C.tin, 0, { collide: true, metal: true });
  k.box(x + W / 2, 0, z + D / 2 - 2.75, 0.2, H, 5.5, C.tin, 0, { collide: true, metal: true });
  k.box(x + W / 2, 3.6, z, 0.2, H - 3.6, 5, C.tin, 0, { metal: true });
  k.tin(x, H + 0.4, z, W + 1, D + 1, C.tinRust, 0, 0.06);
  // rust streaks and a fake front
  const uv = drawSign('番薯寮資源回收二廠', { bg: '#1a8a3a', fg: '#fff', sub: '閒人勿進 · 內有惡犬', border: '#fff' });
  k.sign(x + W / 2 + 0.12, 3.9, z, 6, 1.5, uv, Math.PI / 2);
  // inside: rows of desks with phones and CRTs — the call centre
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const dx = x - 8 + c * 4.2, dz = z - 4 + r * 3.6;
    hideout.desks.push([dx, dz]);
  }
  // the boss's corner: a leather sofa, a safe, a big gold 招財貓
  k.box(x - 10.5, 0, z + 5.5, 3, 0.8, 1.2, 0x5a2a1a, 0, { collide: true });
  k.box(x - 11.8, 0, z - 5.8, 1.2, 1.4, 1.1, 0x3a3e42, 0, { collide: true, metal: true });
  k.sphere(x - 11.8, 1.7, z - 5.8, 0.35, 0xf0c030, { seg: 10 });
  const sc = drawSign('業績目標 · 本月 3000 萬', { bg: '#c8201a', fg: '#fff' });
  k.sign(x - W / 2 + 0.12, 2.5, z, 5, 1.2, sc, Math.PI / 2);
  for (let i = 0; i < 4; i++) k.box(x - 8 + i * 5.5, H - 0.4, z, 0.2, 0.05, 1.6, 0xf8fff0, 0, { glow: true });
  // barbed-wire fence around the yard
  for (let i = -20; i <= 20; i += 4) { k.cyl(x + i, 0, z - 14, 0.05, 0.05, 2.2, C.greyD, 6); k.cyl(x + i, 0, z + 14, 0.05, 0.05, 2.2, C.greyD, 6); }
  k.box(x, 2.0, z - 14, 40, 0.03, 0.03, C.greyD); k.box(x, 2.0, z + 14, 40, 0.03, 0.03, C.greyD);
  hideout.door = { x: x + W / 2 + 2, z };
  doors.hideout = hideout.door;
  scene.add(k.build('hideout'));
}

// ---------------------------------------------------------------- nature
export const tripoTrees = [];  // [kind, x, z, scale] — placed by props.js when the Tripo model loaded
function banyan(k, x, z, s = 1) {
  const y = heightAt(x, z);
  if (hasModel('banyan')) { tripoTrees.push(['banyan', x, z, s]); return; }
  k.cyl(x, y, z, 0.9 * s, 1.4 * s, 4.5 * s, 0x5a4a3a, 10, { collide: true });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.beam(x, y + 3.8 * s, z, x + Math.cos(a) * 4.5 * s, y + 5.5 * s, z + Math.sin(a) * 4.5 * s, 0.35 * s, 0x5a4a3a); }
  for (let i = 0; i < 16; i++) { const a = R() * Math.PI * 2, r = R() * 6 * s; k.sphere(x + Math.cos(a) * r, y + (5.5 + R() * 2.5) * s, z + Math.sin(a) * r, (2.2 + R() * 1.4) * s, R() < 0.5 ? C.leafD : 0x3f6a30, { seg: 7, sy: 0.7 }); }
  for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2, r = (2 + R() * 4) * s; k.beam(x + Math.cos(a) * r, y + 5.2 * s, z + Math.sin(a) * r, x + Math.cos(a) * r, y + 0.5 + R() * 2, z + Math.sin(a) * r, 0.04, 0x6a5a48); }
}
function bamboo(k, x, z) {
  const y = heightAt(x, z);
  if (hasModel('bamboo')) { tripoTrees.push(['bamboo', x, z, 0.85 + R() * 0.35]); return; }
  for (let c = 0; c < 4; c++) {
    const h = 6 + R() * 4, lx = (R() - 0.5) * 1.6, lz = (R() - 0.5) * 1.6;
    const bx = x + (R() - 0.5) * 0.6, bz = z + (R() - 0.5) * 0.6;
    k.beam(bx, y, bz, bx + lx * 0.5, y + h * 0.6, bz + lz * 0.5, 0.045, 0x7a9a4a);
    k.beam(bx + lx * 0.5, y + h * 0.6, bz + lz * 0.5, bx + lx, y + h, bz + lz, 0.035, 0x86a452);
    for (let i = 0; i < 3; i++) {
      const t = 0.72 + i * 0.12, px = bx + lx * t * 1.1 + (R() - 0.5) * 0.7, pz = bz + lz * t * 1.1 + (R() - 0.5) * 0.7;
      k.sphere(px, y + h * t, pz, 0.8 + R() * 0.4, R() < 0.5 ? 0x5f9038 : 0x4a7a2e, { seg: 7, sy: 1.3 });
    }
  }
}
function banana(k, x, z) {
  const y = heightAt(x, z), h = 2.4 + R() * 1.2;
  if (hasModel('banana')) { tripoTrees.push(['banana', x, z, 0.85 + R() * 0.35]); return; }
  k.cyl(x, y, z, 0.12, 0.18, h, 0x7a8a4a, 7);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + R();
    const g = new THREE.PlaneGeometry(0.55, 2.0, 1, 4);
    g.translate(0, 1.0, 0);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) { const t = p.getY(v) / 2; p.setZ(v, -t * t * 1.1); }
    g.rotateX(-0.9);
    g.rotateY(a);
    k._push(g, R() < 0.3 ? 0x8aa04a : 0x5a9a3a, x, y + h, z, 0, 0, 0, 0.1, k.parts, false);
  }
}
function palm(k, x, z) { // betel palm: tall thin trunk, small crown
  const y = heightAt(x, z), h = 7 + R() * 4;
  if (hasModel('palm')) { tripoTrees.push(['palm', x, z, 0.85 + R() * 0.35]); return; }
  k.cyl(x, y, z, 0.1, 0.13, h, 0x8a8470, 6);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.beam(x, y + h, z, x + Math.cos(a) * 1.6, y + h - 0.6, z + Math.sin(a) * 1.6, 0.05, 0x4a7a30); k.sphere(x + Math.cos(a) * 1.2, y + h - 0.35, z + Math.sin(a) * 1.2, 0.35, 0x4f8a34, { seg: 5, sy: 0.35 }); }
}
function broadleaf(k, x, z) {
  const y = heightAt(x, z), h = 3 + R() * 2;
  k.cyl(x, y, z, 0.18, 0.28, h, 0x5a4a3a, 7, { collide: true });
  for (let i = 0; i < 5; i++) k.sphere(x + (R() - 0.5) * 2.4, y + h + R() * 1.6, z + (R() - 0.5) * 2.4, 1.3 + R() * 0.8, R() < 0.5 ? C.leaf : C.leafD, { seg: 7, sy: 0.8 });
}
function farmhouse(k, x, z, ry) {
  economyPlaces.push({id:'farmhouse:'+economyPlaces.length,name:'農舍',x,z,kind:'housing'});
  const y = heightAt(x, z);
  const c = Math.cos(ry), s = Math.sin(ry);
  const w = 8 + R() * 4, d = 6 + R() * 2, h = 3.2;
  k.box(x, y, z, w, h, d, pick([C.brick, C.white, C.cream, 0xc8c0b0]), ry, { collide: true });
  if (R() < 0.5) k.roof(x, y + h, z, w + 0.8, d + 1, 1.6, pick([0x8a3a28, 0x6a6660]), ry);
  else { k.tin(x, y + h + 0.4, z, w + 0.8, d + 1, pick([C.tin, C.tinRust, 0x3a6ab8]), ry, 0.08); }
  k.box(x + s * (d / 2 + 0.01), y, z + c * (d / 2 + 0.01), 1.2, 2.2, 0.06, 0x3a2a1a, ry);
  for (const sd of [-1, 1]) k.box(x + s * (d / 2 + 0.01) + c * sd * w * 0.3, y + 1.1, z + c * (d / 2 + 0.01) - s * sd * w * 0.3, 1.2, 1.0, 0.06, C.glass, ry, { win: true });
  if (R() < 0.6) { k.cyl(x - c * w * 0.3, y + h + (R() < 0.5 ? 0.2 : 1), z + s * w * 0.3, 0.55, 0.55, 1.2, R() < 0.5 ? C.steel : C.blue, 12, { metal: true }); }
  if (R() < 0.5) { // tin carport / shed
    const px = x + c * (w / 2 + 2.2), pz = z - s * (w / 2 + 2.2);
    for (const [ox, oz] of [[-1.5, -2], [1.5, -2], [-1.5, 2], [1.5, 2]]) k.box(px + c * ox + s * oz, y, pz - s * ox + c * oz, 0.08, 2.5, 0.08, C.greyD, ry, { metal: true });
    k.tin(px, y + 2.6, pz, 3.6, 4.6, pick([C.tin, C.tinRust]), ry + Math.PI / 2, 0.1);
  }
}

function buildNature(scene) {
  const k = new Kit(55);
  // village entrance banyan with the chess table
  banyan(k, P.banyan.x, P.banyan.z, 1.1);
  k.box(P.banyan.x + 3, 0, P.banyan.z + 3, 1, 0.75, 1, 0x7a7a74, 0, { collide: true });
  seats.push([P.banyan.x + 3, P.banyan.z + 4.2, Math.PI], [P.banyan.x + 3, P.banyan.z + 1.8, 0], [P.banyan.x + 1.8, P.banyan.z + 3, Math.PI / 2]);
  // roadside trees along the field roads and lanes
  for (const r of ROADS) {
    if (r.kind === 'main') continue;
    for (let s = 0; s < r.pts.length - 1; s++) {
      const [ax, az] = r.pts[s], [bx, bz] = r.pts[s + 1];
      const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let t = 8; t < L; t += 9 + R() * 14) {
        const side = R() < 0.5 ? -1 : 1, off = r.w / 2 + 2.2 + R() * 3;
        const x = ax + dx * t - dz * off * side, z = az + dz * t + dx * off * side;
        if (inTown(x, z)) continue;
        if (roadDist(x, z) < 1.5 || inLot(x, z)) continue;
        const r2 = R();
        if (r2 < 0.3) banana(k, x, z); else if (r2 < 0.55) palm(k, x, z); else if (r2 < 0.8) broadleaf(k, x, z); else bamboo(k, x, z);
      }
    }
  }
  // betel palm rows between paddies, banana patches, bamboo clumps
  for (let i = 0; i < 260; i++) {
    const x = (R() - 0.5) * 640, z = (R() - 0.5) * 640;
    if (inTown(x, z)) continue;
    if (roadDist(x, z) < 3 || inLot(x, z) || inPaddy(x, z)) continue;
    if (Math.hypot(x - P.home.x, z - P.home.z) < 22) continue;
    const r2 = R();
    if (r2 < 0.35) palm(k, x, z); else if (r2 < 0.6) banana(k, x, z); else if (r2 < 0.85) broadleaf(k, x, z); else for (let j = 0; j < 6; j++) bamboo(k, x + R() * 3, z + R() * 3);
  }
  // scattered farmhouses and field huts
  const farms = [[-40, 40, 0], [10, 40, 0], [70, 44, Math.PI], [160, 44, 0], [-200, 40, Math.PI / 2], [230, -20, -Math.PI / 2], [240, 120, -Math.PI / 2], [-80, 140, 0], [40, 240, Math.PI], [150, 240, Math.PI], [-230, 110, Math.PI / 2], [-100, -150, 0], [0, -140, 0], [-160, -110, Math.PI / 2], [100, -150, Math.PI], [-20, -40, Math.PI], [0, -50, 0], [-110, -40, 0], [-180, -60, Math.PI / 2], [160, -110, Math.PI / 2]];
  for (const [x, z, ry] of farms) if (!inPaddy(x, z) && !inTown(x, z) && roadDist(x, z) > 5) farmhouse(k, x, z, ry);
  // paddy water pumps / scarecrows / irrigation channels
  for (let i = 0; i < 40; i++) {
    const p = PADDIES[Math.floor(R() * PADDIES.length)];
    const x = p.x0 + R() * (p.x1 - p.x0), z = p.z0 + R() * (p.z1 - p.z0);
    if (R() < 0.6) { // scarecrow
      k.beam(x, -0.4, z, x, 1.6, z, 0.04, C.wood); k.beam(x - 0.8, 1.1, z, x + 0.8, 1.1, z, 0.03, C.wood);
      k.box(x, 0.6, z, 0.6, 0.7, 0.3, pick([0xc03a2a, 0x3a6ab8, 0xe0c02a])); k.cone(x, 1.55, z, 0.45, 0.35, 0xd8c070, 10);
    } else { // tiny water pump shed
      k.box(x, -0.3, z, 1.4, 1.5, 1.2, C.tin, R() * 3, { metal: true }); k.tin(x, 1.3, z, 1.8, 1.6, C.tinRust, R() * 3, 0.1);
    }
  }
  scene.add(k.build('nature'));
}
// the built-up town: no stray farmhouses or trees in here
function inTown(x, z) {
  return (x > -232 && x < 196 && z > -42 && z < 57) || (x > -86 && x < -34 && z > -122 && z < -10) || (x > 24 && x < 76 && z > -66 && z < -10);
}
function inPaddy(x, z) { for (const p of PADDIES) if (x > p.x0 - 1 && x < p.x1 + 1 && z > p.z0 - 1 && z < p.z1 + 1) return true; return false; }
function inLot(x, z) { for (const l of LOTS) if (Math.abs(x - l.x) < l.hw + 2 && Math.abs(z - l.z) < l.hd + 2) return true; return Math.hypot(x - P.temple.x, z - P.temple.z + 8) < 20; }

export function buildTown(scene) {
  const units = [];
  for (const [x0, x1, side] of ROWS) units.push(...buildRow(scene, x0, x1, side));
  rowUnits.push(...units);
  const KTV = { near: [P.ktv.x, P.ktv.z], o: { name: '歡樂卡拉OK', signBg: ['#3a1a80', '#1a0a40'], signFg: '#ff6adf', sub: '包廂 · 那卡西 · 啤酒無限暢飲', open: true, floors: 3, color: 0x3a2a5a, special: 'ktv' } };
  const MART = { near: [30, 32], o: { name: '好鄰居 24H', signBg: '#ffffff', signFg: '#1a9a4a', sub: '繳費 · 咖啡 · 關東煮 · 刮刮樂', open: true, floors: 2, color: C.white, special: 'mart' } };
  for (const [ax, az, bx, bz, side, off, depth] of SIDE_ROWS) sideUnits.push(...buildRowSeg(scene, ax, az, bx, bz, side, off, [MART, KTV], depth));
  backfill(scene);
  buildPoles(scene);
  buildTemple(scene);
  buildHome(scene);
  buildOthers(scene);
  buildCourt(scene);
  buildHideout(scene);
  buildNature(scene);
  for(const [id,name,kind] of [['home','阿嬤三合院','housing'],['station','車站','transport'],['school','國小','public'],['temple','媽祖廟','public'],['shrine','土地公廟','public'],['court','活動中心','public'],['recycle','回收場','recycling'],['betel','檳榔攤','retail'],['cloth','衣服攤','retail'],['hideout','舊倉庫','storage']]) economyPlaces.push({id,name,kind,...P[id]});
  for(const [i,a] of PADDIES.entries())economyPlaces.push({id:'field:'+i,name:'農田 '+(i+1),kind:'farm',x:(a.x0+a.x1)/2,z:(a.z0+a.z1)/2});
  economyPlaces.push({id:'garden',name:'高麗菜園',kind:'farm',x:(GARDEN.x0+GARDEN.x1)/2,z:(GARDEN.z0+GARDEN.z1)/2});
  // sidewalk walk points on both kerbs and around the square / market
  for (let x = -220; x <= 220; x += 12) { spawnSpots.push([x, -8.5]); spawnSpots.push([x, 8.5]); }
  for (let z = -16; z > -110; z -= 10) spawnSpots.push([P.market.x, z]);
  for (let x = -124; x <= 108; x += 10) { spawnSpots.push([x, 30.5]); spawnSpots.push([x, 45.5]); }
  for (let i = 0; i < 16; i++) spawnSpots.push([P.square.x - 24 + R() * 48, P.square.z - 18 + R() * 30]);
  // parking in the arcades and at the kerbs
  for (const u of units) if (R() < 0.7) {
    const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) parkSpots.push([u.x - u.w / 2 + 0.9 + i * 1.1, u.side * 7.9, u.side < 0 ? Math.PI : 0, 'scooter']);
  }
  // cardboard pickups for recycling: in arcades and alleys
  for (let i = 0; i < 26; i++) { const u = units[Math.floor(R() * units.length)]; cardboard.push({ x: u.x + (R() - 0.5) * u.w * 0.6, z: u.side * 8.8, taken: false }); }
  for (let i = 0; i < 8; i++) cardboard.push({ x: P.market.x + (R() < 0.5 ? -3 : 3), z: -18 - R() * 90, taken: false });
  return units;
}
