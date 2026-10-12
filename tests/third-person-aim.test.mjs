import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {shotSolution} from '../src/third-person-aim.js';
const source=await readFile(new URL('../src/combat-targeting.js',import.meta.url),'utf8');const {rayTarget}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const target={id:'guard',x:0,y:1,z:-10,radius:.7,hp:100},camera={x:.5,y:1,z:3},muzzle={x:.2,y:1,z:0},length=Math.hypot(.5,13),direction={x:-.5/length,y:0,z:-13/length};
test('shoulder reticle and muzzle converge on the same target',()=>{const s=shotSolution(camera,direction,muzzle,[target],rayTarget,()=>1);assert.equal(s.hit.target.id,'guard');assert.equal(s.blocked,false);});
test('seeing a target from the shoulder cannot shoot through muzzle cover',()=>{const s=shotSolution(camera,direction,muzzle,[target],rayTarget,a=>a===muzzle?.1:1);assert.equal(s.hit,null);assert.equal(s.blocked,true);});
test('camera obstruction does not select targets behind walls',()=>{const s=shotSolution(camera,direction,muzzle,[target],rayTarget,()=>.1);assert.equal(s.hit,null);assert.ok(Object.values(s.direction).every(Number.isFinite));});
