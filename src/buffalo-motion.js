// Slow, distance-driven locomotion for the unanimated Tripo water buffalo.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function chooseBuffaloGoal(a, resolve, random = Math.random) {
  for (let i = 0; i < 16; i++) {
    const angle = random() * Math.PI * 2, radius = a.home.r * (0.3 + random() * 0.6);
    const x = a.home.x + Math.sin(angle) * radius, z = a.home.z + Math.cos(angle) * radius;
    const distance = Math.hypot(x - a.pos.x, z - a.pos.z);
    if (distance < 1.7) continue;
    let clear = true;
    const steps = Math.ceil(distance / 0.45);
    for (let s = 1; s <= steps; s++) {
      const px = a.pos.x + (x - a.pos.x) * s / steps;
      const pz = a.pos.z + (z - a.pos.z) * s / steps;
      const q = resolve(px, pz, a.r, a.pos.y);
      if (Math.hypot(q[0] - px, q[1] - pz) > 0.05) { clear = false; break; }
    }
    if (clear) return [x, z];
  }
  return null;
}

export function updateBuffalo(a, dt, resolve, heightAt, neighbours = [], random = Math.random) {
  a.motionTime = (a.motionTime || 0) + dt;
  a.t -= dt;
  if (a.state !== 'walk') a.state = 'idle';
  if (a.state === 'idle' && a.t <= 0) {
    a.goal = chooseBuffaloGoal(a, resolve, random);
    if (a.goal) { a.state = 'walk'; a.t = 28; }
    else a.t = 2 + random() * 2;
  }
  let wantSpeed = 0;
  if (a.state === 'walk' && a.goal) {
    const dx = a.goal[0] - a.pos.x, dz = a.goal[1] - a.pos.z, distance = Math.hypot(dx, dz);
    if (distance < 0.28 || a.t <= 0) { a.state = 'idle'; a.t = 2.5 + random() * 3.5; }
    else {
      const error = turn(a.heading, Math.atan2(dx, dz));
      a.heading += clamp(error, -0.65 * dt, 0.65 * dt);
      wantSpeed = a.S.speed * clamp(distance / 1.25, 0.15, 1) * Math.max(0, Math.cos(error));
      for (const n of neighbours) {
        if (n === a || n.sp !== 'buffalo') continue;
        const nx = n.pos.x - a.pos.x, nz = n.pos.z - a.pos.z;
        if (nx * Math.sin(a.heading) + nz * Math.cos(a.heading) > 0 && Math.hypot(nx, nz) < 2.3) wantSpeed = 0;
      }
    }
  }
  a.speed = mix(a.speed, wantSpeed, 2.4, dt);
  const ox = a.pos.x, oz = a.pos.z;
  const nx = ox + Math.sin(a.heading) * a.speed * dt;
  const nz = oz + Math.cos(a.heading) * a.speed * dt;
  const [x, z] = resolve(nx, nz, a.r, a.pos.y);
  a.pos.x = x; a.pos.z = z; a.pos.y = heightAt(x, z);
  const travelled = Math.hypot(x - ox, z - oz);
  // Only deliberate walking advances the gait; a collision correction is not a step.
  const distance = Math.min(travelled, a.speed * dt);
  a.walkDistance = (a.walkDistance || 0) + distance;
  a.gaitWeight = mix(a.gaitWeight || 0, clamp(distance / Math.max(dt, 1e-5) / 0.42, 0, 1), 7, dt);
  a.blockedTime = wantSpeed > 0.1 && travelled < a.speed * dt * 0.25 ? (a.blockedTime || 0) + dt : 0;
  if (a.blockedTime > 1.2) { a.state = 'idle'; a.t = 0.5; a.blockedTime = 0; }
}

export function buffaloPose(distance, time, weight) {
  const phase = distance / 0.72 * Math.PI * 2;
  return {
    legs: [0, Math.PI, Math.PI * 1.5, Math.PI * 0.5].map(offset => {
      const p = phase + offset, angle = Math.cos(p) * 0.24 * weight;
      return { angle, lift: Math.max(0, Math.sin(p)) * 0.026 * weight - 0.30 * (1 - Math.cos(angle)) };
    }),
    head: (0.025 * Math.sin(phase * 2) * weight) + (1 - weight) * (0.06 + 0.065 * Math.sin(time * 0.65)),
    tail: Math.sin(time * 1.9) * 0.23 + Math.sin(time * 0.43) * 0.07,
  };
}
