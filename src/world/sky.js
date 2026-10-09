// Sky dome, sun/moon lighting, fog and the day clock.
// hour: 0..24. A full day lasts DAY_SECONDS of real time.

import * as THREE from 'three';
import { clamp, smooth, lerp } from '../util.js';

export const DAY_SECONDS = 24 * 45; // 45 s per game hour

const skyV = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = vec4(p.xy, p.w * 0.9999, p.w); }`;
const skyF = `uniform vec3 uTop, uHorizon, uSunCol, uSunDir, uGround, uMoonDir; uniform float uNight, uCloud, uTime, uFlash; uniform vec2 uWindDir; varying vec3 vDir;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += vn(p) * a; p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  vec3 sun = uSunCol * (pow(sd, 900.0) * 18.0 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.12);
  vec3 stars = vec3(0.0);
  if (uNight > 0.01 && h > 0.0) {
    vec3 c = floor(d * 420.0);
    stars = vec3(step(0.9975, hash(c))) * uNight * smoothstep(0.0, 0.3, h) * 1.4;
    float md = max(dot(d, normalize(uMoonDir)), 0.0);
    stars += vec3(0.85, 0.88, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.6 + pow(md, 60.0) * 0.12) * uNight;
  }
  // clouds: a drifting fbm layer projected on a flat ceiling
  float cover = 0.0;
  if (h > -0.02) {
    vec2 uv = d.xz / (h + 0.12) * 0.9 + uWindDir * uTime * 0.012;
    float n = fbm(uv * 1.3) * 0.75 + fbm(uv * 4.1 + 3.0) * 0.25;
    cover = smoothstep(1.02 - uCloud * 0.75, 1.3 - uCloud * 0.75, n + 0.25) * smoothstep(-0.02, 0.12, h);
  }
  vec3 cloudCol = mix(vec3(1.0, 0.98, 0.95), vec3(0.34, 0.36, 0.4), smoothstep(0.4, 1.0, uCloud));
  cloudCol = mix(cloudCol * (0.7 + uSunCol * 0.4), uHorizon * 0.6, uNight * 0.85);
  col = col * (1.0 - uCloud * 0.45) + sun * (1.0 - cover) + stars * (1.0 - cover);
  col = mix(col, cloudCol, cover * 0.95);
  col += vec3(0.75, 0.8, 1.0) * uFlash * (0.4 + cover);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.uni = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uGround: { value: new THREE.Color(0x6a6250) }, uNight: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(-0.4, 0.6, 0.5).normalize() }, uCloud: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uWindDir: { value: new THREE.Vector2(1, 0) },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: skyV, fragmentShader: skyF, side: THREE.BackSide, depthWrite: false, depthTest: false }));
    this.dome.scale.setScalar(3000);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6a5a40, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xcfd8e0, 120, 900);
    this.hour = 8.5;
    this.sunDir = new THREE.Vector3();
    this.night = 0;
  }
  // colours keyed by sun elevation
  update(dt, focus, running = true, wx = null) {
    if (running && !this.freeze) this.hour = (this.hour + (dt / DAY_SECONDS) * 24) % 24;
    const t = (this.hour - 6) / 12 * Math.PI; // 0 at 6h, pi at 18h
    const el = Math.sin(t); // -1..1
    const az = t;
    this.sunDir.set(Math.cos(az) * 0.9, Math.max(el, -0.3), -0.35 - Math.sin(az) * 0.25).normalize();
    const day = smooth(-0.08, 0.25, el);
    const dusk = smooth(0.35, 0.02, el) * smooth(-0.15, 0.05, el);
    this.night = 1 - smooth(-0.2, 0.02, el);
    const top = new THREE.Color(0x3f7ec9).lerp(new THREE.Color(0x1d2a52), dusk * 0.6).lerp(new THREE.Color(0x05070f), this.night);
    const hor = new THREE.Color(0xd9e4ea).lerp(new THREE.Color(0xf0a36a), dusk).lerp(new THREE.Color(0x121828), this.night);
    const sunC = new THREE.Color(0xfff2d8).lerp(new THREE.Color(0xff8a40), dusk);
    this.uni.uTop.value.copy(top);
    this.uni.uHorizon.value.copy(hor);
    this.uni.uSunCol.value.copy(sunC).multiplyScalar(day);
    this.uni.uSunDir.value.copy(this.sunDir);
    this.uni.uNight.value = this.night;
    this.uni.uGround.value.copy(hor).multiplyScalar(0.55);
    // the light follows the sun by day and becomes the moon by night
    const moon = this.night > 0.5;
    const L = moon ? new THREE.Vector3(-0.4, 0.8, 0.3).normalize() : this.sunDir.clone().setY(Math.max(0.12, this.sunDir.y)).normalize();
    this.sun.color.copy(moon ? new THREE.Color(0x8fa6d8) : sunC);
    const cloud = wx ? wx.cloud : 0, fogW = wx ? wx.fog : 0, rain = wx ? wx.rain : 0, flash = wx ? wx.flash : 0;
    this.sun.intensity = (moon ? 0.55 * this.night : 3.0 * day + 0.2) * (1 - 0.72 * smooth(0.3, 1, cloud));
    this.hemi.color.copy(top).lerp(new THREE.Color(0xffffff), 0.35).lerp(new THREE.Color(0x9aa4b0), cloud * 0.6);
    this.hemi.groundColor.set(0x6a5a40).lerp(new THREE.Color(0x101418), this.night);
    this.hemi.intensity = lerp(1.1, 0.55, this.night) * (1 - 0.15 * cloud) + flash * 2.5;
    const fogC = hor.clone().lerp(new THREE.Color(0x8a9098).multiplyScalar(1 - this.night * 0.8), Math.max(cloud * 0.6, fogW));
    this.scene.fog.color.copy(fogC);
    this.uni.uHorizon.value.lerp(fogC, Math.max(fogW, cloud * 0.5)); // no seam between fogged ground and sky
    this.scene.fog.near = lerp(lerp(120, 40, this.night), 8, Math.max(fogW, rain * 0.5));
    this.scene.fog.far = lerp(lerp(900, 320, this.night), 110, Math.max(fogW, rain * 0.6));
    this.uni.uCloud.value = cloud;
    this.uni.uFlash.value = flash;
    this.uni.uTime.value += dt;
    if (wx) this.uni.uWindDir.value.copy(wx.windDir).multiplyScalar(0.3 + wx.wind);
    this.fogCol = fogC;
    if (focus) {
      this.sun.position.copy(focus).addScaledVector(L, 150);
      this.sun.target.position.copy(focus);
      // snap to shadow texels to stop shimmer
      const s = 90 / 2048;
      this.sun.target.position.x = Math.round(focus.x / s) * s;
      this.sun.target.position.z = Math.round(focus.z / s) * s;
      this.sun.position.x = this.sun.target.position.x + L.x * 150;
      this.sun.position.z = this.sun.target.position.z + L.z * 150;
    }
    this.dome.position.copy(focus || this.dome.position);
    return { night: this.night, day };
  }
  get isNight() { return this.hour < 5.5 || this.hour > 19.5; }
  clockText() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
