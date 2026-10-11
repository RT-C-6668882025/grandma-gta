import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const module=async file=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../src/'+file,import.meta.url),'utf8')).toString('base64'));
const AI=await module('combat-ai.js'),M=await module('combat-mission.js'),I=await module('combat-intents.js'),C=await module('combat-core.js');
const observe=(extra={})=>({player:{x:0,z:5},visible:true,distance:5,facing:1,patrol:{x:0,z:0},cover:{x:2,z:0},flank:{x:-4,z:3},...extra});
function guardSteps(b,n,observation){const events=[];for(let i=0;i<n;i++){const r=AI.stepGuard(b,observation,.1);b=r.brain;events.push(...r.events);}return {b,events};}
test('guards need actual view and time to detect; crouching delays detection',()=>{
 const initial=AI.createGuardBrain('a');assert.equal(guardSteps(initial,10,observe({visible:false})).b.mode,'patrol');
 assert.equal(guardSteps(initial,10,observe({facing:-1})).b.mode,'patrol');
 assert.equal(guardSteps(initial,6,observe()).b.mode,'combat');assert.notEqual(guardSteps(initial,6,observe({crouched:true})).b.mode,'combat');
 assert.equal(initial.suspicion,0);
});
test('lost targets are searched at last observed location, never at hidden player position',()=>{
 const seen=guardSteps(AI.createGuardBrain('a'),6,observe()).b;
 const hidden=guardSteps(seen,40,observe({visible:false,player:{x:90,z:90}})).b;
 assert.equal(hidden.mode,'search');assert.deepEqual(hidden.lastKnown,{x:0,z:5});
 assert.equal(guardSteps(hidden,100,observe({visible:false})).b.mode,'patrol');
});
test('gunfire alerts through hearing, quiet actions do not alert a distant guard',()=>{
 assert.equal(guardSteps(AI.createGuardBrain('a'),1,observe({visible:false,noise:{x:4,z:5,radius:20,loud:true}})).b.mode,'combat');
 assert.equal(guardSteps(AI.createGuardBrain('a'),1,observe({visible:false,distance:30,noise:{x:4,z:5,radius:5,loud:false}})).b.mode,'patrol');
});
test('weapon jamming cancels windup; shots remember the aimed location',()=>{
 const brain={...AI.createGuardBrain('a'),mode:'combat',suspicion:1,cooldown:0};
 const winding=AI.stepGuard(brain,observe(),.1).brain;assert.ok(winding.windup);
 const fired=guardSteps(winding,6,observe({player:{x:9,z:9}}));assert.deepEqual(fired.events.find(e=>e.type==='fire').at,{x:0,z:5});
 assert.equal(guardSteps(winding,10,observe({disabled:true})).events.some(e=>e.type==='fire'),false);
});
test('flank role chooses side route; bounded navigation goes around an obstacle',()=>{
 const r=AI.stepGuard({...AI.createGuardBrain('a','flank'),suspicion:1},observe(),.1);assert.deepEqual(r.destination,{x:-4,z:3});
 const bounds={minX:0,maxX:8,minZ:0,maxZ:8};const blocked=(a,b)=>((a.x===4||b.x===4)&&(a.z<6||b.z<6));
 const route=AI.encounterRoute({x:0,z:0},{x:8,z:0},bounds,blocked);assert.ok(route.some(p=>p.z>=6));
 for(let i=1;i<route.length;i++)assert.equal(blocked(route[i-1],route[i]),false);
 assert.deepEqual(AI.encounterRoute({x:0,z:0},{x:8,z:0},bounds,()=>true),[]);
});
test('retrieval requires authorization, then extraction; route reflects actual actions',()=>{
 let m=M.createEncounterMission();m=M.stepEncounterMission(m,'extract',{atExit:true});assert.equal(m.phase,'infiltrate');
 m=M.stepEncounterMission(m,'retrieve');assert.equal(m.phase,'infiltrate');
 m=M.stepEncounterMission(m,'retrieve',{authorized:true});assert.equal(m.phase,'extract');
 m=M.stepEncounterMission(m,'extract',{atExit:true});assert.equal(m.phase,'complete');assert.equal(m.route,'无声潜入');
 for(const [action,route] of [['shot','强攻'],['hack','入侵'],['takedown','潜行处置']]){
 let n=M.stepEncounterMission(M.createEncounterMission(),action);n=M.stepEncounterMission(n,'retrieve',{authorized:true});n=M.stepEncounterMission(n,'extract',{atExit:true});assert.equal(n.route,route);}
 const failed=M.stepEncounterMission(M.createEncounterMission(),null,{dead:true});assert.equal(M.stepEncounterMission(failed,'retrieve',{authorized:true}).phase,'failed');
});
test('upgrade points cannot be duplicated or spent before earning; progress normalizes saves',()=>{
 const p=M.normalizeCombatProgress({xp:100,clears:1,perks:[]});const r=M.installCombatPerk(p,'nimble');assert.equal(r.installed,true);assert.equal(M.skillPoints(r.progress),0);assert.deepEqual(p.perks,[]);
 assert.equal(M.installCombatPerk(r.progress,'nimble').installed,false);assert.equal(M.installCombatPerk(r.progress,'marksman').installed,false);
 assert.deepEqual(M.normalizeCombatProgress({xp:NaN,clears:-1,perks:['nimble','nimble','evil']}),{version:1,xp:0,clears:0,perks:['nimble']});
});
test('tap melee fires on release, long hold fires one heavy; toggles reset at menus',()=>{
 let s=I.createCombatInput(),r=I.combatIntents(s,{attackHeld:true},'melee',.1);assert.equal(r.intents.melee,false);
 r=I.combatIntents(r.state,{attackHeld:false},'melee',.1);assert.equal(r.intents.melee,true);
 s=I.createCombatInput();let heavy=0;for(let i=0;i<10;i++){r=I.combatIntents(s,{attackHeld:true},'melee',.1);s=r.state;heavy+=Number(r.intents.heavy);}assert.equal(heavy,1);
 assert.equal(I.combatIntents(s,{},'melee',.1).intents.melee,false);
 s=I.combatIntents(s,{scanPressed:true,crouchPressed:true},'gun',.1).state;assert.equal(s.scan,true);assert.equal(s.crouch,true);assert.equal(I.combatIntents(s,{reset:true},'gun',.1).state.scan,false);
});
test('front blocks spend stamina, perfect timing cancels damage and rear attacks bypass',()=>{
 const s=C.stepCombat({...C.createCombatState(),weapon:'melee'},{block:true}).state;
 const perfect=C.guardDamage(s,10,true);assert.equal(perfect.damage,0);assert.equal(perfect.state.stamina,90);assert.equal(s.stamina,100);
 assert.equal(C.guardDamage({...s,clock:1},10,true).damage,3);assert.equal(C.guardDamage(s,10,false).damage,10);assert.equal(C.guardDamage({...s,stamina:2},10,true).damage,10);
});
test('installed perks change costs while sprint spends the same core stamina pool',()=>{
 const p=C.createCombatState();assert.equal(C.stepCombat(p,{dodge:true},{perks:['nimble']}).state.stamina,82);
 assert.equal(C.stepCombat(p,{scan:true,hack:true},{perks:['efficientHack'],hackTarget:{id:'a',valid:true}}).state.ram,8);
 assert.ok(C.stepCombat(p,{}, {sprinting:true},.1).state.stamina<100);
});
