import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadModel} from './model-loader.js';
const loader=new GLTFLoader(),templates=new Map();
export const COMBAT_MODELS={pistol:{path:'assets/combat/toon-pistol.glb',length:.5},rifle:{path:'assets/combat/toon-ak.glb',length:.9},tech:{path:'assets/combat/weapon_rifle.glb',length:.7},bat:{path:'assets/gear/bat.glb',length:.65}};
let assetsPromise;
export function loadCombatAssets(){return assetsPromise ||= buildCombatAssets();}
async function buildCombatAssets(){
 const modelWork=Promise.allSettled(Object.entries(COMBAT_MODELS).map(async([id,def])=>{const gltf=await loadModel(loader,def.path);const model=gltf.scene;model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const holder=new THREE.Group();holder.add(model);model.position.sub(center);holder.scale.setScalar(def.length/Math.max(size.x,size.y,size.z));holder.name='authored:'+id;templates.set(id,holder);}));
 await Promise.all([modelWork,loadModel(loader,'assets/combat/mech-george.glb').then(g=>templates.set('mech',g)).catch(e=>console.warn('Mech asset unavailable',e))]);
}
export function combatModel(id){const original=templates.get(id);if(!original)return null;const root=new THREE.Group();root.add(original.clone(true));return root;}
// A small sprite pool: no full-screen bloom, physics bodies, or per-frame allocation.
export function createCombatEffects(scene){
 const textures=['fire-explosion','smoke'].map(id=>{const texture=new THREE.TextureLoader().load('assets/combat/spell-'+id+'-atlas.png');texture.colorSpace=THREE.SRGBColorSpace;return texture;});
 const pool=textures.flatMap((texture,kind)=>Array.from({length:8},()=>{const map=texture.clone();map.repeat.set(1/6,1/6);const material=new THREE.SpriteMaterial({map,transparent:true,blending:kind?THREE.NormalBlending:THREE.AdditiveBlending,depthWrite:false});const sprite=new THREE.Sprite(material);sprite.visible=false;sprite.name='authored:impact';scene.add(sprite);return {sprite,map,kind,age:0,live:false};}));const cursors=[0,0];
 const emit=(position,size,kind)=>{const entry=pool[kind*8+cursors[kind]++%8];entry.age=0;entry.live=true;entry.sprite.position.copy(position);entry.sprite.scale.setScalar(size);entry.sprite.visible=true;};
 return {emit(position,size=.38){emit(position,size,0);emit(position,size*1.25,1);},update(dt){for(const entry of pool){if(!entry.live)continue;entry.age+=dt;const frame=Math.floor(entry.age*(entry.kind?24:30));if(frame>=36){entry.live=false;entry.sprite.visible=false;continue;}entry.map.offset.set(frame%6/6,1-(Math.floor(frame/6)+1)/6);}},clear(){for(const entry of pool){entry.live=false;entry.sprite.visible=false;}},dispose(){for(const entry of pool){scene.remove(entry.sprite);entry.sprite.material.dispose();entry.map.dispose();}textures.forEach(t=>t.dispose());}};
}

export function createMechActor(){
 const template=templates.get('mech');if(!template)return null;
 const root=new THREE.Group(),model=SkeletonUtils.clone(template.scene),mats=[];root.name='authored:mech';root.add(model);model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),height=box.max.y-box.min.y;model.scale.multiplyScalar(2.1/height);model.position.y-=box.min.y*2.1/height;
 model.traverse(o=>{if(o.isMesh){o.material=o.material.clone();mats.push(o.material);o.castShadow=true;}});
 const mixer=new THREE.AnimationMixer(model),actions=new Map(template.animations.map(c=>[c.name,mixer.clipAction(c)]));let current=null,temporary=0,dead=false;
 function play(name,once=false){const next=actions.get(name);if(!next||next===current)return;if(current)current.fadeOut(.12);next.reset().setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,Infinity);next.clampWhenFinished=once;next.fadeIn(.12).play();current=next;temporary=once?next.getClip().duration:0;}
 play('Idle');return {root,mats,gear:{},speed:0,heading:0,hurt(){if(!dead)play('HitRecieve_1',true);},fire(){if(!dead)play('Shoot',true);},knockDown(){dead=true;play('Death',true);},update(dt){root.rotation.y=this.heading;temporary=Math.max(0,temporary-dt);if(!dead&&!temporary)play(this.speed>.1?'Walk':'Idle');mixer.update(dt);},dispose(){mixer.stopAllAction();mixer.uncacheRoot(model);root.removeFromParent();}};
}
