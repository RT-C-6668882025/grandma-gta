import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.min.js';
// Use the real Actor method and mixer. Loading models is covered by the browser check.
let source=await readFile(new URL('../src/actor.js',import.meta.url),'utf8');
source=source.replace(/import \{ GLTFLoader \}[^;]+;/,'const GLTFLoader = class {};')
 .replace(/import \* as SkeletonUtils[^;]+;/,'const SkeletonUtils = {};')
 .replace("'three'",JSON.stringify(new URL('../vendor/three.module.min.js',import.meta.url).href))
 .replace(/from '(\.\/[^']+)'/g,(_,path)=>'from '+JSON.stringify(new URL('../src/'+path.slice(2),import.meta.url).href));
const {Actor}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('replacing an action during fade-out unschedules the old pose',()=>{
 const object=new THREE.Object3D(),mixer=new THREE.AnimationMixer(object);
 const move=(value)=>({clip:new THREE.AnimationClip('pose'+value,1,[new THREE.NumberKeyframeTrack('.position[x]',[0,1],[0,value])]),t0:0,t1:1,dur:1});
 const a={t:{moves:{jab:move(1),kick:move(2)}},mixer,moveActs:{},cur:null};
 Actor.prototype.play.call(a,'jab');const old=a.cur.a;old.setEffectiveWeight(.81);mixer.update(.3);a.cur.done=true;
 Actor.prototype.play.call(a,'kick');
 assert.equal(old.isScheduled(),false);
 a.cur.a.setEffectiveWeight(1);mixer.update(.5);assert.equal(object.position.x,1);
});
