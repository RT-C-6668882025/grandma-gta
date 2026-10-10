// Third-person orbit camera that stays out of the ground and walls.

import * as THREE from 'three';
import { heightAt } from './world/terrain.js';
import { segmentBlock } from './collide.js';
import { clamp, damp, dampAngle } from './util.js';
import { CAMERA_MODES, cameraPreset, savedCameraMode } from './camera-modes.js';

export class OrbitCam {
  constructor(camera) {
    this.cam = camera;
    this.yaw = Math.PI;   // camera sits behind a player facing +z when yaw = pi
    this.mode = savedCameraMode();
    const preset = cameraPreset(this.mode);
    this.pitch = preset.pitch;
    this.want = preset.distance;
    this.cur = preset.distance;
    this.lookIdle = 0;
    this.target = new THREE.Vector3();
    this.shake = 0;
    this.override = null; // {pos, look} for cutscenes
  }
  setMode(mode) {
    if (!CAMERA_MODES.includes(mode)) return;
    this.mode = mode;
    const preset = cameraPreset(mode);
    this.pitch = preset.pitch; this.want = this.cur = preset.distance; this.lookIdle = 0;
    try { localStorage.setItem('ama-camera-mode-v1', mode); } catch {}
  }
  cycleMode() { this.setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length]); return this.mode; }
  input(dx, dy, wheel) {
    if (dx || dy) this.lookIdle = 0;
    this.yaw -= dx * 0.0032;
    const preset = cameraPreset(this.mode);
    this.pitch = clamp(this.pitch + dy * 0.0026, preset.minPitch, preset.maxPitch);
    if (wheel && this.mode !== 'first') this.want = this.mode === 'god' ? clamp(this.want + wheel * 2, 12, 65) : clamp(this.want + wheel * .4, 2.3, 8);
  }
  update(dt, focus, height = 1.86, follow = {}) {
    if (this.override) {
      this.cam.position.lerp(this.override.pos, 1 - Math.exp(-3 * dt));
      this.cam.lookAt(this.override.look);
      return;
    }
    this.lookIdle += dt;
    if (this.mode === 'third' && this.lookIdle > 1.5 && follow.moving && Number.isFinite(follow.heading)) this.yaw = dampAngle(this.yaw, follow.heading + Math.PI, 2, dt);
    this.target.set(focus.x, damp(this.target.y || focus.y + height * 0.86, focus.y + height * 0.86, 12, dt), focus.z);
    const t = this.target;
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    if (this.mode === 'first') {
      // Place the eye at the character, looking along the same movement basis.
      this.cam.position.set(focus.x, focus.y + height * .94, focus.z);
      this.cam.lookAt(this.cam.position.clone().addScaledVector(dir, -10));
      return;
    }
    if (this.mode === 'god') {
      this.cam.position.copy(t.clone().addScaledVector(dir, this.want));
      this.cam.position.y = Math.max(this.cam.position.y, heightAt(this.cam.position.x, this.cam.position.z) + 3);
      this.cam.lookAt(t); return;
    }
    const distance = Math.max(this.want, follow.vehicleDistance || 0);
    // pull in when a wall is between the player and the camera
    const far = t.clone().addScaledVector(dir, distance);
    const f = segmentBlock(t.x, t.y, t.z, far.x, far.y, far.z);
    const d = Math.max(.35, distance * f - .25);
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
