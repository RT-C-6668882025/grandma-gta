import test from 'node:test';
import assert from 'node:assert/strict';
import { stepLocomotion, groundSpeed, gaitRate } from '../src/player-locomotion.js';
test('start and release converge across phone frame rates', () => {
  for (const hz of [20, 30, 60, 120]) {
    let p = {heading:0,vx:0,vz:0};
    for(let i=0;i<hz;i++) p=stepLocomotion(p.heading,p.vx,p.vz,0,1,2.5,1/hz);
    assert.ok(Math.abs(p.vz-2.5)<0.002);
    for(let i=0;i<hz/2;i++) p=stepLocomotion(p.heading,p.vx,p.vz,0,0,0,1/hz);
    assert.equal(p.vz,0);
  }
});
test('reverse brakes first and then faces the requested direction',()=>{
  let p=stepLocomotion(0,0,4.6,0,-1,4.6,1/60);
  assert.ok(p.vz<4.6 && p.vz>0);
  for(let i=0;i<60;i++) p=stepLocomotion(p.heading,p.vx,p.vz,0,-1,4.6,1/60);
  assert.ok(p.vz < -4.5); assert.ok(Math.abs(p.vx)<0.02);
});
test('collision and teleport cannot manufacture walking speed',()=>{
  assert.equal(groundSpeed(0,0,1/60,4.6),0);
  assert.equal(groundSpeed(100,0,1/60,2.5),2.5);
  assert.equal(groundSpeed(0,0,0,0),0);
  assert.equal(groundSpeed(.03,.04,.02,4),2.5);
});
test('blended playback matches measured travel and stops at a wall',()=>{
  const w={walk:.5,swagger:0,run:.5}, refs={walk:1.2,swagger:1.3,run:3.6};
  const rate=gaitRate(3,w,refs);
  assert.ok(Math.abs(rate*2.4-3)<1e-8);
  assert.equal(gaitRate(0,w,refs),0);
  assert.equal(gaitRate(100,w,refs),4);
});
