import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/law.js', import.meta.url));
const { createLawSystem } = await import('data:text/javascript;base64,' + source.toString('base64'));
const actor = (role, x = 0) => ({ role, pos: { x, z: 0 }, state: 'idle', down: false, target: null });

test('a nearby officer targets the NPC aggressor, not the innocent player', () => {
  const law = createLawSystem(), p = actor('player'), cop = actor('cop', 4), thug = actor('thug', 2);
  law.recordHit(p, thug); law.tick(.1, [p, cop, thug], p, 0);
  assert.equal(cop.target, thug); assert.equal(cop.state, 'fight'); assert.equal(law.isOffender(p), false);
});
test('NPC-on-NPC assault is attributable to the actual attacker', () => {
  const law = createLawSystem(), victim = actor('ped'), attacker = actor('ped', 1), cop = actor('cop', 3);
  law.recordHit(victim, attacker); law.tick(.1, [victim, attacker, cop], null);
  assert.equal(cop.target, attacker); assert.equal(law.isOffender(victim), false);
});
test('civilian self-defence against the player does not create an NPC incident', () => {
  const law = createLawSystem(), p = actor('player'), npc = actor('ped');
  law.recordHit(npc, p); assert.equal(law.recordHit(p, npc), false); assert.equal(law.isOffender(npc), false);
});
test('police intervention is not itself an offence, and resistance is attributed to the NPC', () => {
  const law = createLawSystem(), p = actor('player'), cop = actor('cop'), thug = actor('thug');
  law.recordHit(p, thug); law.recordHit(thug, cop); law.recordHit(cop, thug);
  assert.equal(law.isOffender(cop), false); assert.equal(law.isOffender(thug), true);
});
test('the existing player wanted level still causes a pursuit', () => {
  const law = createLawSystem(), p = actor('player', 3), cop = actor('cop');
  law.tick(.1, [p, cop], p, 1); assert.equal(cop.target, p);
  law.tick(.1, [p, cop], p, 0); assert.equal(cop.target, null);
});
test('a much closer active NPC offender takes precedence over a distant wanted player', () => {
  const law = createLawSystem(), p = actor('player', 30), cop = actor('cop'), npc = actor('thug', 3);
  cop.target = p; cop.state = 'fight'; law.recordHit(p, npc); law.tick(.1, [p, cop, npc], p, 2);
  assert.equal(cop.target, npc);
});
test('a knocked-out offender is not attacked and does not remain a stale target', () => {
  const law = createLawSystem(), p = actor('player'), cop = actor('cop'), npc = actor('thug');
  law.recordHit(p, npc); law.tick(.1, [p, cop, npc], p); npc.down = true;
  law.tick(.1, [p, cop, npc], p); assert.equal(cop.target, null); assert.equal(law.isOffender(npc), false);
});
test('removed NPCs and incidents no longer in sight are cleared', () => {
  const law = createLawSystem(), p = actor('player'), cop = actor('cop'), npc = actor('thug');
  law.recordHit(p, npc); law.tick(.1, [p, cop], p); assert.equal(law.isOffender(npc), false);
  npc.pos.x = 80; law.recordHit(p, npc); law.tick(31, [p, cop, npc], p);
  assert.equal(cop.target, null); assert.equal(law.isOffender(npc), false);
});
test('an observed pursuit keeps its incident alive', () => {
  const law = createLawSystem(), p = actor('player'), cop = actor('cop'), npc = actor('thug', 4);
  law.recordHit(p, npc); for (let i = 0; i < 45; i++) law.tick(1, [p, cop, npc], p);
  assert.equal(cop.target, npc); assert.equal(law.isOffender(npc), true);
});
test('traffic injury belongs to the NPC driver', () => {
  const law = createLawSystem(), p = actor('player'), driver = actor('driver', 2), cop = actor('cop', 3);
  law.recordHit(p, driver, 'runOver'); law.tick(.1, [p, driver, cop], p);
  assert.equal(cop.target, driver); assert.equal(law.isOffender(p), false);
});
test('a character model or thug label alone is not proof of wrongdoing', () => {
  const law = createLawSystem(), innocent = actor('thug'), attacker = actor('ped'), cop = actor('cop');
  law.tick(.1, [innocent, cop], null); assert.equal(cop.target, null);
  law.recordHit(innocent, attacker); law.tick(.1, [innocent, attacker, cop], null); assert.equal(cop.target, attacker);
});
test('scripted truce pauses dispatch; starting a new game clears incidents', () => {
  const law = createLawSystem(), p = actor('player'), npc = actor('thug'), cop = actor('cop');
  law.recordHit(p, npc); law.tick(.1, [p, npc, cop], p, 0, true); assert.equal(cop.target, null);
  law.reset(); law.tick(.1, [p, npc, cop], p); assert.equal(cop.target, null);
});
test('intervention feedback is emitted once per newly assigned target', () => {
  const law = createLawSystem(), p = actor('player'), npc = actor('thug'), cop = actor('cop');
  law.recordHit(p, npc);
  assert.equal(law.tick(.1, [p, npc, cop], p).length, 1);
  assert.equal(law.tick(.1, [p, npc, cop], p).length, 0);
});
test('dispatched reinforcements retain their target outside initial notice range', () => {
  const law = createLawSystem(), p = actor('player', 48), cop = actor('cop');
  cop.state = 'fight'; cop.target = p;
  law.tick(.1, [p, cop], p, 2); assert.equal(cop.target, p);
  p.pos.x = 65; law.tick(.1, [p, cop], p, 2); assert.equal(cop.target, null);
});
