import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const src = await readFile(new URL('../src/buffalo-motion.js', import.meta.url));
const { updateBuffalo, chooseBuffaloGoal, buffaloPose } = await import('data:text/javascript;base64,' + src.toString('base64'));
const clear = (x, z) => [x, z], ground = () => 0;
const animal = () => ({ sp:'buffalo', pos:{x:0,y:0,z:0}, home:{x:0,z:0,r:9}, r:1.1, S:{speed:.55}, heading:Math.PI/2, speed:0, state:'walk', goal:[4,0], t:25 });

test('buffalo approaches a destination, slows down, then rests without overshooting', () => {
  const a = animal(); let rested = false;
  for (let i=0;i<900;i++) { updateBuffalo(a,1/60,clear,ground); if(a.state==='idle'){rested=true;break;} }
  assert.ok(rested); assert.ok(a.pos.x>3.5 && a.pos.x<4.1); assert.ok(a.speed<.2);
});
test('turning is bounded and an about-face cannot slide the buffalo backwards', () => {
  const a=animal();a.goal=[-4,0];const h=a.heading;
  updateBuffalo(a,1/60,clear,ground);
  assert.ok(Math.abs(a.heading-h)<=.65/60+1e-9);assert.equal(a.speed,0);
});
test('walk goals reject a route through a solid obstacle', () => {
  const a=animal(); const wall=(x,z)=>Math.abs(x)>1?[Math.sign(x),z]:[x,z];
  assert.equal(chooseBuffaloGoal(a,wall,()=>.25),null);
});
test('gait depends on travelled distance and becomes still at rest', () => {
  const p=buffaloPose(1,0,1), q=buffaloPose(1,20,1), idle=buffaloPose(1,20,0);
  assert.deepEqual(p.legs,q.legs);assert.ok(p.legs.some(l=>Math.abs(l.angle)>.1));
  assert.ok(idle.legs.every(l=>l.angle===0&&l.lift===0));
  assert.ok(Math.abs(p.legs[0].angle+p.legs[1].angle)<1e-12);
});
test('a buffalo yields to another buffalo directly ahead', () => {
  const a=animal(), b=animal();b.pos.x=1.8;
  for(let i=0;i<60;i++)updateBuffalo(a,1/60,clear,ground,[a,b]);
  assert.equal(a.speed,0);assert.equal(a.pos.x,0);
});
test('30 and 60 fps simulations follow the same path', () => {
  const a=animal(),b=animal();
  for(let i=0;i<180;i++)updateBuffalo(a,1/30,clear,ground);
  for(let i=0;i<360;i++)updateBuffalo(b,1/60,clear,ground);
  assert.ok(Math.abs(a.pos.x-b.pos.x)<.02);assert.ok(Math.abs(a.walkDistance-b.walkDistance)<.02);
});
