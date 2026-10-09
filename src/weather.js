// Weather: clear / cloudy / rain / storm / morning fog. A slow Markov chain picks
// the next state every few game hours; the visible parameters ease toward it.
// Everything that reacts to weather reads WX (smoothed values) or the shared
// shader uniforms in WU (wet surfaces, wind sway).

import * as THREE from 'three';
import { clamp, lerp, damp } from './util.js';

export const WU = { uWet: { value: 0 }, uWind: { value: 0.3 }, uTime: { value: 0 } };

export const STATES = {
  clear:  { cloud: 0.12, rain: 0, fog: 0, wind: 0.25, name: '晴', icon: '☀' },
  cloudy: { cloud: 0.65, rain: 0, fog: 0.08, wind: 0.5, name: '多云', icon: '☁' },
  rain:   { cloud: 0.92, rain: 0.65, fog: 0.3, wind: 0.6, name: '雨', icon: '🌧' },
  storm:  { cloud: 1.0, rain: 1.0, fog: 0.45, wind: 1.0, name: '雷雨', icon: '⛈' },
  fog:    { cloud: 0.35, rain: 0, fog: 1.0, wind: 0.08, name: '雾', icon: '🌫' },
};
const NEXT = {
  clear: { clear: 3, cloudy: 3 },
  cloudy: { clear: 3, cloudy: 1, rain: 3, storm: 1 },
  rain: { cloudy: 3, rain: 1, storm: 1, clear: 1 },
  storm: { rain: 3, cloudy: 1 },
  fog: { clear: 3, cloudy: 1 },
};

export const WX = { state: 'clear', cloud: 0.12, rain: 0, fog: 0, wind: 0.25, wet: 0, flash: 0, windDir: new THREE.Vector2(0.8, 0.6).normalize() };
let nextIn = 4, lastHour = null, thunderQ = [];
let onThunder = null;
export function onThunderCb(fn) { onThunder = fn; }

export function setWeather(s, instant = false) {
  if (!STATES[s]) return;
  WX.state = s;
  nextIn = 3 + Math.random() * 5;
  if (instant) Object.assign(WX, { cloud: STATES[s].cloud, rain: STATES[s].rain, fog: STATES[s].fog, wind: STATES[s].wind });
}

function pick(from) {
  const w = NEXT[from];
  let sum = 0;
  for (const k in w) sum += w[k];
  let r = Math.random() * sum;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return 'clear';
}

// dt: real seconds; hour: game clock
export function tickWeather(dt, hour, time) {
  if (lastHour !== null) {
    let dh = hour - lastHour;
    if (dh < 0) dh += 24;
    if (dh < 6) nextIn -= dh; // a sleep skips the clock; don't burn through states
  }
  lastHour = hour;
  // mornings (5-8h) can roll a fog bank
  if (hour > 5 && hour < 5.2 && WX.state === 'clear' && Math.random() < 0.004) setWeather('fog');
  if (WX.state === 'fog' && hour > 10) setWeather('clear');
  if (nextIn <= 0) setWeather(pick(WX.state));
  const T = STATES[WX.state];
  for (const k of ['cloud', 'rain', 'fog', 'wind']) WX[k] = damp(WX[k], T[k], 0.08, dt);
  // ground gets wet fast in rain and dries slowly in sun
  WX.wet = clamp(WX.wet + (WX.rain > 0.2 ? dt * 0.05 * WX.rain : -dt * 0.004), 0, 1);
  // lightning
  WX.flash = Math.max(0, WX.flash - dt * 3.5);
  if (WX.state === 'storm' && WX.rain > 0.7 && Math.random() < dt * 0.09) {
    WX.flash = 1;
    const delay = 0.4 + Math.random() * 2.6;
    thunderQ.push({ t: time + delay, vol: clamp(1.4 - delay / 3, 0.3, 1) });
  }
  for (let i = thunderQ.length - 1; i >= 0; i--) if (time >= thunderQ[i].t) { onThunder && onThunder(thunderQ[i].vol); thunderQ.splice(i, 1); }
  const a = time * 0.02;
  WX.windDir.set(Math.cos(a) * 0.8 + 0.2, Math.sin(a) * 0.6 + 0.4).normalize();
  WU.uWet.value = WX.wet;
  WU.uWind.value = WX.wind;
  WU.uTime.value = time;
}

// how far people can see: rain and fog hide you
export const visibility = () => clamp(1 - 0.45 * Math.max(WX.rain, WX.fog), 0.45, 1);

// ------------------------------------------------------------------ rain streaks around the camera
export function buildRain(scene) {
  const N = 9000;
  const off = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    for (let k = 0; k < 2; k++) { off.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(off, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uRain: { value: 0 }, uWind: { value: new THREE.Vector2() }, uCol: { value: new THREE.Color(0.75, 0.8, 0.85) } },
    vertexShader: `attribute float aEnd; uniform vec3 uCam; uniform float uTime, uRain; uniform vec2 uWind; varying float vA;
      void main(){
        vec3 box = vec3(36.0, 22.0, 36.0);
        vec3 p;
        p.xz = uCam.xz + mod(position.xz * box.xz - uCam.xz, box.xz) - box.xz * 0.5;
        p.y = uCam.y - 7.0 + mod(position.y * box.y - uTime * 13.0, box.y);
        vec3 vel = vec3(uWind.x * 3.5, -13.0, uWind.y * 3.5);
        p -= vel * 0.045 * aEnd;
        p.xz -= uWind * (p.y - uCam.y) * 0.2;
        vA = step(position.x, uRain) * (0.25 + 0.2 * aEnd);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uCol, vA); }`,
  });
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  scene.add(lines);
  return {
    update(cam, time, night) {
      m.uniforms.uCam.value.copy(cam);
      m.uniforms.uTime.value = time;
      m.uniforms.uRain.value = WX.rain;
      m.uniforms.uWind.value.copy(WX.windDir).multiplyScalar(WX.wind);
      m.uniforms.uCol.value.setScalar(night ? 0.45 : 0.78);
      lines.visible = WX.rain > 0.02;
    },
  };
}

// patch standard materials so they darken and gloss when wet
export function wetify(mat, strength = 1) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev && prev.call(mat, sh, r);
    sh.uniforms.uWet = WU.uWet;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, uWet * ${(0.75 * strength).toFixed(2)});`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(1.0, 0.64, uWet * ${strength.toFixed(2)});`);
  };
  mat.customProgramCacheKey = () => (mat.userData.key || mat.uuid) + ':wet';
  mat.needsUpdate = true;
  return mat;
}
export const wxDebug = () => ({ nextIn, lastHour, state: WX.state });
