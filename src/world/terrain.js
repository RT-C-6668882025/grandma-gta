// Terrain: a flat plain (roads and the town sit at y = 0), paddies sunk a little
// below with a water sheet on top, and hills rising toward the map edge. The
// ground is one painted canvas: asphalt with markings, concrete, gravel, soil,
// grass, paddy water with seedling rows (the grass shader grows the seedlings).

import * as THREE from 'three';
import { fbm, noise, smooth, lerp, clamp, segDist, rng } from '../util.js';
import { WORLD, ROADS, LOTS, PADDIES, PADDY_Y, WATER_Y, GARDEN, P, ROWS, SIDE_ROWS } from './layout.js';
import { wetify, WU } from '../weather.js';

const N = 360;
const CELL = WORLD / N;
const HALF = WORLD / 2;
let H = null;

function inPaddy(x, z, pad = 0) {
  for (const p of PADDIES) if (x > p.x0 - pad && x < p.x1 + pad && z > p.z0 - pad && z < p.z1 + pad) return p;
  return null;
}
export function roadDist(x, z) {
  let best = 1e9;
  for (const r of ROADS) for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    best = Math.min(best, segDist(x, z, ax, az, bx, bz) - r.w / 2);
  }
  return best;
}

function rawHeight(x, z) {
  const e = Math.max(Math.abs(x), Math.abs(z));
  let h = fbm(x * 0.02, z * 0.02, 2) * 0.12;
  // hills and a mountain ridge beyond the fields (north-east is highest)
  const hill = smooth(300, 360, e) * (26 + 22 * fbm(x * 0.008 + 3, z * 0.008, 3)) + smooth(330, 360, -z) * 30;
  h += hill;
  return h;
}
function shapedHeight(x, z) {
  let h = rawHeight(x, z);
  const rd = roadDist(x, z);
  h = lerp(0, h, smooth(0, 6, rd));
  const p = inPaddy(x, z, 0.4);
  if (p) {
    // soft 40 cm step down into the paddy
    const d = Math.min(x - p.x0, p.x1 - x, z - p.z0, p.z1 - z);
    h = lerp(h, p.dry ? -0.05 : PADDY_Y, smooth(-0.3, 0.6, d));
  }
  return h;
}

