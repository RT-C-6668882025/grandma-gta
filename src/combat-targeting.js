// Nearest sphere intersected by a normalized ray, clipped by world obstruction.
export function rayTarget(origin, direction, targets, limit, obstruction = limit) {
  let best = null, distance = Math.min(limit, obstruction);
  for (const target of targets) {
    if (target.hp <= 0) continue;
    const x = target.x-origin.x, y = target.y-origin.y, z = target.z-origin.z;
    const projection = x*direction.x+y*direction.y+z*direction.z;
    const perpendicular = x*x+y*y+z*z-projection*projection;
    const radius = target.radius || .7;
    if (perpendicular > radius*radius) continue;
    const half = Math.sqrt(Math.max(0, radius*radius-perpendicular));
    if (projection+half < 0) continue;
    const hit = Math.max(0, projection-half);
    if (hit < distance) { best = target; distance = hit; }
  }
  return best ? { target: best, distance } : null;
}
