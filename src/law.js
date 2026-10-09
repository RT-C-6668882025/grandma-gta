// Live incidents belong to the actual aggressor, independently of the player's heat.
export function createLawSystem({ noticeRadius = 38, incidentSeconds = 30 } = {}) {
  const incidents = new Map();
  let recentHits = new WeakMap(), time = 0;
  const distance = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

  function recordHit(victim, attacker, kind = 'assault') {
    if (!attacker || attacker === victim) return false;
    const prior = recentHits.get(attacker);
    const defending = kind === 'assault' && prior?.by === victim && prior.until > time &&
      victim.role !== 'cop' && !attacker.hostile && attacker.role !== 'thug';
    recentHits.set(victim, { by: attacker, until: time + 8 });
    if (attacker.role === 'player' || attacker.role === 'cop' || defending) return false;
    // Fighting a known aggressor is defence; attacking an innocent is an incident.
    if (kind === 'assault' && victim.role !== 'cop' &&
      ((victim.hostile && victim.state === 'fight' && victim.target === attacker) || incidents.has(victim))) return false;
    incidents.set(attacker, { victim, kind, until: time + incidentSeconds });
    return true;
  }

  function tick(dt, entities, player, wanted = 0, truce = false) {
    if (truce) return [];
    const dispatches = [];
    time += dt;
    const present = new Set(entities);
    for (const [offender, incident] of incidents) {
      if (!present.has(offender) || offender.down || incident.until <= time) incidents.delete(offender);
    }
    for (const cop of entities) {
      if (cop.role !== 'cop' || cop.down) continue;
      const candidates = [...incidents.keys()];
      if (wanted > 0 && player && !player.down && present.has(player)) candidates.push(player);
      let target = null, best = Infinity;
      for (const candidate of candidates) {
        const d = distance(cop, candidate);
        const continuing = candidate === cop.target && cop.state === 'fight';
        if (d > (continuing ? noticeRadius + 22 : noticeRadius)) continue;
        // Keep a nearby pursuit stable without ignoring a much closer offence.
        const score = d * (candidate === cop.target ? 0.75 : 1);
        if (score < best) { best = score; target = candidate; }
      }
      if (target) {
        if (cop.target !== target || cop.state !== 'fight') dispatches.push({ cop, target });
        cop.state = 'fight'; cop.target = target;
        const incident = incidents.get(target);
        if (incident) incident.until = Math.max(incident.until, time + 10);
      } else if (cop.state === 'fight') {
        cop.state = 'idle'; cop.target = null; cop.lastHitBy = null; cop.stateT = 2;
      }
    }
    return dispatches;
  }

  function reset() { incidents.clear(); recentHits = new WeakMap(); time = 0; }
  return { recordHit, tick, reset, isOffender: (entity) => incidents.has(entity) };
}