export function heightAt(x, z) {
  const gx = clamp((x + HALF) / CELL, 0, N - 1e-4), gz = clamp((z + HALF) / CELL, 0, N - 1e-4);
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz, R = N + 1;
  const a = H[iz * R + ix], d = H[iz * R + ix + 1], b = H[(iz + 1) * R + ix], c = H[(iz + 1) * R + ix + 1];
  if (fx + fz <= 1) return a + (d - a) * fx + (b - a) * fz;
  return c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
}
// ground under a wheel/foot, water counts as the floor where it's deep enough
export function floorAt(x, z) {
  const h = heightAt(x, z);
  return h;
}
export const isPaddy = (x, z) => { const p = inPaddy(x, z); return p && !p.dry ? p : null; };
export function heightTexture() {
  const t = new THREE.DataTexture(H, N + 1, N + 1, THREE.RedFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
export const TERRAIN = { N, CELL, HALF };

// ---------------------------------------------------------------- ground paint
const TEX = 4096;
const toPx = (v) => ((v + HALF) / WORLD) * TEX;
const K = TEX / WORLD;

function paintGround() {
  const LO = 512;
  const lo = document.createElement('canvas');
  lo.width = lo.height = LO;
  const lctx = lo.getContext('2d');
  const img = lctx.createImageData(LO, LO);
  const grass = [104, 134, 60], dry = [150, 142, 84], soil = [122, 98, 70], hillC = [58, 98, 52];
  for (let j = 0; j < LO; j++) for (let i = 0; i < LO; i++) {
    const x = ((i + 0.5) / LO) * WORLD - HALF, z = ((j + 0.5) / LO) * WORLD - HALF;
    const n = fbm(x * 0.015, z * 0.015, 3), n2 = noise(x * 0.09, z * 0.09);
    const t = clamp(0.35 + n * 0.8, 0, 1);
    const c = [0, 0, 0];
    for (let k = 0; k < 3; k++) c[k] = lerp(grass[k], dry[k], t * 0.6);
    const e = Math.max(Math.abs(x), Math.abs(z));
    const hk = smooth(290, 330, e);
    for (let k = 0; k < 3; k++) c[k] = lerp(c[k], hillC[k], hk);
    // trampled soil near buildings / town core
    const town = smooth(30, 6, Math.abs(z)) * smooth(235, 200, Math.abs(x));
    for (let k = 0; k < 3; k++) c[k] = lerp(c[k], soil[k], town * 0.6);
    const f = 1 + n2 * 0.08;
    const p = (j * LO + i) * 4;
    img.data[p] = c[0] * f; img.data[p + 1] = c[1] * f; img.data[p + 2] = c[2] * f; img.data[p + 3] = 255;
  }
  lctx.putImageData(img, 0, 0);
  const cv = document.createElement('canvas');
  cv.width = cv.height = TEX;
  const g = cv.getContext('2d');
  g.drawImage(lo, 0, 0, TEX, TEX);
  const R = rng(11);

  // paddies: muddy water, ridges, seedling rows (bright green = the grass shader grows seedlings there)
  for (const p of PADDIES) {
    const x0 = toPx(p.x0), z0 = toPx(p.z0), w = (p.x1 - p.x0) * K, d = (p.z1 - p.z0) * K;
    g.fillStyle = '#8f8a5c'; g.fillRect(x0 - 0.8 * K, z0 - 0.8 * K, w + 1.6 * K, d + 1.6 * K); // ridge
    if (p.dry) { g.fillStyle = '#7a6448'; g.fillRect(x0, z0, w, d); g.strokeStyle = 'rgba(60,45,30,0.5)'; g.lineWidth = 1.5; for (let z = 1; z < p.z1 - p.z0; z += 1.2) { g.beginPath(); g.moveTo(x0, z0 + z * K); g.lineTo(x0 + w, z0 + z * K); g.stroke(); } continue; }
    g.fillStyle = '#5b6248'; g.fillRect(x0, z0, w, d);
    const along = (p.x1 - p.x0) > (p.z1 - p.z0);
    g.fillStyle = 'rgb(96,170,62)';
    for (let a = 0.6; a < (along ? p.z1 - p.z0 : p.x1 - p.x0) - 0.3; a += 0.55) {
      for (let b = 0.5; b < (along ? p.x1 - p.x0 : p.z1 - p.z0) - 0.3; b += 0.5) {
        const px = along ? p.x0 + b : p.x0 + a, pz = along ? p.z0 + a : p.z0 + b;
        g.fillRect(toPx(px) - 1, toPx(pz) - 1, 2.4, 2.4);
      }
    }
  }
  // garden beds
  g.fillStyle = '#6a4e36'; g.fillRect(toPx(GARDEN.x0), toPx(GARDEN.z0), (GARDEN.x1 - GARDEN.x0) * K, (GARDEN.z1 - GARDEN.z0) * K);
  // lots
  const lotCol = { redbrick: '#a85a46', square: '#b9aa94', yard: '#c7b89c', plaza: '#a9a39a', gravel: '#8e877a', school: '#b05a3c', concrete: '#a7a39c' };
  for (const l of LOTS) {
    g.fillStyle = lotCol[l.kind] || '#aaa';
    g.fillRect(toPx(l.x - l.hw), toPx(l.z - l.hd), l.hw * 2 * K, l.hd * 2 * K);
    if (l.kind === 'square') {
      g.strokeStyle = 'rgba(90,70,60,0.35)'; g.lineWidth = 1;
      for (let x = -l.hw; x <= l.hw; x += 1.5) { g.beginPath(); g.moveTo(toPx(l.x + x), toPx(l.z - l.hd)); g.lineTo(toPx(l.x + x), toPx(l.z + l.hd)); g.stroke(); }
      for (let z = -l.hd; z <= l.hd; z += 1.5) { g.beginPath(); g.moveTo(toPx(l.x - l.hw), toPx(l.z + z)); g.lineTo(toPx(l.x + l.hw), toPx(l.z + z)); g.stroke(); }
    }
    if (l.kind === 'redbrick') { // red paving bricks and a painted court
      g.strokeStyle = 'rgba(70,35,25,0.35)'; g.lineWidth = 1;
      for (let z = -l.hd; z <= l.hd; z += 0.5) { g.beginPath(); g.moveTo(toPx(l.x - l.hw), toPx(l.z + z)); g.lineTo(toPx(l.x + l.hw), toPx(l.z + z)); g.stroke(); }
      g.fillStyle = '#3f6f94'; g.fillRect(toPx(l.x - 14), toPx(l.z - 8), 28 * K, 15 * K);
      g.strokeStyle = 'rgba(245,245,235,0.9)'; g.lineWidth = 0.1 * K;
      g.strokeRect(toPx(l.x - 14), toPx(l.z - 8), 28 * K, 15 * K);
      g.beginPath(); g.moveTo(toPx(l.x), toPx(l.z - 8)); g.lineTo(toPx(l.x), toPx(l.z + 7)); g.stroke();
      g.beginPath(); g.arc(toPx(l.x), toPx(l.z - 0.5), 1.8 * K, 0, 7); g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.arc(toPx(l.x + s * 14), toPx(l.z - 0.5), 6.7 * K, s < 0 ? -Math.PI / 2 : Math.PI / 2, s < 0 ? Math.PI / 2 : Math.PI * 1.5); g.stroke(); g.strokeRect(toPx(l.x + (s < 0 ? -14 : 8.2)), toPx(l.z - 2.9), 5.8 * K, 4.9 * K); }
    }
    if (l.kind === 'school') { // running track
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.25 * K;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(toPx(l.x), toPx(l.z), (l.hw - 2 - k * 1.2) * K, (l.hd - 2 - k * 1.2) * K, 0, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = '#6f8f48'; g.beginPath(); g.ellipse(toPx(l.x), toPx(l.z), (l.hw - 7.5) * K, (l.hd - 7.5) * K, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // sidewalks / arcade floors along the main street
  g.fillStyle = '#9d968c';
  g.fillRect(toPx(-230), toPx(-12), 460 * K, 6 * K);
  g.fillRect(toPx(-230), toPx(6), 460 * K, 6 * K);
  // building footprints: concrete, so no grass grows through the shop floors
  g.fillStyle = '#8f8a82';
  for (const [x0, x1, side] of ROWS) g.fillRect(toPx(x0), toPx(side < 0 ? -21.5 : 6), (x1 - x0) * K, 15.5 * K);
  for (const [ax, az, bx, bz, side, off, depth = 14] of SIDE_ROWS) {
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz * side, nz = dx * side;
    g.save(); g.translate(toPx(ax), toPx(az)); g.rotate(Math.atan2(dz, dx));
    // local x along the street, local y toward the side (canvas y matches +z)
    const ny = nx * -dz + nz * dx; // sign of the normal in local y
    g.fillStyle = '#9d968c'; g.fillRect(0, (ny > 0 ? 3.6 : -off - depth - 1) * K, L * K, (off + depth + 1 - 3.6) * K);
    g.restore();
  }
  // roads
  g.lineCap = 'butt'; g.lineJoin = 'round';
  const roadCol = { main: '#3f4043', street: '#46474a', highway: '#3a3b3e', lane: '#55555a', field: '#7c7466' };
  for (const pass of [0, 1]) for (const r of ROADS) {
    g.beginPath();
    r.pts.forEach(([x, z], i) => (i ? g.lineTo(toPx(x), toPx(z)) : g.moveTo(toPx(x), toPx(z))));
    if (pass === 0) { g.strokeStyle = r.kind === 'field' ? 'rgba(110,98,76,0.6)' : '#8d8a84'; g.lineWidth = (r.w + (r.kind === 'field' ? 1.5 : 0.8)) * K; }
    else { g.strokeStyle = roadCol[r.kind]; g.lineWidth = r.w * K; }
    g.stroke();
  }
  // asphalt speckle + patches
  for (let i = 0; i < 60000; i++) {
    const x = R() * WORLD - HALF, z = R() * WORLD - HALF;
    if (roadDist(x, z) > 0) continue;
    g.fillStyle = R() < 0.5 ? 'rgba(20,20,22,0.25)' : 'rgba(130,128,120,0.18)';
    g.fillRect(toPx(x), toPx(z), 1.5 + R() * 2, 1.5 + R() * 2);
  }
  for (let i = 0; i < 70; i++) {
    const r = ROADS[Math.floor(R() * 4)];
    const [ax, az] = r.pts[0], [bx, bz] = r.pts[1];
    const t = R(), x = ax + (bx - ax) * t + (R() - 0.5) * r.w * 0.6, z = az + (bz - az) * t + (R() - 0.5) * r.w * 0.6;
    g.fillStyle = R() < 0.5 ? 'rgba(25,25,28,0.5)' : 'rgba(90,88,84,0.45)';
    g.fillRect(toPx(x), toPx(z), (1 + R() * 3) * K, (0.8 + R() * 2) * K);
  }
  // markings
  const dash = (pts, color, width, on, off, offset = 0) => {
    g.strokeStyle = color; g.lineWidth = width * K; g.setLineDash(on ? [on * K, off * K] : []);
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(toPx(x), toPx(z)) : g.moveTo(toPx(x), toPx(z))));
    g.stroke(); g.setLineDash([]);
  };
  const shift = (pts, d) => pts.map(([x, z], i) => {
    const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    return [x - ((bz - az) / L) * d, z + ((bx - ax) / L) * d];
  });
  for (const r of ROADS) {
    if (r.kind === 'field') continue;
    if (r.kind === 'main' || r.kind === 'highway') {
      dash(shift(r.pts, -0.12), '#e2b33a', 0.13, 0, 0); dash(shift(r.pts, 0.12), '#e2b33a', 0.13, 0, 0);
      dash(shift(r.pts, r.w / 2 - 0.35), '#e8e6df', 0.14, 0, 0); dash(shift(r.pts, -(r.w / 2 - 0.35)), '#e8e6df', 0.14, 0, 0);
      // red curbs = no parking
      dash(shift(r.pts, r.w / 2 - 0.08), '#b53a30', 0.16, 4, 0.6);
      dash(shift(r.pts, -(r.w / 2 - 0.08)), '#b53a30', 0.16, 4, 0.6);
    } else dash(r.pts, '#dcd8cc', 0.12, 3, 3);
  }
  // zebra crossings at junctions on the main street
  g.fillStyle = 'rgba(236,234,226,0.92)';
  for (const x of [-150, -60, 50, 120, 200]) for (const s of [-1, 1]) {
    for (let k = -5; k <= 5; k += 1) g.fillRect(toPx(x + s * 7.5 - 1.5), toPx(k * 1.05 - 0.3), 3 * K, 0.5 * K);
  }
  // "慢" painted on lanes near the school
  g.fillStyle = 'rgba(240,238,230,0.85)'; g.font = `bold ${4 * K}px "PingFang TC","Heiti TC",sans-serif`; g.textAlign = 'center';
  for (const [x, z] of [[120, -40], [-150, 30], [200, -110]]) g.fillText('慢', toPx(x), toPx(z));
  g.fillText('停', toPx(-60), toPx(-8));
  // litter / dirt specks off-road
  for (let i = 0; i < 14000; i++) {
    const x = R() * WORLD - HALF, z = R() * WORLD - HALF;
    const r = R();
    g.fillStyle = r < 0.5 ? 'rgba(70,60,45,0.22)' : r < 0.8 ? 'rgba(170,160,120,0.22)' : 'rgba(210,190,70,0.3)';
    g.fillRect(toPx(x), toPx(z), 2, 2);
  }
  return cv;
}

function detailTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const a = (i / S) * Math.PI * 2, b = (j / S) * Math.PI * 2;
    const v = fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + Math.cos(b) * 3, 4) * 0.6 + noise(Math.sin(b) * 9, Math.cos(a) * 9) * 0.4;
    const c = 128 + v * 110;
    const p = (j * S + i) * 4;
    img.data[p] = img.data[p + 1] = img.data[p + 2] = c; img.data[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function buildTerrain(scene) {
  const R = N + 1;
  H = new Float32Array(R * R);
  const pos = new Float32Array(R * R * 3), uv = new Float32Array(R * R * 2);
  for (let iz = 0; iz < R; iz++) for (let ix = 0; ix < R; ix++) {
    const x = ix * CELL - HALF, z = iz * CELL - HALF;
    const h = shapedHeight(x, z);
    const i = iz * R + ix;
    H[i] = h;
    pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
    uv[i * 2] = ix / N; uv[i * 2 + 1] = iz / N;
  }
  const idx = new Uint32Array(N * N * 6);
  let o = 0;
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const a = iz * R + ix, b = (iz + 1) * R + ix, c = (iz + 1) * R + ix + 1, d = iz * R + ix + 1;
    idx[o++] = a; idx[o++] = b; idx[o++] = d;
    idx[o++] = b; idx[o++] = c; idx[o++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const paint = paintGround();
  const map = new THREE.CanvasTexture(paint);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.flipY = false;
  const detail = detailTexture();
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: detail };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWXZ = (modelMatrix * vec4(transformed,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;\nuniform sampler2D uDetail;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dA = texture2D(uDetail, vWXZ / 4.0).r;
        float dB = texture2D(uDetail, vWXZ / 37.0).r;
        diffuseColor.rgb *= mix(0.84, 1.12, dA) * mix(0.9, 1.08, dB);`);
  };
  wetify(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  scene.add(buildPaddyWater());
  return { mesh, paint };
}

// one merged water sheet over all wet paddies, reflecting the sky
function buildPaddyWater() {
  const pos = [], idx = [];
  let v = 0;
  for (const p of PADDIES) {
    if (p.dry) continue;
    pos.push(p.x0, WATER_Y, p.z0, p.x1, WATER_Y, p.z0, p.x1, WATER_Y, p.z1, p.x0, WATER_Y, p.z1);
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
    v += 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsLib.fog, uTime: WU.uTime, uSky: { value: new THREE.Color(0.6, 0.72, 0.85) }, uSun: { value: new THREE.Vector3(0.5, 0.6, 0.3) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) }, uWet: WU.uWet },
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime, uWet; uniform vec3 uSky, uSun, uSunCol; varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p){ return sin(p.x*1.7+uTime*0.9)*0.5+sin(p.y*2.3-uTime*0.7+p.x*0.4)*0.5 + sin((p.x-p.y)*5.0+uTime*2.5)*0.15*(1.0+uWet*3.0); }
      void main(){
        vec2 p = vW.xz; float e = 0.1;
        vec3 n = normalize(vec3(h(p+vec2(e,0.))-h(p-vec2(e,0.)), 14.0, h(p+vec2(0.,e))-h(p-vec2(0.,e))));
        vec3 v = normalize(cameraPosition - vW);
        float fr = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
        vec3 r = reflect(-v, n);
        float sp = pow(max(dot(r, normalize(uSun)), 0.0), 220.0);
        vec3 col = mix(vec3(0.2,0.24,0.14), uSky * 0.85, 0.18 + fr * 0.5) + uSunCol * sp * 2.0;
        gl_FragColor = vec4(col, 0.28 + fr * 0.42);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'paddyWater';
  m.renderOrder = 2;
  return m;
}
