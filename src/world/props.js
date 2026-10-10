import { loadModel } from '../model-loader.js';
// Static Tripo props from Combos, drawn as instanced meshes: each GLB is
// normalised (centred on x/z, base at y = 0, height 1) and every mesh inside it
// becomes one InstancedMesh holding all placements.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt } from './terrain.js';
import { addBox, addCircle, setTag } from '../collide.js';
import { P, ROWS } from './layout.js';
import { doors, seats, court, hideout, tripoTrees } from './town.js';
import { rng } from '../util.js';

const loader = new GLTFLoader();
const models = {};
export async function loadPropModels(names, dir = 'props') {
  await Promise.all(names.map(async (n) => {
    if (models[n]) return;
    try {
      const g = await loadModel(loader, `assets/${dir}/${n}.glb`);
      g.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.scene), s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const norm = new THREE.Matrix4().makeScale(1 / s.y, 1 / s.y, 1 / s.y).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
      const parts = [];
      g.scene.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, m: norm.clone().multiply(o.matrixWorld) }); });
      models[n] = { parts, size: s.clone().divideScalar(s.y) };
    } catch (e) { console.warn('prop missing', n); }
  }));
}
export const hasModel = (n) => !!models[n];
export const modelSize = (n) => models[n]?.size;
// items: [x, z, ry, h, y?]; o.collide: 'box' | 'circle'
export function placeInstanced(scene, name, items, o = {}) {
  const M = models[name];
  if (!M || !items.length) return null;
  const grp = new THREE.Group(); grp.name = 'props:' + name;
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  for (const part of M.parts) {
    const im = new THREE.InstancedMesh(part.geo, part.mat, items.length);
    items.forEach(([x, z, ry = 0, h = 1, y], i) => {
      q.setFromAxisAngle(UP, ry);
      mm.compose(new THREE.Vector3(x, y ?? heightAt(x, z), z), q, new THREE.Vector3(h, h, h)).multiply(part.m);
      im.setMatrixAt(i, mm);
    });
    im.castShadow = o.shadow !== false; im.receiveShadow = true;
    im.computeBoundingSphere();
    grp.add(im);
  }
  if (o.collide) for (const [x, z, ry = 0, h = 1, y] of items) {
    const sx = M.size.x * h / 2, sz = M.size.z * h / 2, top = (y ?? heightAt(x, z)) + h;
    if (o.collide === 'circle') addCircle(x, z, Math.max(sx, sz) * 0.8, top);
    else addBox(x, z, sx * 0.9, sz * 0.9, ry, top);
  }
  scene.add(grp);
  return grp;
}

