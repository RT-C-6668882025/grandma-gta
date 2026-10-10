// Player-only powers. Finite balances keep saves and mission arithmetic valid.
export const MONEY_FLOOR = 999999999;
export const MOD = { invincible: true, money: true, speed: true, multiplier: 4, fly: false };
try {
  const saved = JSON.parse(localStorage.getItem('ama-powers-v1') || 'null');
  for (const key of ['invincible','money','speed']) if (typeof saved?.[key] === 'boolean') MOD[key] = saved[key];
  if ([2,4,8].includes(saved?.multiplier)) MOD.multiplier = saved.multiplier;
} catch {}
export function setPower(key, value) {
  if (['invincible','money','speed','fly'].includes(key)) MOD[key] = !!value;
  else if (key === 'multiplier' && [2,4,8].includes(+value)) MOD.multiplier = +value;
  try { const { fly, ...saved } = MOD; localStorage.setItem('ama-powers-v1', JSON.stringify(saved)); } catch {}
}
export const protectedPlayer = entity => !!entity && entity.role === 'player' && MOD.invincible;
export const speedFactor = entity => entity?.role === 'player' && MOD.speed ? MOD.multiplier : 1;
export function applyPowers(player, state) {
  if (MOD.money) state.money = Math.max(MONEY_FLOOR, Number.isFinite(state.money) ? state.money : 0);
  if (!player) return;
  if (protectedPlayer(player)) { if (player.down) player.wake(); player.hp = player.maxHp; player.stamina = 100; }
  if (player.veh && protectedPlayer(player)) { player.veh.hp = player.veh.def.hp; player.veh.broken = false; }
}
export function flightPosition(pos, velocity, axis, dt, heightAt, bound) {
  const x = Math.max(-bound, Math.min(bound, pos.x + velocity.x * dt));
  const z = Math.max(-bound, Math.min(bound, pos.z + velocity.z * dt));
  const floor = heightAt(x,z);
  const y = Math.max(floor + 1, Math.min(floor + 180, pos.y + axis * 10 * (MOD.speed ? MOD.multiplier : 1) * dt));
  return { x, y, z };
}
