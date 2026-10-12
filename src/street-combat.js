import * as THREE from 'three';
import {createCombatState,stepCombat,COMBAT_RULES} from './combat-core.js';
import {loadCombatAssets,combatModel,createCombatEffects} from './combat-assets.js';
import {shotSolution} from './third-person-aim.js';
import {rayTarget} from './combat-targeting.js';
import {segmentBlock,resolve} from './collide.js';
import {heightAt} from './world/terrain.js';
export function createStreetCombat({scene,camera,getPlayer,getOrbit,getEntities,log,injure,wanted,toast,sound,canUse,getAmmo,setAmmo}){
 let active=false,ready=false,state=createCombatState(),saved=null,clock=0,heatAt=-100,recoil=0,empty=false,crouch=false;const noticed=new Set(),guards=new Map(),effects=createCombatEffects(scene);
 const flash=new THREE.Mesh(new THREE.SphereGeometry(.06,6,4),new THREE.MeshBasicMaterial({color:0xffdf93}));flash.visible=false;scene.add(flash);
 const hud=document.createElement('div');hud.id='streetCombatHUD';hud.hidden=true;hud.className='street-combat-hud';hud.innerHTML='<span class="combat-crosshair">＋</span><div class="combat-readout"></div><div class="combat-target"></div>';document.body.append(hud);
 loadCombatAssets().then(()=>ready=!!combatModel('pistol'));
 const block=(a,b)=>segmentBlock(a.x,a.y,a.z,b.x,b.y,b.z),line=(a,b)=>block(a,b)===1;
 function stop(){if(!active)return;const p=getPlayer(),o=getOrbit();active=false;hud.hidden=true;flash.visible=false;effects.clear();p.actor.shooting=null;p.actor.crouch=0;p.actor.crouchBlend=0;if(!p.down)p.actor.getUp();p.actor.wear('weapon',saved.weapon);p.actor.wear('bag',saved.bag);o.setMode(saved.mode);o.pitch=saved.pitch;o.want=saved.want;o.cur=saved.cur;camera.fov=saved.fov;camera.updateProjectionMatrix();noticed.clear();log('收枪，恢复日常操作');}
 function toggle(){if(active){stop();return true;}const p=getPlayer(),o=getOrbit();if(!p||p.down||p.veh||p.actor.busy||!canUse())return false;if(!ready){toast('枪械正在加载');return false;}
 saved={weapon:p.actor.gear.weapon?.obj||null,bag:p.actor.gear.bag?.obj||null,mode:o.mode,pitch:o.pitch,want:o.want,cur:o.cur,fov:camera.fov};const gun=combatModel('pistol');gun.children[0].rotation.y=Math.PI/2;p.actor.wear('weapon',gun);p.actor.wear('bag',null);o.setMode('third');const ammo=getAmmo();state=createCombatState();state.ammo=Number.isInteger(ammo?.ammo)&&ammo.ammo>=0&&ammo.ammo<=12?ammo.ammo:12;state.reserve=Number.isInteger(ammo?.reserve)&&ammo.reserve>=0&&ammo.reserve<=120?ammo.reserve:48;active=true;empty=false;crouch=false;log('在小镇拔枪');return true;}
 function update(dt,raw,playing){
 dt=Math.max(0,Math.min(.1,dt||0));if(playing)clock+=dt;const p=getPlayer(),o=getOrbit();
 // Armed guards remain armed after the player holsters; surrender is not a heat reset.
 for(const [n,entry] of guards){if(!getEntities().includes(n)||n.down||n.state!=='fight'||n.target!==p){n.streetRanged=false;n.actor.shooting=null;n.actor.wear('weapon',entry.weapon);guards.delete(n);continue;}const at=new THREE.Vector3(p.pos.x,p.pos.y+1,p.pos.z),from=new THREE.Vector3(n.pos.x,n.pos.y+1.1,n.pos.z),dir=at.clone().sub(from).normalize();n.actor.shooting={direction:dir,aiming:true,length:.4};n.actor.heading=n.heading=Math.atan2(dir.x,dir.z);n.actor.update(0);
 if(playing&&canUse()&&clock>=entry.fireAt&&from.distanceTo(at)<25&&line(from,at)){entry.fireAt=clock+1.2;const muzzle=n.actor.gunMuzzle||from;if(line(muzzle,at)){const hit=p.takeHit(n,7,{kind:'streetSecurity',knock:0});sound('bonk');log(n.name+(hit?' 开火反击，阿嬤受到 7 点伤害':' 开火反击，未造成伤害（无敌或保护状态）'));effects.emit(at,.22);}}}
 if(ready&&playing)for(const n of getEntities())if(n.role==='cop'&&!n.down&&n.state==='fight'&&n.target===p&&!guards.has(n)){const gun=combatModel('rifle');gun.children[0].rotation.y=Math.PI/2;guards.set(n,{weapon:n.actor.gear.weapon?.obj||null,fireAt:clock+1});n.actor.wear('weapon',gun);n.streetRanged=true;log(n.name+' 持枪介入追捕');}
 effects.update(playing?dt:0);
 if(!active)return;if(!p||p.down||p.veh||!canUse()){stop();return;}if(!playing){hud.hidden=true;return;}hud.hidden=false;
 if(raw.holster){stop();return;}if(raw.crouchPressed)crouch=!crouch;p.actor.crouch=crouch;
 if(state.mode!=='dodging'&&p.actor.moving!=='combatDodge')p.heading=p.actor.heading=Math.atan2(-Math.sin(o.yaw),-Math.cos(o.yaw));p.actor.root.position.copy(p.pos);
 p.actor.shooting={direction:new THREE.Vector3(-Math.sin(o.yaw)*Math.cos(o.pitch),-Math.sin(o.pitch),-Math.cos(o.yaw)*Math.cos(o.pitch)),aiming:raw.aimHeld,reload:state.mode==='reloading'?1-state.action.remaining/COMBAT_RULES.reloadTime:0,recoil:recoil/.08,length:.3};p.actor.update(0);o.update(0,p.pos,crouch?.95:1.45,{combat:true,aiming:state.aiming});
 const origin=camera.position.clone(),direction=camera.getWorldDirection(new THREE.Vector3()),muzzle=p.actor.gunMuzzle||new THREE.Vector3(p.pos.x,p.pos.y+1,p.pos.z);
 const targets=getEntities().filter(n=>n!==p&&!n.down&&!n.veh).map(n=>({id:n.name,x:n.pos.x,y:n.pos.y+1,z:n.pos.z,radius:.55,hp:n.hp,entity:n}));
 const shot=shotSolution(origin,direction,muzzle,targets,rayTarget,block);const result=stepCombat(state,{fire:raw.attackHeld||raw.attackPressed,aim:raw.aimHeld,reload:raw.reloadPressed,dodge:raw.dodgePressed},{},dt);state=result.state;
 for(const action of result.events){
  if(action.type==='dodge'){const dx=-Math.sin(o.yaw),dz=-Math.cos(o.yaw);for(let i=0;i<12;i++){const [x,z]=resolve(p.pos.x+dx*.12,p.pos.z+dz*.12,p.r,p.pos.y);p.pos.set(x,heightAt(x,z),z);}p.actor.play('combatDodge',{dur:.3});log('街头闪避');}
  else if(action.type==='shot'){
   recoil=.08;o.pitch=Math.max(-1.45,o.pitch-.016);sound('bonk');log('街头开火 · 剩余弹药 '+state.ammo);
   const witness=getEntities().some(n=>n!==p&&!n.down&&n.distTo(p)<32);if(witness&&clock-heatAt>3){heatAt=clock;wanted(1,'街头枪声');log('枪声被听见，安保警戒上升');}
   const victim=shot.hit?.target?.entity;if(victim){const before=victim.hp;if(victim.takeHit(p,24,{kind:'streetGun',knock:.1})){effects.emit(new THREE.Vector3(victim.pos.x,victim.pos.y+1,victim.pos.z));injure(victim,before-Math.max(0,victim.hp));log('射中 '+victim.name+' · 剩余 '+Math.max(0,victim.hp)+' HP');}}
   else if(shot.blocked)effects.emit(new THREE.Vector3(shot.impact.x,shot.impact.y,shot.impact.z),.2);
  }else if(action.type==='reloadStarted')log('街头换弹开始');else if(action.type==='reloaded'){empty=false;sound('click');log('街头换弹完成 · '+state.ammo+'/'+state.reserve);}else if(action.type==='empty'&&!empty){empty=true;toast('弹匣已空 · R换弹，菜单可购买弹药');}
 }
 if(result.events.length)setAmmo({ammo:state.ammo,reserve:state.reserve});
 recoil=Math.max(0,recoil-dt);flash.visible=recoil>0;if(flash.visible)flash.position.copy(muzzle);
 const eye={x:p.pos.x,y:p.pos.y+1,z:p.pos.z};
 for(const n of getEntities()){if(n===p||n.down||n.veh||n.role!=='ped'||n.talk||noticed.has(n)||n.distTo(p)>15||!line(eye,{x:n.pos.x,y:n.pos.y+1,z:n.pos.z}))continue;noticed.add(n);n.state='flee';n.fleeFrom=p;n.fleeT=10;log(n.name+' 察觉枪械，逃离并暂停工作');}
 hud.querySelector('.combat-readout').textContent='街头持枪 · '+state.ammo+'/'+state.reserve+(state.mode==='reloading'?' · 换弹中':' · E互动 · 1/2收枪');hud.querySelector('.combat-target').textContent=shot.blocked?'枪口被遮挡':shot.hit?.target?.id||'左键射击 · 右键瞄准 · R换弹';hud.querySelector('.combat-crosshair').style.color=shot.blocked?'#ffac80':'';
 }
 return {toggle,stop,update,get active(){return active;},get state(){return state;},addAmmo(){if(state.reserve>96)return false;state.reserve+=24;setAmmo({ammo:state.ammo,reserve:state.reserve});return true;},get scanning(){return false;},get crouched(){return crouch;}};
}
