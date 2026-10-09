// Particles: two pooled point systems (soft = smoke/dust/blood, glow = embers/sparks),
// plus emitters for campfires, the forge, chimneys and the smoking crater.

import * as THREE from 'three';
import { WX } from './weather.js';

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

class Pool {
  constructor(scene, n, additive) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.grow = new Float32Array(n); this.drag = new Float32Array(n); this.grav = new Float32Array(n);
    this.a0 = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.g = g;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { ...THREE.UniformsLib.fog, uTex: { value: softTex() }, uScale: { value: 600 } },
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vCol;
        #include <fog_pars_vertex>
        void main(){ vCol = aCol; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.5, -mvPosition.z); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D uTex; varying vec4 vCol;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vCol.rgb, vCol.a * t.a); if (gl_FragColor.a < 0.004) discard;
          #include <fog_fragment>
        }`,
    });
    this.m = m;
    this.pts = new THREE.Points(g, m);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = additive ? 6 : 4;
    scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, o) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.col.set([o.r, o.g, o.b, o.a], i * 4);
    this.a0[i] = o.a; this.size[i] = o.size; this.grow[i] = o.grow || 0;
    this.life[i] = this.max[i] = o.life; this.drag[i] = o.drag ?? 0.5; this.grav[i] = o.grav ?? 0;
  }
  update(dt, wind) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      const j = i * 3;
      this.vel[j] = this.vel[j] * k + wind.x * dt * 0.8; this.vel[j + 1] = this.vel[j + 1] * k - this.grav[i] * dt; this.vel[j + 2] = this.vel[j + 2] * k + wind.y * dt * 0.8;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.col[i * 4 + 3] = this.a0[i] * Math.min(1, t * 3) * Math.min(1, (1 - t) * 6 + 0.2);
    }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.aCol.needsUpdate = true; this.g.attributes.aSize.needsUpdate = true;
  }
}

let soft, glow, plume;
const emitters = []; // {x,y,z,kind,acc}
const R = Math.random;
export function initFx(scene, renderer) {
  soft = new Pool(scene, 1400, false);
  glow = new Pool(scene, 600, true);
  plume = new Pool(scene, 260, false); // long-lived volcano smoke, kept apart so fires can't recycle it
  const s = renderer.getPixelRatio() * innerHeight * 0.5;
  soft.m.uniforms.uScale.value = s; glow.m.uniforms.uScale.value = s; plume.m.uniforms.uScale.value = s;
}
export function addEmitter(x, y, z, kind) { emitters.push({ x, y, z, kind, acc: R() }); }

// one-shot effects
export const fx = {
  dust(p, n = 4, big = 1) {
    for (let i = 0; i < n; i++) soft.emit(p.x + (R() - 0.5) * 0.4, p.y + 0.1, p.z + (R() - 0.5) * 0.4, (R() - 0.5) * 1.2, 0.4 + R() * 0.5, (R() - 0.5) * 1.2,
      { r: 0.62, g: 0.55, b: 0.44, a: 0.28 * (1 - WX.wet * 0.8), size: 0.5 * big, grow: 1.2 * big, life: 0.9 + R() * 0.5, drag: 2.5 });
  },
  sparks(p, n = 14) {
    for (let i = 0; i < n; i++) glow.emit(p.x, p.y, p.z, (R() - 0.5) * 6, R() * 4 + 1, (R() - 0.5) * 6, { r: 1, g: 0.75, b: 0.35, a: 1, size: 0.09, life: 0.25 + R() * 0.3, drag: 1.5, grav: 9 });
  },
  blood(p, n = 8) {
    for (let i = 0; i < n; i++) soft.emit(p.x, p.y, p.z, (R() - 0.5) * 2.5, R() * 2, (R() - 0.5) * 2.5, { r: 0.42, g: 0.04, b: 0.03, a: 0.7, size: 0.14, grow: 0.15, life: 0.45 + R() * 0.3, drag: 1, grav: 7 });
  },
  splash(p, n = 6) {
    for (let i = 0; i < n; i++) soft.emit(p.x, p.y, p.z, (R() - 0.5) * 2, 1.5 + R() * 1.5, (R() - 0.5) * 2, { r: 0.8, g: 0.86, b: 0.9, a: 0.5, size: 0.18, grow: 0.3, life: 0.6, drag: 0.8, grav: 8 });
  },
  // cigarette smoke: a thin rising wisp from the tip, a puff when she exhales
  wisp(p) { soft.emit(p.x, p.y, p.z, (R() - 0.5) * 0.05, 0.25, (R() - 0.5) * 0.05, { r: 0.8, g: 0.8, b: 0.82, a: 0.22, size: 0.05, grow: 0.25, life: 2.2, drag: 0.4 }); },
  puff(p, f) { soft.emit(p.x, p.y, p.z, (f ? f.x * 0.5 : 0) + (R() - 0.5) * 0.2, 0.15 + R() * 0.1, (f ? f.z * 0.5 : 0) + (R() - 0.5) * 0.2, { r: 0.85, g: 0.85, b: 0.86, a: 0.2, size: 0.06, grow: 0.4, life: 1.8, drag: 1.0 }); },
  // betel-nut juice: a red arc
  spit(p, f) { for (let i = 0; i < 10; i++) soft.emit(p.x, p.y, p.z, f.x * 2.2 + (R() - 0.5) * 0.4, 1.0 + R() * 0.5, f.z * 2.2 + (R() - 0.5) * 0.4, { r: 0.6, g: 0.05, b: 0.05, a: 0.85, size: 0.05, grow: 0.02, life: 0.8, drag: 0.4, grav: 8 }); },
  // cartoon hit: a burst of white/yellow sparks and dust
  impact(p) {
    for (let i = 0; i < 10; i++) glow.emit(p.x, p.y, p.z, (R() - 0.5) * 5, R() * 3, (R() - 0.5) * 5, { r: 1, g: 0.95, b: 0.6, a: 1, size: 0.1, life: 0.18 + R() * 0.15, drag: 3 });
    for (let i = 0; i < 4; i++) soft.emit(p.x, p.y, p.z, (R() - 0.5) * 1.5, R() * 1, (R() - 0.5) * 1.5, { r: 0.9, g: 0.88, b: 0.8, a: 0.35, size: 0.2, grow: 1.2, life: 0.4, drag: 3 });
  },
  fireworks(p) {
    for (let k = 0; k < 6; k++) setTimeout(() => {
      const c = [[1, 0.3, 0.4], [1, 0.85, 0.3], [0.4, 0.9, 1], [0.6, 1, 0.5], [1, 0.5, 1]][k % 5];
      const ox = (R() - 0.5) * 30, oy = R() * 8, oz = (R() - 0.5) * 12;
      for (let i = 0; i < 90; i++) { const a = R() * Math.PI * 2, b = Math.acos(2 * R() - 1), s = 7 + R() * 3; glow.emit(p.x + ox, p.y + oy, p.z + oz, Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s, { r: c[0], g: c[1], b: c[2], a: 1, size: 0.35, life: 1.4 + R() * 0.6, drag: 1.4, grav: 2.5 }); }
    }, k * 550);
  },
  glint(p) { glow.emit(p.x + (R() - 0.5) * 0.5, p.y + R() * 0.4, p.z + (R() - 0.5) * 0.5, 0, 0.3, 0, { r: 1, g: 0.9, b: 0.5, a: 0.9, size: 0.18, life: 0.6, drag: 0 }); },
};

export function tickFx(dt, focus, night) {
  const wind = { x: WX.windDir.x * (0.3 + WX.wind * 2.5), y: WX.windDir.y * (0.3 + WX.wind * 2.5) };
  for (const e of emitters) {
    const d = Math.hypot(e.x - focus.x, e.z - focus.z);
    if (e.kind !== 'volcano' && d > 90) continue;
    e.acc += dt;
    if (e.kind === 'fire') {
      while (e.acc > 0.12) {
        e.acc -= 0.12;
        const rain = WX.rain;
        soft.emit(e.x + (R() - 0.5) * 0.4, e.y + 0.6, e.z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.3, 1.2 + R() * 0.6, (R() - 0.5) * 0.3,
          { r: 0.35 + rain * 0.2, g: 0.33 + rain * 0.2, b: 0.32 + rain * 0.2, a: 0.22 + rain * 0.15, size: 0.8, grow: 1.6, life: 3.5 + R() * 2, drag: 0.3 });
        if (R() < 0.6) glow.emit(e.x + (R() - 0.5) * 0.5, e.y + 0.3, e.z + (R() - 0.5) * 0.5, (R() - 0.5) * 0.8, 1.5 + R() * 2, (R() - 0.5) * 0.8,
          { r: 1, g: 0.55, b: 0.2, a: 1, size: 0.07, life: 0.8 + R() * 0.9, drag: 0.6, grav: -0.5 });
      }
    } else if (e.kind === 'forge') {
      while (e.acc > 0.18) { e.acc -= 0.18; glow.emit(e.x + (R() - 0.5) * 0.8, e.y, e.z + (R() - 0.5) * 0.5, (R() - 0.5) * 1.5, 1 + R() * 2.5, (R() - 0.5) * 1.5, { r: 1, g: 0.6, b: 0.2, a: 1, size: 0.06, life: 0.6 + R() * 0.6, drag: 0.8, grav: 1 }); }
    } else if (e.kind === 'chimney') {
      while (e.acc > 0.35) { e.acc -= 0.35; soft.emit(e.x, e.y, e.z, 0, 0.8, 0, { r: 0.55, g: 0.54, b: 0.52, a: 0.16, size: 0.9, grow: 1.4, life: 5 + R() * 3, drag: 0.2 }); }
    } else if (e.kind === 'volcano') {
      while (e.acc > 0.35) {
        e.acc -= 0.35;
        const g = night ? 0.18 : 0.55;
        plume.emit(e.x + (R() - 0.5) * 24, e.y, e.z + (R() - 0.5) * 24, (R() - 0.5) * 1.5, 4 + R() * 3, (R() - 0.5) * 1.5,
          { r: g, g: g * 0.97, b: g * 0.95, a: 0.45, size: 45 + R() * 30, grow: 9, life: 45 + R() * 20, drag: 0.015 });
      }
    }
  }
  soft.update(dt, wind);
  glow.update(dt, wind);
  plume.update(dt, wind);
}
