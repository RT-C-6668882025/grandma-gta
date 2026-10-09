// 2.5D collision: static circles and oriented boxes on the ground plane,
// each with a top height. Actors are circles pushed out of them.
// Also used to keep the camera out of walls.

const CELL = 16;
const grid = new Map();
const all = [];
const key = (i, j) => i * 73856093 ^ j * 19349663;

function insert(c) {
  all.push(c);
  const r = c.bound;
  const i0 = Math.floor((c.x - r) / CELL), i1 = Math.floor((c.x + r) / CELL);
  const j0 = Math.floor((c.z - r) / CELL), j1 = Math.floor((c.z + r) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = key(i, j);
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(c);
  }
  return c;
}

// box: centre x,z, half extents hw (local x), hd (local z), rotation rot (radians about y), top y
export function addBox(x, z, hw, hd, rot = 0, top = 99, tag = null) {
  return insert({ t: 1, x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), top, bound: Math.hypot(hw, hd), on: true, tag });
}
export function addCircle(x, z, r, top = 99, tag = null) {
  return insert({ t: 0, x, z, r, top, bound: r, on: true, tag });
}
export function clearTag(tag) {
  for (const c of all) if (c.tag === tag) c.on = false;
}
export function setTag(tag, on) {
  for (const c of all) if (c.tag === tag) c.on = on;
}

// walkable surfaces above the terrain (bridge deck, pier): rect + height function
const surfaces = [];
export function addSurface(x0, z0, x1, z1, yFn) { surfaces.push({ x0, z0, x1, z1, yFn }); }
export function surfaceAt(x, z) {
  let y = -Infinity;
  for (const s of surfaces) if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) y = Math.max(y, s.yFn(x, z));
  return y;
}

function nearby(x, z, r, fn) {
  const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
  const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
  const seen = nearby.seen || (nearby.seen = new Set());
  seen.clear();
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = grid.get(key(i, j));
    if (!a) continue;
    for (const c of a) if (c.on && !seen.has(c)) { seen.add(c); fn(c); }
  }
}

// push a circle (x,z,r) at foot height y out of colliders; returns [x,z]
export function resolve(x, z, r, y = 0) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    nearby(x, z, r + 2, (c) => {
      if (y > c.top - 0.3) return;
      if (c.t === 0) {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-6) { x = c.x + (dx / d) * m; z = c.z + (dz / d) * m; moved = true; }
      } else {
        // to box local
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        const px = Math.max(-c.hw, Math.min(c.hw, lx)), pz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ox = lx - px, oz = lz - pz;
        let d = Math.hypot(ox, oz);
        if (d < r) {
          let nx, nz;
          if (d > 1e-6) { nx = ox / d; nz = oz / d; }
          else {
            // centre inside the box: leave along the shallowest face
            const ex = c.hw - Math.abs(lx), ez = c.hd - Math.abs(lz);
            if (ex < ez) { nx = Math.sign(lx) || 1; nz = 0; d = -ex; } else { nx = 0; nz = Math.sign(lz) || 1; d = -ez; }
          }
          const push = r - d;
          const wx = nx * c.c + nz * c.s, wz = -nx * c.s + nz * c.c;
          x += wx * push; z += wz * push; moved = true;
        }
      }
    });
    if (!moved) break;
  }
  return [x, z];
}

// does the segment (a -> b) at height y pass through a collider? returns t in [0,1] of first hit or 1
export function segmentBlock(ax, ay, az, bx, by, bz) {
  let best = 1;
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    let hit = false;
    nearby(x, z, 0.5, (c) => {
      if (hit || y > c.top) return;
      if (c.t === 0) { if (Math.hypot(x - c.x, z - c.z) < c.r + 0.2) hit = true; }
      else {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) < c.hw + 0.2 && Math.abs(lz) < c.hd + 0.2) hit = true;
      }
    });
    if (hit) { best = (s - 1) / steps; break; }
  }
  return best;
}

export function colliderCount() { return all.length; }
