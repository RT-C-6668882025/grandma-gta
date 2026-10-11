import test from 'node:test';
import assert from 'node:assert/strict';
import { combatActions, contextAction } from '../src/control-actions.js';
test('held attack repeats only after action finishes and release does not queue another hit',()=>{
  const held={playing:true,mounted:false,attackHeld:true};
  assert.equal(combatActions({...held,busy:false}).attack,true);
  assert.equal(combatActions({...held,busy:true}).attack,false);
  assert.equal(combatActions({...held,attackHeld:false,busy:false}).attack,false);
  assert.equal(combatActions({...held,attackPressed:true,busy:true}).attack,true);
});
test('throw wins simultaneous inputs and menus and vehicles suppress combat',()=>{
  const both={playing:true,attackPressed:true,attackHeld:true,throwPressed:true};
  assert.deepEqual(combatActions(both),{attack:false,throw:true});
  assert.deepEqual(combatActions({...both,playing:false}),{attack:false,throw:false});
  assert.deepEqual(combatActions({...both,mounted:true}),{attack:false,throw:false});
});
test('one interaction key prioritizes exit, existing interaction, then vehicle',()=>{
  assert.equal(contextAction({mounted:true,interaction:true,vehicle:true}),'exit');
  assert.equal(contextAction({interaction:true,vehicle:true}),'interact');
  assert.equal(contextAction({vehicle:true}),'enter');
  assert.equal(contextAction({} ),null);
});
