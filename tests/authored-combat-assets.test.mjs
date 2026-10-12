import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.min.js';
import {retargetCombatClips,alignStrikeTiming} from '../src/authored-combat-motion.js';
const bank=JSON.parse(await readFile(new URL('../assets/animations/sourcecore.json',import.meta.url),'utf8'));
test('combat assets match provenance and binary models have no external dependencies',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../assets/combat-provenance.json',import.meta.url),'utf8'));
 for(const entry of manifest.assets){const data=await readFile(new URL('../'+entry.path,import.meta.url));assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256);if(!entry.path.endsWith('.glb'))continue;assert.equal(data.readUInt32LE(0),0x46546c67);assert.equal(data.readUInt32LE(8),data.length);const gltf=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)));assert.ok(gltf.buffers.every(b=>!b.uri));assert.ok((gltf.images||[]).every(b=>!b.uri));}
});
test('authored combat retarget keeps native bind transforms and produces finite bound tracks',()=>{
 const nodes=bank.rig.map(n=>{const o=new THREE.Bone();o.name=n.name||'';o.position.fromArray(n.translation||[0,0,0]);o.quaternion.fromArray(n.rotation||[0,0,0,1]);o.scale.fromArray(n.scale||[1,1,1]);return o;});bank.rig.forEach((n,i)=>(n.children||[]).forEach(j=>nodes[i].add(nodes[j])));const scene=new THREE.Group();bank.roots.forEach(i=>scene.add(nodes[i]));scene.rotation.y=.7;scene.updateMatrixWorld(true);
 const names={hip:'Hips',spine:'Spine1',chest:'Spine2',head:'Head',lClav:'LeftShoulder',rClav:'RightShoulder',lArm:'LeftArm',rArm:'RightArm',lFore:'LeftForeArm',rFore:'RightForeArm',lHand:'LeftHand',rHand:'RightHand',lThigh:'LeftUpLeg',rThigh:'RightUpLeg',lCalf:'LeftLeg',rCalf:'RightLeg',lFoot:'LeftFoot',rFoot:'RightFoot'};
 const bones=Object.fromEntries(nodes.map(b=>[b.name,b])),before=nodes.map(b=>JSON.stringify([b.position.toArray(),b.quaternion.toArray(),b.scale.toArray()]));const clips=retargetCombatClips(bank,{scene,bones,rig:names,hRaw:1.8,yaw:-.7});assert.equal(Object.keys(clips).length,5);
 nodes.forEach((b,i)=>assert.equal(JSON.stringify([b.position.toArray(),b.quaternion.toArray(),b.scale.toArray()]),before[i]));
 for(const clip of Object.values(clips)){assert.ok(clip.duration>0);for(const track of clip.tracks){assert.ok(bones[track.name.split('.')[0]]);assert.ok([...track.values].every(Number.isFinite));if(track.name.endsWith('.quaternion'))for(let i=0;i<track.values.length;i+=4)assert.ok(Math.abs(Math.hypot(...track.values.slice(i,i+4))-1)<1e-5);}}
});

test('contact retiming matches windup while keeping ordered keys and full recovery',()=>{
 const clip=new THREE.AnimationClip('strike',1,[new THREE.NumberKeyframeTrack('.position[x]',[0,.7,1],[0,1,0])]);const move={clip,t0:0,t1:1,hitP:.7,dur:.5};const result=alignStrikeTiming(move,.36);assert.ok(Math.abs(result.clip.tracks[0].times[1]-.36)<1e-6);assert.equal(result.clip.tracks[0].times[2],1);assert.equal(result.hitP,.36);assert.ok(Math.abs(clip.tracks[0].times[1]-.7)<1e-6);
});
