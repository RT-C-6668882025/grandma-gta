import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/combat-core.js', import.meta.url), 'utf8');
const { createCombatState: fresh, stepCombat: step } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
function advance(state, n, context = {}, intents = {}) {
  const events = []; for (let i = 0; i < n; i++) { const r = step(state, intents, context, .1); state = r.state; events.push(...r.events); }
  return { state, events };
}
test('shot spends one round, obeys cadence, and does not mutate input', () => {
  const s = fresh(), r = step(s, { aim: true, fire: true });
  assert.equal(s.ammo, 12); assert.equal(r.state.ammo, 11); assert.equal(r.events[0].aiming, true);
  assert.equal(step(r.state, { fire: true }, {}, .1).events.length, 0);
  const next = advance(r.state, 2).state;
  assert.equal(step(next, { fire: true }).state.ammo, 10);
});
test('reload conserves ammo and interrupts without a delayed refill', () => {
  const s = { ...fresh(), ammo: 2, reserve: 5 };
  const loading = step(s, { reload: true, fire: true }).state;
  assert.equal(loading.ammo, 2);
  const done = advance(loading, 14); assert.equal(done.state.ammo, 7); assert.equal(done.state.reserve, 0);
  assert.equal(done.events.filter(e => e.type === 'reloaded').length, 1);
  const dodge = step(loading, { dodge: true }).state;
  assert.equal(advance(dodge, 20).state.ammo, 2);
});
test('melee contact occurs exactly once after windup; interrupt prevents contact', () => {
  const s = step(fresh(), { weapon: 'melee', melee: true }).state;
  const r = advance(s, 10); assert.equal(r.events.filter(e => e.type === 'meleeContact').length, 1);
  assert.equal(advance(step(s, { dodge: true }).state, 10).events.some(e => e.type === 'meleeContact'), false);
  assert.equal(step({ ...fresh(), weapon: 'melee', stamina: 0 }, { heavy: true }).state.mode, 'ready');
});
test('blocking prevents attacks until released', () => {
  const s = step(fresh(), { weapon: 'melee', block: true, melee: true }).state;
  assert.equal(s.mode, 'blocking'); assert.equal(step(s, { block: true, melee: true }).events.length, 0);
  assert.equal(step(s, { melee: true }).state.mode, 'meleeWindup');
});
test('hack consumes RAM once and requires the same valid world target throughout cast', () => {
  const c = { hackTarget: { id: 'camera:1', valid: true } };
  const r = step(fresh(), { scan: true, hack: true, fire: true }, c);
  assert.equal(r.state.ram, 7); assert.equal(r.state.ammo, 12);
  const done = advance(r.state, 6, c); assert.equal(done.events.filter(e => e.type === 'hackApply').length, 1);
  assert.equal(step(done.state, { scan: true, hack: true }, c).state.mode, 'ready');
  const cancelled = advance(r.state, 10, { hackTarget: { id: 'camera:2', valid: true } });
  assert.equal(cancelled.events.some(e => e.type === 'hackApply'), false);
  assert.equal(cancelled.events.filter(e => e.type === 'hackCancelled').length, 1);
});
test('death, menus, mount and reset clear transient state without completing pending effects', () => {
  const s = step({ ...fresh(), ammo: 0 }, { reload: true }).state;
  for (const context of [{ dead: true }, { blocked: true }, { mounted: true }, { reset: true }]) {
    const r = step(s, { aim: true, fire: true }, context, .1);
    assert.equal(r.state.action, null); assert.equal(r.state.aiming, false); assert.equal(r.state.ammo, 0); assert.equal(r.events.length, 0);
  }
  const dead = step(s, {}, { dead: true }).state;
  assert.equal(step(dead, { fire: true }).state.mode, 'ready');
});
test('stun cancels cast and invalid/long frame deltas never fast-forward an action', () => {
  const c = { hackTarget: { id: 'drone', valid: true } };
  const s = step(fresh(), { scan: true, hack: true }, c).state;
  assert.equal(step(s, {}, c, Infinity).state.clock, s.clock);
  assert.equal(step(s, {}, c, 30).state.mode, 'hacking');
  const stunned = step(s, {}, { stunned: true }).state;
  assert.equal(stunned.mode, 'stunned'); assert.equal(advance(stunned, 10, c).events.some(e => e.type === 'hackApply'), false);
});
