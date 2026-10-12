import * as THREE from '../vendor/three.module.min.js';
// Retarget licensed source rotations in world space, preserving each native bind pose.
// The source rig is metadata only: its character mesh is never loaded or displayed.
let bankPromise;
export function loadCombatMotionBank(){
 return bankPromise ||= fetch('assets/animations/sourcecore.json').then(r=>{if(!r.ok)throw Error('动作库下载失败');return r.json();}).catch(error=>{bankPromise=null;throw error;});
}
const aliases={Hips:'hip',Spine1:'spine',Spine2:'chest',Head:'head',LeftShoulder:'lClav',RightShoulder:'rClav',LeftArm:'lArm',RightArm:'rArm',LeftForeArm:'lFore',RightForeArm:'rFore',LeftHand:'lHand',RightHand:'rHand',LeftUpLeg:'lThigh',RightUpLeg:'rThigh',LeftLeg:'lCalf',RightLeg:'rCalf',LeftFoot:'lFoot',RightFoot:'rFoot'};
export function retargetCombatClips(bank,t){
 const root=new THREE.Group(),nodes=bank.rig.map(n=>{const o=new THREE.Object3D();o.name=n.name||'';o.position.fromArray(n.translation||[0,0,0]);o.quaternion.fromArray(n.rotation||[0,0,0,1]);o.scale.fromArray(n.scale||[1,1,1]);return o;});
 bank.rig.forEach((n,i)=>(n.children||[]).forEach(j=>nodes[i].add(nodes[j])));bank.roots.forEach(i=>root.add(nodes[i]));root.updateMatrixWorld(true);t.scene.updateMatrixWorld(true);
 const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-t.yaw),inverse=rotation.clone().invert();
 const entries=Object.entries(aliases).map(([name,key])=>({source:root.getObjectByName(name),target:t.bones[t.rig[key]]})).filter(p=>p.source&&p.target);
 entries.forEach(p=>{p.sourceRest=p.source.getWorldQuaternion(new THREE.Quaternion()).invert();p.targetRest=p.target.getWorldQuaternion(new THREE.Quaternion());p.local=p.target.quaternion.clone();p.values=[];});
 const depth=o=>{let n=0;while(o.parent){n++;o=o.parent;}return n;};entries.sort((a,b)=>depth(a.target)-depth(b.target));
 const hips=root.getObjectByName('Hips'),targetHip=t.bones[t.rig.hip],start=hips.getWorldPosition(new THREE.Vector3()),base=targetHip.position.clone();
 const scale=t.hRaw/Math.max(.1,start.y*2),mixer=new THREE.AnimationMixer(root),q=new THREE.Quaternion(),parent=new THREE.Quaternion(),displacement=new THREE.Vector3(),hipValues=[];
 const out={};
 for(const data of bank.clips){
  const source=THREE.AnimationClip.parse(data),action=mixer.clipAction(source);action.setLoop(THREE.LoopOnce);action.clampWhenFinished=true;action.play();const times=[],count=Math.ceil(source.duration*30);entries.forEach(p=>p.values=[]);hipValues.length=0;
  for(let i=0;i<=count;i++){
   const time=Math.min(source.duration,i/30);times.push(time);action.time=time;mixer.update(0);root.updateMatrixWorld(true);
   for(const p of entries){p.source.getWorldQuaternion(q).multiply(p.sourceRest).premultiply(rotation).multiply(inverse).multiply(p.targetRest);p.target.parent.getWorldQuaternion(parent).invert();p.target.quaternion.copy(parent.multiply(q)).normalize();p.target.updateWorldMatrix(false,true);p.values.push(...p.target.quaternion.toArray());}
   hips.getWorldPosition(displacement).sub(start);displacement.x=displacement.z=0;displacement.multiplyScalar(scale).applyQuaternion(rotation);const inv=new THREE.Matrix4().copy(targetHip.parent.matrixWorld).invert();displacement.applyMatrix4(inv).sub(new THREE.Vector3().applyMatrix4(inv));hipValues.push(...base.clone().add(displacement).toArray());
  }
  action.stop();const tracks=entries.map(p=>new THREE.QuaternionKeyframeTrack(p.target.name+'.quaternion',times,p.values));tracks.push(new THREE.VectorKeyframeTrack(targetHip.name+'.position',times,hipValues));out[data.name]=new THREE.AnimationClip(data.name,source.duration,tracks).optimize();
  entries.forEach(p=>p.target.quaternion.copy(p.local));targetHip.position.copy(base);t.scene.updateMatrixWorld(true);
 }
 mixer.stopAllAction();mixer.uncacheRoot(root);return out;
}
// Put the authored contact pose on the gameplay damage frame without cutting recovery.
export function alignStrikeTiming(move,contactPhase){
 const source=Math.max(.05,Math.min(.95,move.hitP)),clip=move.clip.clone(),duration=clip.duration;
 for(const track of clip.tracks)for(let i=0;i<track.times.length;i++){const phase=track.times[i]/duration;track.times[i]=duration*(phase<=source?phase/source*contactPhase:contactPhase+(phase-source)/(1-source)*(1-contactPhase));}
 return {...move,clip,t0:0,t1:duration,hitP:contactPhase};
}
