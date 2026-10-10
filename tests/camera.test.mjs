import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('../src/',import.meta.url);
let source=await readFile(new URL('camera.js',base),'utf8');
source=source.replace("'three'",JSON.stringify(new URL('../vendor/three.module.min.js',base).href))
  .replace("import { heightAt } from './world/terrain.js';",'const heightAt = () => 0;')
  .replace("import { segmentBlock } from './collide.js';",'const segmentBlock = () => globalThis.wallFraction ?? 1;');
for(const file of ['util.js','camera-modes.js']) source=source.replace("'./"+file+"'",JSON.stringify(new URL(file,base).href));
const {OrbitCam}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const THREE=await import(new URL('../vendor/three.module.min.js',base));
const make=()=>new OrbitCam(new THREE.PerspectiveCamera());
test('default third-person is close and returns from vehicle distance after exiting',()=>{
 const c=make();assert.equal(c.mode,'third');assert.equal(c.pitch,.12);assert.equal(c.want,3.5);
 c.update(1,{x:0,y:0,z:0},1.45,{vehicleDistance:6});assert.ok(c.cur>5);
 c.update(1,{x:0,y:0,z:0});assert.ok(c.cur<3.6);assert.equal(c.want,3.5);
});
test('third-person pulls inside walls; god view stays high without wall pull-in',()=>{
 globalThis.wallFraction=.1;const c=make();c.update(.1,{x:0,y:0,z:0});assert.ok(c.cur<1);
 c.setMode('god');c.update(.1,{x:0,y:0,z:0});assert.ok(c.cam.position.y>24);
 globalThis.wallFraction=1;
});
test('first-person eye looks along movement forward and ignores zoom',()=>{
 const c=make();c.setMode('first');c.input(0,0,10);c.update(.1,{x:2,y:10,z:4},1.45);
 assert.equal(c.want,0);assert.equal(c.cam.position.x,2);assert.equal(c.cam.position.y,11.363);assert.equal(c.cam.position.z,4);
 const direction=c.cam.getWorldDirection(new THREE.Vector3());const {f}=c.basis();assert.ok(direction.dot(f)>.999);
});
test('manual look delays follow; modes cycle and clamp to distinct pitch ranges',()=>{
 const c=make();c.input(40,0,0);const yaw=c.yaw;
 c.update(.5,{x:0,y:0,z:0},1.45,{heading:1,moving:true});assert.equal(c.yaw,yaw);
 c.update(2,{x:0,y:0,z:0},1.45,{heading:1,moving:true});assert.notEqual(c.yaw,yaw);
 assert.equal(c.cycleMode(),'first');c.input(0,10000,0);assert.equal(c.pitch,1.15);
 assert.equal(c.cycleMode(),'god');c.input(0,-10000,0);assert.equal(c.pitch,.8);
 assert.equal(c.cycleMode(),'third');
});
test('scripted camera override takes precedence over first-person',()=>{
 const c=make();c.setMode('first');c.override={pos:new THREE.Vector3(20,30,40),look:new THREE.Vector3()};
 c.update(1,{x:2,y:10,z:4});assert.ok(c.cam.position.x>18);
});
