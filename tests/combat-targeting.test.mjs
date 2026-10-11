import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/combat-targeting.js',import.meta.url),'utf8');
const {rayTarget}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const collisionSource=await readFile(new URL('../src/collide.js',import.meta.url),'utf8');
const {addBox,segmentBlock,clearTag}=await import('data:text/javascript;base64,'+Buffer.from(collisionSource).toString('base64'));
const origin={x:0,y:1,z:0},dir={x:0,y:0,z:-1};
const target=(id,z)=>({id,x:0,y:1,z,radius:.7,hp:10});
test('nearest live target wins regardless of list order; cover stops shots',()=>{
 const near=target('near',-4),far=target('far',-8);
 assert.equal(rayTarget(origin,dir,[far,near],45).target.id,'near');
 assert.equal(rayTarget(origin,dir,[near],45,3),null);
 near.hp=0;assert.equal(rayTarget(origin,dir,[near,far],45).target.id,'far');
});
test('targets behind, off axis and beyond range cannot be hit',()=>{
 assert.equal(rayTarget(origin,dir,[target('behind',4)],45),null);
 assert.equal(rayTarget(origin,dir,[{...target('side',-4),x:2}],45),null);
 assert.equal(rayTarget(origin,dir,[target('distant',-50)],45),null);
});
test('real world collider blocks fire; a side route clears the same target',()=>{
 addBox(0,-2,1,.3,0,2,'test-cover');
 const obstruction=10*segmentBlock(0,1,0,0,1,-10);
 assert.equal(rayTarget(origin,dir,[target('covered',-4)],10,obstruction),null);
 assert.equal(segmentBlock(2,1,0,2,1,-4),1);
 assert.equal(rayTarget({x:2,y:1,z:0},dir,[{...target('side',-4),x:2}],10).target.id,'side');
 clearTag('test-cover');assert.equal(segmentBlock(0,1,0,0,1,-10),1);
});