// ---------------------------------------------------------------- where everything goes
export const speakers = []; // positions of 大媽音響 (music sources)
export async function dressTown(scene) {
  await Promise.all([
    loadPropModels(['vegstall', 'foodcart', 'stools', 'speaker', 'gascan', 'shelf', 'fridge', 'betelstand', 'fitness', 'hoop', 'judges', 'drumstool', 'temple', 'karaoke', 'calldesk']),
    loadPropModels(['radio', 'newspaper', 'trophy'], 'gear'),
  ]);
  const R = rng(99);
  const mx = P.market.x;
  // market street: vegetable stalls both sides, food carts, stools, gas cans
  const stalls = [], carts = [], stoolL = [], gas = [];
  for (let z = -18; z > -108; z -= 7) {
    for (const sd of [-1, 1]) {
      if (R() < 0.72) stalls.push([mx + sd * 5.0, z + (R() - 0.5), sd < 0 ? 0 : Math.PI, 2.3]);
      else { carts.push([mx + sd * 4.6, z, sd < 0 ? Math.PI / 2 : -Math.PI / 2, 2.1]); stoolL.push([mx + sd * 2.6, z + 1.5, R() * 3, 0.85]); }
      if (R() < 0.35) gas.push([mx + sd * 6.8, z + 2.6, R() * 6, 0.9]);
    }
  }
  placeInstanced(scene, 'vegstall', stalls, { collide: 'box' });
  placeInstanced(scene, 'foodcart', carts, { collide: 'box' });
  placeInstanced(scene, 'stools', stoolL, { collide: 'circle' });
  placeInstanced(scene, 'gascan', gas, { collide: 'circle' });
  // food stalls + stools on the temple square (night market corner)
  const sq = P.square;
  placeInstanced(scene, 'foodcart', [[sq.x + 22, sq.z - 12, -Math.PI / 2, 2.1], [sq.x + 22, sq.z - 4, -Math.PI / 2, 2.1], [sq.x + 22, sq.z + 4, -Math.PI / 2, 2.1]], { collide: 'box' });
  placeInstanced(scene, 'stools', [[sq.x + 17, sq.z - 10, 0.3, 0.85], [sq.x + 17, sq.z - 2, 1.2, 0.85], [sq.x + 17, sq.z + 6, 2.2, 0.85], [P.banyan.x + 3, P.banyan.z + 3, 0, 0.85]], { collide: 'circle' });
  // 大媽音響: loudspeakers at the square and the market
  const sp = [[sq.x - 12, sq.z - 8, Math.PI / 2, 1.1], [sq.x + 12, sq.z - 8, -Math.PI / 2, 1.1], [mx + 2.6, -60, -Math.PI / 2, 0.9]];
  placeInstanced(scene, 'speaker', sp, { collide: 'circle' });
  for (const s of sp) speakers.push({ x: s[0], z: s[1] });
  // inside 阿桃柑仔店: shelves and the drinks fridge
  if (doors.shop) {
    const { x, z } = doors.shop; // door is 0.8 m inside the open front
    // the door point sits 4.6 m inside the column line; the back wall is 2.4 m further in
    placeInstanced(scene, 'shelf', [[x - 1.1, z - 1.95, -Math.PI / 2, 2.1], [x + 0.9, z - 1.95, -Math.PI / 2, 2.1]], { collide: 'box' });
    placeInstanced(scene, 'fridge', [[x - 1.9, z + 1.0, 0, 1.6]], { collide: 'box' });
    placeInstanced(scene, 'newspaper', [[x + 1.2, z + 3.6, 0.3, 0.3]]);
  }
  // hardware store: gas cans and junk out front
  if (doors.hardware) placeInstanced(scene, 'gascan', [[doors.hardware.x - 1.8, doors.hardware.z + 3, 0.4, 0.9]], { collide: 'circle' });
  // a neon betel cart further up the highway
  placeInstanced(scene, 'betelstand', [[212, -64, -Math.PI / 2, 2.6], [192, 150, Math.PI / 2, 2.6]], { collide: 'box' });
  // 阿水伯's radio on the yard bench
  placeInstanced(scene, 'radio', [[P.home.x - 2.6, P.home.z + 4.2, Math.PI, 0.3, 0.46]]);
  // the Tripo Mazu temple replaces the procedural hall when it's been generated
  await loadPropModels(['temple']);
  if (hasModel('temple')) {
    const s = modelSize('temple');
    const { x, z } = P.temple;
    const W = 21, h = W / Math.max(s.x, s.z);  // fit the long side (the frontage) to 21 m
    // the front of the model faces +X in the file; turn it to face the square (+Z)
    const ry = s.x >= s.z ? 0 : -Math.PI / 2;
    placeInstanced(scene, 'temple', [[x, z - 10.5, ry, h, 0]], { collide: 'box' });
    if (court.templeHall) { court.templeHall.visible = false; setTag('hall', false); }
  }
  // 活動中心 court: hoops, exercise machines, stone drums, the judges' table and trophy
  {
    const { x, z } = P.court;
    placeInstanced(scene, 'hoop', [[x - 13.2, z - 0.5, 0, 3.3], [x + 13.2, z - 0.5, Math.PI, 3.3]], { collide: 'circle' });
    placeInstanced(scene, 'fitness', [[x - 10, z + 12, 0, 1.7], [x - 5.5, z + 12, 0.3, 1.7], [x + 1, z + 12, -0.2, 1.7]], { collide: 'box' });
    placeInstanced(scene, 'drumstool', [[x - 19, z + 6, 0.5, 0.45], [x + 12, z + 12.5, 1.1, 0.45]], { collide: 'circle' });
    placeInstanced(scene, 'judges', [[x + 18, z + 3, Math.PI, 1.05]], { collide: 'box' });
    const tr = placeInstanced(scene, 'trophy', [[x + 18.2, z + 3, 0, 0.55, 0.78]]);
    court.trophy = tr;
    placeInstanced(scene, 'speaker', [[x - 9, z - 7.5, Math.PI / 2 - 0.4, 1.1], [x + 9, z - 7.5, -Math.PI / 2 + 0.4, 1.1]], { collide: 'circle' });
    speakers.push({ x: x - 9, z: z - 7.5 }, { x: x + 9, z: z - 7.5 });
    court.speaker = { x: x - 9, z: z - 7.5 };
  }
  // chapter 2: the karaoke set in 歡樂卡拉OK, the scam call-centre desks
  await loadPropModels(['karaoke', 'calldesk']);
  if (doors.ktv) placeInstanced(scene, 'karaoke', [[doors.ktv.x, doors.ktv.z + 1.7, Math.PI / 2, 1.35]], { collide: 'box' });
  placeInstanced(scene, 'calldesk', hideout.desks.map(([x, z]) => [x, z, 0, 1.15]), { collide: 'box' });
  // Tripo text-to-3D 大榕樹 (decimated 1.84M → 14k tris) where town.js left a banyan spot
  // and the rest of the Tripo flora: 檳榔樹, 香蕉樹, 竹叢 (heights in metres before the per-tree jitter)
  const TREE_H = { banyan: 8.2, palm: 9.5, banana: 3.4, bamboo: 8 };
  for (const kind of Object.keys(TREE_H)) {
    const list = tripoTrees.filter((t) => t[0] === kind);
    placeInstanced(scene, kind, list.map(([, x, z, s]) => [x, z, (x * 7.3 + z * 3.1) % 6.28, TREE_H[kind] * s]), { shadow: kind !== 'bamboo' });
    if (kind === 'banyan') for (const [, x, z, s] of list) addCircle(x, z, 1.1 * s, heightAt(x, z) + 6);
  }
  // arcades: stools and gas cans in front of random shops
  const arc = [], arcGas = [];
  for (const [x0, x1, side] of ROWS) for (let x = x0 + 3; x < x1 - 3; x += 9 + R() * 12) { if (R() < 0.5) arc.push([x, side * 8.2, R() * 6, 0.85]); else arcGas.push([x, side * 8.6, R() * 6, 0.85]); }
  placeInstanced(scene, 'stools', arc, { collide: 'circle' });
  placeInstanced(scene, 'gascan', arcGas, { collide: 'circle' });
}
