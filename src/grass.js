// Grass that grows around the player: a patch of instanced blade clumps that
// follows the camera on a snapped grid. Height comes from the terrain height
// texture; density and tint come from the painted ground (grass-coloured
// pixels only, so no grass on roads, sand, paving or rock).

import * as THREE from 'three';
import { heightTexture, TERRAIN } from './world/terrain.js';
import { WU } from './weather.js';

export function buildGrass(scene, paintTex) {
  const PATCH = 96, N = 40000;
  // one clump = three crossed blades
  const pos = [], tip = [];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI, c = Math.cos(a) * 0.09, s = Math.sin(a) * 0.09;
    const lean = (b - 1) * 0.08;
    pos.push(-c, 0, -s, c, 0, s, lean, 1, lean * 0.5);
    tip.push(0, 0, 1);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  const off = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { off[i * 3] = Math.random(); off[i * 3 + 1] = Math.random(); off[i * 3 + 2] = Math.random(); }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  g.instanceCount = N;
  const U = {
    uH: { value: heightTexture() }, uPaint: { value: paintTex }, uCenter: { value: new THREE.Vector2() },
    uTime: WU.uTime, uWind: WU.uWind, uWet: WU.uWet,
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.5, 0.5, 0.5) },
    uWorld: { value: TERRAIN.HALF * 2 }, uGridN: { value: TERRAIN.N },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, ...U },
    fog: true, side: THREE.DoubleSide,
    vertexShader: `attribute float aTip; attribute vec3 aOff;
      uniform sampler2D uH, uPaint; uniform vec2 uCenter; uniform float uTime, uWind, uWorld, uGridN;
      varying vec3 vCol; varying float vTip;
      #include <fog_pars_vertex>
      void main(){
        float P = ${PATCH.toFixed(1)};
        vec2 xz = uCenter + (aOff.xy - 0.5) * P;
        // wrap each clump to the patch around the camera so the field stays put in the world
        xz = uCenter - P * 0.5 + mod(aOff.xy * P - uCenter, P);
        vec2 uv = (xz + uWorld * 0.5) / uWorld;
        // height texture holds vertex values: sample the texel centres
        vec2 huv = (uv * uGridN + 0.5) / (uGridN + 1.0);
        float h = texture2D(uH, huv).r;
        vec3 paint = texture2D(uPaint, uv).rgb;
        float grassy = smoothstep(0.05, 0.14, (paint.g - paint.b) - (paint.r - paint.g) * 1.4) * step(-0.8, h);
        float edge = 1.0 - smoothstep(P * 0.22, P * 0.5, length(xz - uCenter));
        float s = grassy * edge * (0.55 + aOff.z * 0.8);
        float ang = aOff.z * 31.4;
        vec3 p = position;
        p.y *= 0.4 * s;
        p.xz *= s * 1.4;
        float c = cos(ang), sn = sin(ang);
        p.xz = mat2(c, -sn, sn, c) * p.xz;
        float sway = aTip * (sin(uTime * (1.4 + uWind * 2.0) + xz.x * 0.35 + xz.y * 0.2) * (0.05 + uWind * 0.22));
        p.x += sway; p.z += sway * 0.6;
        vec3 w = vec3(xz.x + p.x, h + p.y, xz.y + p.z);
        vCol = paint * mix(0.62, 1.18, aTip) * vec3(0.95, 1.05, 0.9);
        vTip = aTip;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uSunDir, uSunCol, uAmb; uniform float uWet; varying vec3 vCol; varying float vTip;
      #include <fog_pars_fragment>
      void main(){
        float sun = clamp(uSunDir.y, 0.0, 1.0) * 0.55 + 0.25;
        vec3 col = vCol * (uAmb + uSunCol * sun * (0.6 + 0.4 * vTip)) * mix(1.0, 0.7, uWet);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.name = 'grass';
  scene.add(mesh);
  return {
    mesh,
    update(center, sky) {
      U.uCenter.value.set(center.x, center.z);
      U.uSunDir.value.copy(sky.sunDir);
      U.uSunCol.value.copy(sky.sun.color).multiplyScalar(sky.sun.intensity * 0.3);
      U.uAmb.value.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity * 0.55);
    },
  };
}
