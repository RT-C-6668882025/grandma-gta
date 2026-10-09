// Birds: egrets over the paddies, swallows round the street and temple,
// drongos near home, a black kite circling high. Instanced paper-plane bodies; the wings flap in
// the vertex shader. They scatter into the sky in rain.

import * as THREE from 'three';
import { heightAt } from './world/terrain.js';
import { WX } from './weather.js';

export function buildBirds(scene) {
  // body + two wings; aWing = -1 / +1 marks the tips that flap
  const v = [
    0, 0, 0.35, -0.06, 0, -0.3, 0.06, 0, -0.3,      // body
    0, 0, 0.1, 0, 0, -0.12, -0.7, 0.02, -0.05,      // left wing
    0, 0, 0.1, 0.7, 0.02, -0.05, 0, 0, -0.12,       // right wing
  ];
  const wing = [0, 0, 0, 0, 0, -1, 0, 1, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  const flocks = [
    { c: [30, 150], r: 40, h: 9, n: 9, s: 0.95, col: 0xf4f4f0, flap: 5, speed: 0.2 },     // egrets over the paddies (白鷺鷥)
    { c: [150, 150], r: 35, h: 8, n: 7, s: 0.95, col: 0xf0f0ea, flap: 5, speed: 0.22 },
    { c: [-110, 170], r: 30, h: 10, n: 6, s: 0.95, col: 0xf4f4f0, flap: 5, speed: 0.2 },
    { c: [0, 0], r: 70, h: 16, n: 14, s: 0.45, col: 0x202838, flap: 14, speed: 0.6 },   // swallows over the main street
    { c: [50, -90], r: 30, h: 20, n: 8, s: 0.45, col: 0x202838, flap: 14, speed: 0.55 }, // and the temple
    { c: [120, 120], r: 90, h: 70, n: 1, s: 2.4, col: 0x3a2a1a, flap: 2, speed: 0.07, glide: true }, // black kite (老鷹)
    { c: [-60, 100], r: 45, h: 18, n: 8, s: 0.6, col: 0x151515, flap: 10, speed: 0.4 },  // drongos
  ];

  const birds = [];
  for (const f of flocks) for (let i = 0; i < f.n; i++) birds.push({ f, ph: Math.random() * Math.PI * 2, rr: f.r * (0.6 + Math.random() * 0.5), dh: (Math.random() - 0.5) * 6, dir: Math.random() < 0.8 ? 1 : -1, fl: Math.random() * 6 });
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const U = { uTime: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWing; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float fr = instanceMatrix[3].w; // unused
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
        float speed = length(instanceMatrix[0].xyz) > 1.5 ? 2.0 : 11.0;
        transformed.y += abs(aWing) * sin(uTime * speed + ph) * 0.35;`);
  };
  const im = new THREE.InstancedMesh(g, mat, birds.length);
  const col = new THREE.Color();
  birds.forEach((b, i) => im.setColorAt(i, col.set(b.f.col)));
  im.frustumCulled = false;
  scene.add(im);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  let t = 0;
  return {
    update(dt, time) {
      t += dt;
      U.uTime.value = time;
      const scatter = WX.rain; // in rain they climb and widen their circles
      birds.forEach((b, i) => {
        const f = b.f;
        const a = b.ph + t * f.speed * b.dir * (1 + scatter * 0.5);
        const r = b.rr * (1 + scatter * 0.6) + Math.sin(t * 0.3 + b.ph) * 6;
        const x = f.c[0] + Math.cos(a) * r, z = f.c[1] + Math.sin(a) * r;
        const y = (f.h > 100 ? f.h : heightAt(f.c[0], f.c[1]) + f.h) + b.dh + Math.sin(t * 0.7 + b.ph) * 2 + scatter * 20;
        const heading = Math.atan2(-Math.sin(a) * b.dir, Math.cos(a) * b.dir);
        e.set(0, heading, -0.35 * b.dir);
        q.setFromEuler(e);
        m.compose(p.set(x, y, z), q, s.setScalar(f.s));
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
    },
  };
}
