import test from 'node:test';
import assert from 'node:assert/strict';
import { MOD, MONEY_FLOOR, setPower, protectedPlayer, speedFactor, applyPowers, flightPosition } from '../src/mods.js';
test('powers protect and accelerate only the player', () => {
  setPower('invincible', true); setPower('speed', true); setPower('multiplier', 8);
  assert.equal(protectedPlayer({role:'player'}), true);
  assert.equal(protectedPlayer({role:'npc'}), false);
  assert.equal(speedFactor({role:'player'}), 8);
  assert.equal(speedFactor({role:'npc'}), 1);
  setPower('speed', false); assert.equal(speedFactor({role:'player'}), 1);
});
test('invincibility restores player and current vehicle; switches disable restoration', () => {
  const p={role:'player',down:true,hp:0,maxHp:100,stamina:0,wake(){this.down=false;},veh:{hp:0,broken:true,def:{hp:200}}};
  const state={money:NaN}; setPower('money',true); setPower('invincible',true); applyPowers(p,state);
  assert.equal(p.down,false); assert.equal(p.hp,100); assert.equal(p.stamina,100);
  assert.equal(p.veh.hp,200); assert.equal(p.veh.broken,false); assert.equal(state.money,MONEY_FLOOR);
  setPower('money',false); setPower('invincible',false); p.hp=12; state.money=3; applyPowers(p,state);
  assert.equal(p.hp,12); assert.equal(state.money,3);
});
test('flight clamps world bounds, terrain floor and maximum altitude', () => {
  setPower('speed',false);
  assert.deepEqual(flightPosition({x:9,y:10,z:-9},{x:10,z:-10},1,1,()=>5,10),{x:10,y:20,z:-10});
  assert.equal(flightPosition({x:0,y:0,z:0},{x:0,z:0},-1,1,()=>5,10).y,6);
  assert.equal(flightPosition({x:0,y:500,z:0},{x:0,z:0},1,1,()=>5,10).y,185);
});
