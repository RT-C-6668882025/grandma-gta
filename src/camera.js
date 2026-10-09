// Third-person orbit camera that stays out of the ground and walls.

import * as THREE from 'three';
import { heightAt } from './world/terrain.js';
import { segmentBlock } from './collide.js';
import { clamp, damp } from './util.js';

export class OrbitCam {
  constructor(camera) {
    this.cam = camera;
    this.yaw = Math.PI;   // camera sits behind a player facing +z when yaw = pi
    this.pitch = 0.28;
    this.dist = 4.6;
    this.want = 4.6;
    this.cur = 4.6;
    this.target = new THREE.Vector3();
    this.shake = 0;
    this.override = null; // {pos, look} for cutscenes
  }
  input(dx, dy, wheel) {
    this.yaw -= dx * 0.0032;
    this.pitch = clamp(this.pitch + dy * 0.0026, -0.35, 1.2);
    if (wheel) this.want = clamp(this.want + wheel * 0.6, 2.2, 11);
  }
  update(dt, focus, height = 1.86) {
    if (this.override) {
      this.cam.position.lerp(this.override.pos, 1 - Math.exp(-3 * dt));
      this.cam.lookAt(this.override.look);
      return;
    }
    this.target.set(focus.x, damp(this.target.y || focus.y + height * 0.86, focus.y + height * 0.86, 12, dt), focus.z);
    const t = this.target;
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // pull in when a wall is between the player and the camera
    const far = t.clone().addScaledVector(dir, this.want);
    const f = segmentBlock(t.x, t.y, t.z, far.x, far.y, far.z);
    const d = Math.max(1.2, this.want * f - 0.3);
    this.cur = d < this.cur ? d : damp(this.cur, d, 4, dt);
    const p = t.clone().addScaledVector(dir, this.cur);
    const g = heightAt(p.x, p.z) + 0.45;
    if (p.y < g) p.y = g;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3);
      p.x += (Math.random() - 0.5) * this.shake * 0.25;
      p.y += (Math.random() - 0.5) * this.shake * 0.25;
    }
    this.cam.position.copy(p);
    this.cam.lookAt(t);
  }
  // world-space forward/right on the ground for movement input
  basis() {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    return { f, r };
  }
}
