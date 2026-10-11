// Ground locomotion only. Vehicle, flight and authored dive motion stay separate.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function stepLocomotion(heading, vx, vz, x, z, speed, dt) {
  if (!(dt > 0)) return { heading, vx, vz };
  const moving = Math.hypot(x, z) > 0.1 && speed > 0;
  let targetSpeed = 0;
  if (moving) {
    const error = Math.atan2(Math.sin(Math.atan2(x, z) - heading), Math.cos(Math.atan2(x, z) - heading));
    heading += error * (1 - Math.exp(-10 * dt));
    // Brake before reversing; do not propel the character away from the input.
    targetSpeed = speed * Math.max(0, Math.cos(error));
  }
  const k = targetSpeed < Math.hypot(vx, vz) ? 18 : 8;
  const blend = 1 - Math.exp(-k * dt);
  vx += (Math.sin(heading) * targetSpeed - vx) * blend;
  vz += (Math.cos(heading) * targetSpeed - vz) * blend;
  if (!moving && Math.hypot(vx, vz) < 0.025) vx = vz = 0;
  return { heading, vx, vz };
}
export function groundSpeed(dx, dz, dt, velocity) {
  // Collision corrections / teleports must not cause an animation speed spike.
  return dt > 0 ? Math.min(Math.hypot(dx, dz) / dt, velocity) : 0;
}
export function gaitRate(speed, weights, refs) {
  const total = weights.walk + weights.swagger + weights.run;
  if (total < 0.001 || speed < 0.025) return 0;
  const reference = (weights.walk * refs.walk + weights.swagger * refs.swagger + weights.run * refs.run) / total;
  return clamp(speed / Math.max(0.1, reference), 0, 4);
}
