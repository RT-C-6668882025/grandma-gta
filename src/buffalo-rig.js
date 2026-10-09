import * as THREE from 'three';
import { buffaloPose } from './buffalo-motion.js';

// Lightweight runtime skinning keeps the original Tripo mesh and texture intact.
// Coordinates are in this asset's local units (front is +Z; height is 0.624).
export function rigBuffalo(model) {
  const rigs = [], meshes = [];
  model.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const body = new THREE.Bone(), bones = [body], legs = [];
    for (const [x, z] of [[-0.073, 0.13], [0.073, 0.13], [-0.073, -0.25], [0.073, -0.25]]) {
      const leg = new THREE.Bone(); leg.position.set(x, 0.30, z); body.add(leg); legs.push(leg); bones.push(leg);
    }
    const head = new THREE.Bone(); head.position.set(0, 0.4, 0.26); body.add(head); bones.push(head);
    const tail = new THREE.Bone(); tail.position.set(0, 0.46, -0.32); body.add(tail); bones.push(tail);
    const geometry = mesh.geometry.clone(), pos = geometry.attributes.position;
    const indices = new Uint16Array(pos.count * 4), weights = new Float32Array(pos.count * 4);
    const smooth = (lo, hi, v) => { const t = THREE.MathUtils.clamp((v - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let bone = 0, w = 0;
      if (z < -0.335) { bone = 6; w = 1 - smooth(-0.46, -0.335, z); }
      else if (y < 0.34 && Math.abs(x) > 0.027) { bone = 1 + (x > 0 ? 1 : 0) + (z < -0.07 ? 2 : 0); w = 1 - smooth(0.22, 0.34, y); }
      else if (z > 0.23) { bone = 5; w = smooth(0.23, 0.37, z); }
      indices[i * 4] = 0; indices[i * 4 + 1] = bone;
      weights[i * 4] = 1 - w; weights[i * 4 + 1] = w;
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const skin = new THREE.SkinnedMesh(geometry, mesh.material);
    skin.name = mesh.name; skin.position.copy(mesh.position); skin.quaternion.copy(mesh.quaternion); skin.scale.copy(mesh.scale);
    skin.castShadow = true; skin.receiveShadow = mesh.receiveShadow;
    // The small mesh has a bounded deformation; avoid a per-frame CPU skinned bounding box.
    skin.frustumCulled = false;
    mesh.parent.add(skin); mesh.removeFromParent(); skin.add(body); skin.updateMatrixWorld(true);
    skin.bind(new THREE.Skeleton(bones)); rigs.push({ legs, head, tail });
  }
  return (distance, time, weight) => {
    const p = buffaloPose(distance, time, weight);
    for (const r of rigs) {
      r.legs.forEach((leg, i) => { leg.rotation.x = p.legs[i].angle; leg.position.y = 0.30 + p.legs[i].lift; });
      r.head.rotation.x = p.head; r.tail.rotation.z = p.tail;
    }
  };
}
