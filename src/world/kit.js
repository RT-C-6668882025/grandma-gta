// Building kit: primitives with baked vertex colours, merged per district into a
// few meshes. Three materials: plain (MAT), mosaic tile facades (TILE — the
// little square tiles of every Taiwanese 透天厝, drawn in world space) and
// signs (SIGN — one canvas atlas of shop names, glowing at night).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addBox, addCircle } from '../collide.js';
import { rng } from '../util.js';
import { wetify } from '../weather.js';

export const MAT = wetify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }), 0.8);
export const METAL = wetify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide }), 0.5);
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
export const NIGHT = { value: 0 }; // 0 day .. 1 night; drives signs and window glow

// mosaic tiles: grout lines every 11 cm in world space on the vertical faces
export const TILE = wetify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }), 0.6);
TILE.userData.key = 'tile';
{
  const prev = TILE.onBeforeCompile;
  TILE.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 an = abs(vWN);
          vec2 uvT = an.x > an.z ? vWP.zy : vWP.xy;
          if (an.y > 0.7) uvT = vWP.xz;
          vec2 f = abs(fract(uvT / 0.11) - 0.5);
          float grout = smoothstep(0.43, 0.49, max(f.x, f.y)) * (1.0 - smoothstep(0.25, 0.6, length(fwidth(uvT / 0.11))));
          vec2 id = floor(uvT / 0.11);
          float tj = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= (0.93 + tj * 0.12);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, grout);
          // rain streaks under window sills: darker toward the bottom of each storey
          float storey = fract(vWP.y / 3.3);
          diffuseColor.rgb *= 1.0 - 0.12 * smoothstep(0.35, 0.0, storey) * step(0.3, fract(sin(floor(uvT.x * 1.7) * 91.7) * 473.1));
        }`);
  };
  TILE.customProgramCacheKey = () => 'tile:wet';
}

// window glass: lights up at night in a random ~half of the windows (hashed per window cell)
export const WIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3 });
WIN.onBeforeCompile = (sh) => {
  sh.uniforms.uNight = NIGHT;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP2;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP2 = (modelMatrix * vec4(transformed,1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying vec3 vWP2;')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 id = floor(vWP2 / vec3(2.3, 3.2, 2.3));
        float h = fract(sin(dot(id, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec3 warm = h < 0.62 ? vec3(0.75, 0.92, 1.0) : vec3(1.0, 0.76, 0.42);
        totalEmissiveRadiance += warm * step(0.45, h) * uNight * 1.3; }`);
};

// red brick (三合院 walls): running bond in world space
export const BRICK = wetify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }), 0.8);
{
  const prev = BRICK.onBeforeCompile;
  BRICK.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 an = abs(vWN);
          vec2 uvB = an.x > an.z ? vWP.zy : vWP.xy;
          if (an.y > 0.7) uvB = vWP.xz;
          uvB /= vec2(0.24, 0.07);
          uvB.x += step(1.0, mod(floor(uvB.y), 2.0)) * 0.5;
          vec2 f = fract(uvB);
          float mortar = max(smoothstep(0.9, 0.96, f.x) + smoothstep(0.1, 0.04, f.x), smoothstep(0.84, 0.92, f.y) + smoothstep(0.1, 0.03, f.y));
          vec2 id = floor(uvB);
          float tj = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= 0.82 + tj * 0.3;
          float far = smoothstep(0.2, 0.55, length(fwidth(uvB)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.58, 0.52), clamp(mortar, 0.0, 1.0) * 0.85 * (1.0 - far));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.92 + vec3(0.03), far);
        }`);
  };
  BRICK.customProgramCacheKey = () => 'brick:wet';
}

export const C = {
  white: 0xe9e6de, cream: 0xe2d6bc, beige: 0xcdb896, pink: 0xd9a8a0, salmon: 0xd48f78, brown: 0x8a5a44, tan: 0xb89a74,
  grey: 0x9a9894, greyD: 0x5d5c5a, concrete: 0xa9a59c, concreteD: 0x7f7b74, brick: 0xa8503a, brickD: 0x7e3a2a,
  red: 0xb8281e, redD: 0x7c1a14, gold: 0xd9a63a, green: 0x3f7a4a, greenD: 0x2d5234, blue: 0x3a6ea8, blueD: 0x2a4a72,
  teal: 0x3f8a86, tin: 0x8aa0a8, tinRust: 0x9a6a4a, dark: 0x1e1f22, glass: 0x2c3a44, wood: 0x6e4a2e, woodD: 0x4a3120,
  steel: 0xc8ccd0, black: 0x151515, yellow: 0xe8c23a, orange: 0xe07a2a, leaf: 0x4f7a3a, leafD: 0x355a2a,
};
export const FACADE = [C.white, C.cream, C.beige, C.pink, C.salmon, C.tan, 0xc4c9b8, 0xb9c4c9, 0xd8c8a8, 0xcfa98f, C.brown];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const col = new THREE.Color();

// ---------------------------------------------------------------- sign atlas
// Signs are drawn on demand into one 4096² atlas (cells of 512×128 for
// horizontal boards, 128×512 vertical). Returns the uv rect.
const ATLAS = 4096;
const atlas = document.createElement('canvas');
atlas.width = atlas.height = ATLAS;
const actx = atlas.getContext('2d');
actx.fillStyle = '#222'; actx.fillRect(0, 0, ATLAS, ATLAS);
let cellH = 0, cellV = 0;
export const SIGN_TEX = new THREE.CanvasTexture(atlas);
SIGN_TEX.colorSpace = THREE.SRGBColorSpace;
SIGN_TEX.anisotropy = 8;
export const SIGN = new THREE.MeshStandardMaterial({ map: SIGN_TEX, emissiveMap: SIGN_TEX, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.5 });
SIGN.onBeforeCompile = (sh) => {
  sh.uniforms.uNight = NIGHT;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uNight;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.06 + uNight * 1.1;');
};
const FONT = '"PingFang TC","Heiti TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
const SERIF = '"Songti TC","STSong","Noto Serif TC",serif';

// style: {bg, fg, border, sub, font}
const signCache = new Map();
export function drawSign(text, style = {}, vertical = false) {
  // identical signs share one atlas cell (the atlas holds 128 horizontal + 128 vertical cells)
  const key = JSON.stringify([text, style, vertical]);
  if (signCache.has(key)) return signCache.get(key);
  const uv = drawSignCell(text, style, vertical);
  signCache.set(key, uv);
  return uv;
}
function drawSignCell(text, style, vertical) {
  const w = vertical ? 128 : 512, h = vertical ? 512 : 128;
  if ((vertical ? cellV : cellH) >= 128) console.warn('sign atlas full, reusing cells');
  let x, y;
  if (vertical) { x = (cellV % 32) * 128; y = 2048 + Math.floor((cellV % 128) / 32) * 512; cellV++; }
  else { x = (cellH % 8) * 512; y = Math.floor((cellH % 128) / 8) * 128; cellH++; }
  const g = actx;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  const bg = style.bg || '#c8231c';
  if (Array.isArray(bg)) { const gr = g.createLinearGradient(x, y, x, y + h); bg.forEach((c, i) => gr.addColorStop(i / (bg.length - 1), c)); g.fillStyle = gr; }
  else g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  if (style.border) { g.strokeStyle = style.border; g.lineWidth = 10; g.strokeRect(x + 7, y + 7, w - 14, h - 14); }
  g.fillStyle = style.fg || '#fff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const font = style.serif ? SERIF : FONT;
  if (vertical) {
    const chars = [...text];
    const n = chars.length, step = Math.min(110, (h - 30) / n);
    g.font = `bold ${Math.floor(step * 0.86)}px ${font}`;
    chars.forEach((ch, i) => g.fillText(ch, x + w / 2, y + 18 + step * (i + 0.5)));
  } else {
    const hasSub = !!style.sub;
    let fs = hasSub ? 64 : 84;
    g.font = `bold ${fs}px ${font}`;
    while (g.measureText(text).width > w - 40 && fs > 30) { fs -= 4; g.font = `bold ${fs}px ${font}`; }
    if (style.stroke) { g.strokeStyle = style.stroke; g.lineWidth = 8; g.strokeText(text, x + w / 2, y + (hasSub ? 50 : h / 2 + 4)); }
    g.fillText(text, x + w / 2, y + (hasSub ? 50 : h / 2 + 4));
    if (hasSub) { g.font = `bold 28px ${FONT}`; g.fillStyle = style.subFg || style.fg || '#fff'; g.fillText(style.sub, x + w / 2, y + 102); }
  }
  g.restore();
  SIGN_TEX.needsUpdate = true;
  return [x / ATLAS, 1 - (y + h) / ATLAS, (x + w) / ATLAS, 1 - y / ATLAS];
}
// small pictures (roll-up door stripes, posters) share the atlas too
export function drawPic(fn, vertical = false) {
  const w = vertical ? 128 : 512, h = vertical ? 512 : 128;
  let x, y;
  if (vertical) { x = (cellV % 32) * 128; y = 2048 + Math.floor(cellV / 32) * 512; cellV++; }
  else { x = (cellH % 8) * 512; y = Math.floor(cellH / 8) * 128; cellH++; }
  actx.save(); actx.beginPath(); actx.rect(x, y, w, h); actx.clip(); actx.translate(x, y);
  fn(actx, w, h);
  actx.restore();
  SIGN_TEX.needsUpdate = true;
  return [x / ATLAS, 1 - (y + h) / ATLAS, (x + w) / ATLAS, 1 - y / ATLAS];
}

export class Kit {
  constructor(seed = 1) {
    this.parts = []; this.tiles = []; this.glow = []; this.signs = []; this.metal = []; this.wins = []; this.bricks = [];
    this.R = rng(seed);
  }
  _push(geo, color, x, y, z, rx, ry, rz, jitter = 0.06, list = this.parts, ao = true) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    geo.applyMatrix4(_m);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const n = geo.attributes.position.count;
    const cols = new Float32Array(n * 3);
    col.set(color);
    const j = 1 + (this.R() - 0.5) * jitter * 2;
    geo.computeBoundingBox();
    const y0 = geo.boundingBox.min.y, y1 = geo.boundingBox.max.y;
    for (let i = 0; i < n; i++) {
      const py = geo.attributes.position.getY(i);
      const a = ao ? 0.8 + 0.2 * Math.min(1, (py - y0) / Math.max(0.5, Math.min(2.5, y1 - y0))) : 1;
      cols[i * 3] = col.r * j * a; cols[i * 3 + 1] = col.g * j * a; cols[i * 3 + 2] = col.b * j * a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    list.push(geo);
    return geo;
  }
  _list(o) { return o.brick ? this.bricks : o.win ? this.wins : o.glow ? this.glow : o.tile ? this.tiles : o.metal ? this.metal : this.parts; }
  box(x, y, z, w, h, d, color, ry = 0, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    this._push(g, color, x, y, z, o.rx || 0, ry, o.rz || 0, o.jitter ?? 0.06, this._list(o), !o.glow);
    if (o.collide) addBox(x, z, w / 2, d / 2, ry, y + h, o.tag);
    return this;
  }
  cyl(x, y, z, rt, rb, h, color, seg = 10, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open);
    g.translate(0, h / 2, 0);
    this._push(g, color, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.jitter ?? 0.05, this._list(o), !o.glow);
    if (o.collide) addCircle(x, z, Math.max(rt, rb), y + h, o.tag);
    return this;
  }
  cone(x, y, z, r, h, color, seg = 8, o = {}) { return this.cyl(x, y, z, 0.001, r, h, color, seg, o); }
  sphere(x, y, z, r, color, o = {}) {
    const g = new THREE.SphereGeometry(r, o.seg || 10, o.seg ? Math.ceil(o.seg * 0.7) : 7);
    if (o.sy) g.scale(1, o.sy, 1);
    this._push(g, color, x, y, z, 0, 0, 0, 0.08, this._list(o), !o.glow);
    return this;
  }
  // a thin beam between two 3D points
  beam(ax, ay, az, bx, by, bz, r, color, o = {}) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const g = new THREE.CylinderGeometry(r, r, len, o.seg || 5, 1, true);
    g.translate(0, len / 2, 0);
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.applyQuaternion(q);
    this._push(g, color, ax, ay, az, 0, 0, 0, 0.02, this._list(o), false);
    return this;
  }
  // gable roof, ridge along local x
  roof(x, y, z, w, d, h, color, ry = 0, o = {}) {
    const hw = w / 2, hd = d / 2;
    const v = [-hw, 0, -hd, hw, 0, -hd, hw, h, 0, -hw, h, 0, -hw, 0, hd, -hw, h, 0, hw, h, 0, hw, 0, hd, -hw, 0, -hd, -hw, h, 0, -hw, 0, hd, hw, 0, -hd, hw, 0, hd, hw, h, 0];
    const idx = [0, 3, 2, 0, 2, 1, 4, 7, 6, 4, 6, 5, 8, 10, 9, 11, 13, 12];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    this._push(ng, color, x, y, z, 0, ry, 0, 0.05, this._list(o), false);
    return this;
  }
  // corrugated sheet (tin roof) — ridged plane tilted by rx
  tin(x, y, z, w, d, color, ry = 0, tilt = 0.12) {
    const segs = Math.max(8, Math.round(w / 0.045));
    const g = new THREE.PlaneGeometry(w, d, segs, 1);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, Math.sin((p.getX(i) / 0.09) * Math.PI) * 0.02);
    g.rotateX(tilt);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    this._push(ng, color, x, y, z, 0, ry, 0, 0.1, this.metal, false);
    return this;
  }
  // textured quad from the sign atlas; faces local +z after ry
  sign(x, y, z, w, h, uv, ry = 0, o = {}) {
    const g = new THREE.PlaneGeometry(w, h);
    const u = g.attributes.uv;
    const [u0, v0, u1, v1] = uv;
    u.setXY(0, u0, v1); u.setXY(1, u1, v1); u.setXY(2, u0, v0); u.setXY(3, u1, v0);
    g.translate(0, h / 2, 0);
    _e.set(o.rx || 0, ry, 0); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    this.signs.push(g);
    if (o.back) { const b = g.clone(); const uvb = b.attributes.uv; for (let i = 0; i < 4; i++) uvb.setX(i, u0 + u1 - uvb.getX(i)); b.index.array.reverse(); this.signs.push(b); }
    return this;
  }
  wall(ax, az, bx, bz, y, h, t, color, o = {}) {
    const len = Math.hypot(bx - ax, bz - az);
    const ry = -Math.atan2(bz - az, bx - ax);
    this.box((ax + bx) / 2, y, (az + bz) / 2, len, h, t, color, ry, { collide: o.collide !== false, tag: o.tag, tile: o.tile });
    if (o.cap) this.box((ax + bx) / 2, y + h, (az + bz) / 2, len + 0.1, 0.12, t + 0.1, o.cap, ry);
    return this;
  }
  build(name = 'place') {
    const g = new THREE.Group();
    g.name = name;
    const mk = (list, mat, shadow = true) => {
      if (!list.length) return;
      const geo = mergeGeometries(list.map((p) => (p.index ? p.toNonIndexed() : p)), false);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow; m.receiveShadow = true;
      g.add(m);
    };
    mk(this.parts, MAT); mk(this.tiles, TILE); mk(this.metal, METAL); mk(this.wins, WIN, false); mk(this.bricks, BRICK); mk(this.glow, GLOW, false);
    if (this.signs.length) {
      const geo = mergeGeometries(this.signs.map((p) => (p.index ? p.toNonIndexed() : p)), false);
      const m = new THREE.Mesh(geo, SIGN); m.receiveShadow = true; g.add(m);
    }
    this.parts = []; this.tiles = []; this.glow = []; this.signs = []; this.metal = []; this.wins = []; this.bricks = [];
    return g;
  }
}
