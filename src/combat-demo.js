import {makeWear} from './gear.js';
import {regionAt} from './city-regions.js';
import {loadCombatAssets,combatModel,createCombatEffects,createMechActor} from './combat-assets.js';
import {Actor,hasKind} from './actor.js';
import * as THREE from 'three';
import {COMBAT_RULES,createCombatState,stepCombat,guardDamage} from './combat-core.js';
import {rayTarget} from './combat-targeting.js';
import {createGuardBrain,stepGuard,encounterRoute} from './combat-ai.js';
import {createEncounterMission,stepEncounterMission,normalizeCombatProgress,installCombatPerk,skillPoints} from './combat-mission.js';
import {createCombatInput,combatIntents} from './combat-intents.js';
import {segmentBlock,addBox,clearTag,resolve} from './collide.js';

const BOUNDS={minX:-15,maxX:15,minZ:162,maxZ:204};
const EXIT={x:0,z:202};
const PERKS=[['marksman','精准增幅','射击伤害 +25%'],['efficientHack','算力优化','破解消耗 3 → 2'],['nimble','运动义体','闪避体力 25 → 18']];
export function createCombatDemo({scene,camera,ground:baseGround,getPlayer,getOrbit,log,toast,getProgress,setProgress,reward=()=>0,sound=()=>{},saveProgress=()=>{},blips=[]}) {
  const group=new THREE.Group();group.name='source-core-encounter';group.visible=false;scene.add(group);
  const view=new THREE.Group();camera.add(view);scene.add(camera);view.visible=false;
  const material=color=>new THREE.MeshStandardMaterial({color,roughness:.45});
  const mesh=(geometry,color,parent,x,y,z)=>{const m=new THREE.Mesh(geometry,material(color));m.position.set(x,y,z);parent.add(m);return m;};
  const gun=new THREE.Group();view.add(gun);
  let assetReady=false,weaponName='源核手枪',weaponSkin=null,handWeapon=null,handBat=null,handMode=null;
  const assetLoad=loadCombatAssets().then(()=>{const bat=combatModel('bat');if(bat){bat.position.set(.3,-.28,-.65);bat.rotation.x=.7;blade.add(bat);}assetReady=!!combatModel('pistol');});
  const effects=createCombatEffects(scene);
  const blade=new THREE.Group();view.add(blade);
  const flash=new THREE.Mesh(new THREE.SphereGeometry(.09,6,4),new THREE.MeshBasicMaterial({color:0xffd778}));flash.position.set(.23,-.18,-.9);flash.visible=false;gun.add(flash);
  const hud=document.createElement('div');hud.id='combatDemoHUD';hud.hidden=true;
  hud.innerHTML='<span class="combat-crosshair">＋</span><span class="combat-hitmark">×</span><div class="combat-readout"></div><div class="combat-objective"></div><div class="combat-target"></div><div class="combat-upgrades" hidden></div><div class="combat-damage"></div>';
  document.body.append(hud);
  let active=false,state=createCombatState(),inputState=createCombatInput(),mission=createEncounterMission(),targets=[],devices=[],covers=[],saved=null;
  const ground=(x,z)=>baseGround(x,z)+(active?.35:0);
  let flashTime=0,hitTime=0,hurtTime=0,noise=null,radio=null,trace=0,access=false,claimed=false,cameraSuspicion=0,elapsed=0;
  let cameraTriggered=false,emptyNotified=false;
  let fallbackProgress=normalizeCombatProgress();
  const progress=()=>normalizeCombatProgress(getProgress?.()||fallbackProgress);
  const persist=p=>{fallbackProgress=p;setProgress?.(p);};
  const origin=new THREE.Vector3(),direction=new THREE.Vector3();
  const eye=()=>inputState.crouch?.95:1.45;
  function aim(){const p=getPlayer(),o=getOrbit();origin.set(p.pos.x,p.pos.y+eye()*.94,p.pos.z);direction.set(-Math.sin(o.yaw)*Math.cos(o.pitch),-Math.sin(o.pitch),-Math.cos(o.yaw)*Math.cos(o.pitch));}
  function obstruction(range){const end=origin.clone().addScaledVector(direction,range);return range*segmentBlock(origin.x,origin.y,origin.z,end.x,end.y,end.z);}
  const visible=(a,b)=>segmentBlock(a.x,a.y,a.z,b.x,b.y,b.z)===1;
  function selected(){aim();return rayTarget(origin,direction,[...targets,...devices],35,obstruction(35))?.target;}
  function missionAction(action,extra={}){mission=stepEncounterMission(mission,action,extra,0);}
  function noiseAt(radius,loud){const p=getPlayer();noise={x:p.pos.x,z:p.pos.z,radius,loud,left:.3};}
  function hit(t,amount,quiet=false){
    if(t.hp<=0)return;const dealt=Math.min(t.hp,amount);t.hp=Math.max(0,t.hp-amount);log('命中安保：伤害 '+dealt+'，剩余 '+t.hp+' HP',{target:t.id,damage:dealt,quiet});t.flash=.18;hitTime=.18;sound('hit');
    if(!quiet)t.hit=true;
    t.actor.hurt();effects.emit(new THREE.Vector3(t.x,t.y,t.z),quiet?.2:.4);
    if(!t.hp){t.actor.knockDown();t.brain.mode='down';t.beam.visible=false;log('守卫失去行动能力',{target:t.id,quiet});}
  }
  function disposeStage(){for(const t of targets){t.actor.dispose();t.actor.mats.forEach(m=>m.dispose());}clearTag('combat-demo');group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});group.clear();targets=[];devices=[];covers=[];}
  function stop(){
    if(!active)return;const p=getPlayer(),o=getOrbit();active=false;group.visible=false;view.visible=false;hud.hidden=true;document.body.classList.remove('combat-active');
    effects.clear();disposeStage();for(let i=blips.length-1;i>=0;i--)if(blips[i].combatMarker)blips.splice(i,1);
    p.queued=false;if(p.actor.cur){p.actor.cur.a.stop();p.actor.cur=null;}
    p.pos.copy(saved.pos);p.heading=saved.heading;p.vel.set(0,0,0);p.hp=saved.hp;p.down=false;p.stamina=saved.stamina;p.walkMode=saved.walkMode;p.combatCrouch=false;p.combatFloorOffset=0;p.actor.getUp();p.actor.wear('weapon',saved.weapon);handWeapon=handBat=null;handMode=null;p.actor.root.visible=true;
    o.setMode(saved.mode);o.yaw=saved.yaw;o.pitch=saved.pitch;camera.fov=58;camera.updateProjectionMatrix();
    log('离开源核据点',{result:mission.phase,route:mission.route});saveProgress();toast('已返回原位置');
  }
  function objectBox(x,z,w,h,d,color,collides=true){const y=ground(x,z);const root=mesh(new THREE.BoxGeometry(w,h,d),color,group,x,y+h/2,z);if(collides)addBox(x,z,w/2,d/2,0,y+h,'combat-demo');return root;}
  function start(){
    if(active){stop();return;}
    const p=getPlayer(),o=getOrbit();if(!p||p.veh||p.down||o.override||p.actor.busy){toast('请先结束当前动作并下车');return false;}
    const region=regionAt(p.pos.x,p.pos.z).id,kind=region==='dongbu'?'rifle':region==='chengwan'?'tech':'pistol';if(weaponSkin)gun.remove(weaponSkin);weaponSkin=combatModel(kind)||combatModel('pistol');if(weaponSkin){weaponSkin.position.set(.24,-.23,-.62);weaponSkin.rotation.y=kind==='tech'?Math.PI:-Math.PI/2;gun.add(weaponSkin);}weaponName=kind==='rifle'?'东埠试验枪':kind==='tech'?'澄湾能量枪':'榆庭制式枪';
    saved={weapon:p.actor.gear.weapon?.obj||null,pos:p.pos.clone(),heading:p.heading,hp:p.hp,stamina:p.stamina,walkMode:p.walkMode,mode:o.mode,yaw:o.yaw,pitch:o.pitch};p.walkMode=false;handWeapon=combatModel(kind)||combatModel('pistol');if(handWeapon)handWeapon.rotation.y=kind==='tech'?0:Math.PI/2;handBat=makeWear('bat',p.actor.t.attach.weapon);handMode=null;
    state=createCombatState();inputState=createCombatInput();mission=createEncounterMission();flashTime=hitTime=hurtTime=elapsed=trace=cameraSuspicion=0;noise=radio=null;access=claimed=cameraTriggered=emptyNotified=false;
    if(!assetReady){assetLoad.then(()=>toast('战斗资源已就绪，请再次进入'));toast('正在载入战斗资源');return false;}
    if(!hasKind('thug2')){toast('守卫模型尚未就绪，请稍后再试');return false;}
    active=true;p.hp=p.maxHp;p.combatFloorOffset=.35;p.queued=false;group.visible=true;hud.hidden=false;document.body.classList.add('combat-active');
    p.pos.set(EXIT.x,ground(EXIT.x,EXIT.z),EXIT.z);p.vel.set(0,0,0);o.setMode('first');o.yaw=0;o.pitch=0;
    const floorGeometry=new THREE.PlaneGeometry(32,44,16,22);floorGeometry.rotateX(-Math.PI/2);
    const floorPositions=floorGeometry.attributes.position;
    for(let i=0;i<floorPositions.count;i++)floorPositions.setY(i,ground(floorPositions.getX(i),floorPositions.getZ(i)+182)+.04);
    floorGeometry.computeVertexNormals();mesh(floorGeometry,0x626967,group,0,0,182);
    objectBox(-16,182,1,2.8,44,0xd1c8b8);objectBox(16,182,1,2.8,44,0xd1c8b8);objectBox(0,160,32,3,1,0xd1c8b8);
    // Three staggered obstacles leave a main corridor and two flank paths.
    for(const [x,z,w] of [[-6,192,5],[6,184,5],[0,176,4]]){
      objectBox(x,z,w,1.8,2,0x758f8c);
      covers.push({x,z:z-2,peek:{x:x+w/2+1,z:z-1},width:w});
      mesh(new THREE.BoxGeometry(w-.3,.12,1.7),0xb7c9b4,group,x,ground(x,z)+1.9,z);
    }
    for(const x of [-12,12]){objectBox(x,166,2,.7,3,0xc3b79e);mesh(new THREE.SphereGeometry(.85,8,6),0x527459,group,x,ground(x,166)+1.4,166);}
    const locations=[[-8,185,'cover'],[8,177,'flank'],[0,169,'cover']];
    for(const [i,[x,z,role]] of locations.entries()){
      const y=ground(x,z),actor=(i===2?createMechActor():null)||new Actor('thug2'),root=actor.root;const rifle=combatModel('rifle');if(rifle&&actor.wear){rifle.rotation.y=Math.PI/2;actor.wear('weapon',rifle);}root.position.set(x,y,z);group.add(root);
      const beam=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xff795b}));beam.visible=false;group.add(beam);
      targets.push({id:'guard:'+i,x,y:y+1.1,z,radius:.75,hp:85,root,actor,beam,beamTime:0,flash:0,disabled:0,brain:createGuardBrain('guard:'+i,role),heading:0,home:{x,z},path:[],pathTimer:0,hit:false});
    }
    for(const [id,x,z,color] of [['relay',10,198,0x579dbc],['camera',-12,179,0xd7aa64],['terminal',0,164,0x8bb9a1]]){
      const y=ground(x,z)+.9,root=mesh(new THREE.BoxGeometry(.9,1.8,.8),color,group,x,y,z);
      devices.push({id,x,y,z,radius:.9,hp:1,root,disabled:0});
    }
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.3,1.6,24),new THREE.MeshBasicMaterial({color:0x8acbbd,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(0,ground(0,202)+.2,202);group.add(ring);
    blips.push({x:0,z:202,label:'源核据点 · 撤离点',color:'#8acbbd',icon:'↩',combatMarker:true},{x:0,z:164,label:'源核据点 · 芯片终端',color:'#ffda9b',icon:'◆',combatMarker:true},{x:10,z:198,label:'源核据点 · 中继器',color:'#579dbc',icon:'◇',combatMarker:true});
    hud.querySelector('.combat-upgrades').hidden=true;
    log('进入源核据点：取回芯片并撤离；可强攻、潜入或破解');toast('取回芯片 → 回到入口撤离 · Ctrl潜行 · Q扫描 · E处置/操作 · 3切换武器');return true;
  }
  function drawUpgrades(){
    const p=progress(),root=hud.querySelector('.combat-upgrades');root.hidden=false;root.innerHTML=`<b>义体升级 · 可用点数 ${skillPoints(p)}</b>`+PERKS.map(([id,name,desc])=>`<button data-perk="${id}" ${p.perks.includes(id)||!skillPoints(p)?'disabled':''}>${name}<small>${p.perks.includes(id)?'已安装':desc}</small></button>`).join('');
    root.querySelectorAll('[data-perk]').forEach(button=>button.onclick=()=>{const r=installCombatPerk(progress(),button.dataset.perk);if(r.installed){persist(r.progress);log('安装义体：'+PERKS.find(v=>v[0]===button.dataset.perk)[1]);drawUpgrades();}});
  }
  function complete(){
    if(claimed)return;claimed=true;const p=progress(),first=p.clears===0;p.clears++;p.xp+=100;persist(p);
    const cash=first?reward():0;log('源核据点完成',{route:mission.route,xp:100,cash,alarm:mission.alarm});toast(`据点完成 · ${mission.route} · +100 经验${cash?' · NT$'+cash:''}`);drawUpgrades();
  }
  function advanceGuard(t,dt,p){
    t.flash=Math.max(0,t.flash-dt);t.disabled=Math.max(0,t.disabled-dt);t.beamTime=Math.max(0,t.beamTime-dt);t.beam.visible=t.beamTime>0;
    t.actor.speed=0;if(!t.hp){t.actor.update(dt);return;}
    const dx=p.pos.x-t.x,dz=p.pos.z-t.z,distance=Math.hypot(dx,dz);
    const sight=visible({x:t.x,y:t.y+.4,z:t.z},{x:p.pos.x,y:p.pos.y+eye()*.8,z:p.pos.z});
    const cover=covers.map(c=>({...c,distance:Math.hypot(c.x-t.x,c.z-t.z)})).sort((a,b)=>a.distance-b.distance)[0];
    const playerPoint={x:p.pos.x,z:p.pos.z};
    const observation={player:playerPoint,visible:sight,distance,facing:(Math.sin(t.heading)*dx+Math.cos(t.heading)*dz)/(distance||1),crouched:inputState.crouch,
      hit:t.hit,noise,alarm:radio,disabled:t.disabled>0,patrol:{x:t.home.x,z:t.home.z+Math.sin(t.brain.clock*.3)*2},
      cover:cover&&{x:cover.x,z:cover.z},peek:cover?.peek,atCover:cover?.distance<1.5,
      flank:{x:t.brain.id.endsWith('1')?12:-12,z:Math.max(166,Math.min(200,(t.brain.lastKnown?.z||p.pos.z)-3))}};
    const r=stepGuard(t.brain,observation,dt);t.brain=r.brain;t.hit=false;
    for(const e of r.events){
      if(e.type==='mode'&&e.to==='combat'){
        missionAction(null,{alert:true});log('安保进入战斗状态',{target:t.id});
        if(!devices.find(d=>d.id==='relay').disabled)radio={...t.brain.lastKnown,left:.2};
      }
      if(e.type==='windup'){/* Timing feedback stays in the HUD and attack beam. */}
      if(e.type==='fire'){t.actor.fire?.();
        const a=new THREE.Vector3(t.x,t.y+.1,t.z),b=new THREE.Vector3(e.at.x,ground(e.at.x,e.at.z)+.9,e.at.z);
        const dir=b.clone().sub(a).normalize(),range=a.distanceTo(b)+2;
        t.beam.geometry.setFromPoints([a,b]);t.beamTime=.12;t.beam.visible=true;sound('bonk');
        const end=a.clone().addScaledVector(dir,range),block=range*segmentBlock(a.x,a.y,a.z,end.x,end.y,end.z);
        if(rayTarget(a,dir,[{id:'player',x:p.pos.x,y:p.pos.y+(inputState.crouch?.6:1),z:p.pos.z,radius:.5,hp:p.hp}],range,block)){
          const frontal=(-Math.sin(getOrbit().yaw)*dx-Math.cos(getOrbit().yaw)*dz)/(distance||1)<-.4;
          const defended=guardDamage(state,7,frontal);state=defended.state;
          if(defended.damage){
            p.takeHit(null,defended.damage,{kind:'encounter'});hurtTime=.25;
            if(state.mode==='hacking'){state=stepCombat(state,{}, {stunned:true},0).state;log('快速破解被攻击打断');}
          }
          else if(defended.perfect){hitTime=.12;sound('hit');}
        }
      }
    }

    const dest=r.destination;let walking=false;t.actor.speed=0;
    if(dest){
      t.pathTimer-=dt;if(t.pathTimer<=0){t.pathTimer=.8;t.path=encounterRoute(t,dest,BOUNDS,(a,b)=>segmentBlock(a.x,ground(a.x,a.z)+.4,a.z,b.x,ground(b.x,b.z)+.4,b.z)<1);}
      while(t.path.length&&Math.hypot(t.path[0].x-t.x,t.path[0].z-t.z)<.45)t.path.shift();
      const next=t.path[0];if(next){const mx=next.x-t.x,mz=next.z-t.z,len=Math.hypot(mx,mz)||1,speed=t.brain.mode==='patrol'?1:2.2;
        let [x,z]=resolve(t.x+mx/len*speed*dt,t.z+mz/len*speed*dt,.5,ground(t.x,t.z));
        for(const other of targets){if(other===t||!other.hp)continue;const sx=x-other.x,sz=z-other.z,space=Math.hypot(sx,sz);if(space<1&&space>.001){x=other.x+sx/space;z=other.z+sz/space;}}
        [x,z]=resolve(x,z,.5,ground(x,z));const actualSpeed=Math.hypot(x-t.x,z-t.z)/Math.max(dt,.001);walking=Math.hypot(x-t.x,z-t.z)>.002;t.x=x;t.z=z;t.y=ground(x,z)+1.1;
        t.root.position.set(x,ground(x,z),z);t.actor.speed=actualSpeed;
        if(t.brain.mode==='patrol')t.heading=Math.atan2(mx,mz);
      }
    }

    if(t.brain.lastKnown&&t.brain.mode!=='patrol')t.heading=Math.atan2(t.brain.lastKnown.x-t.x,t.brain.lastKnown.z-t.z);
    t.actor.heading=t.heading;t.actor.update(dt);
  }
  function update(dt,raw,playing,move){
    if(!active)return;const p=getPlayer(),o=getOrbit();
    if(p.down){mission=stepEncounterMission(mission,null,{dead:true});log('源核据点失败：失去行动能力');stop();return;}
    dt=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
    if(!playing){inputState=createCombatInput();state=stepCombat(state,{}, {blocked:true},0).state;view.visible=false;hud.hidden=true;return;}
    elapsed+=dt;
    const converted=combatIntents(inputState,raw,state.weapon,dt);inputState=converted.state;
    let input=converted.intents;
    if(raw.swapPressed)input.weapon=state.weapon==='gun'?'melee':'gun';
    p.combatCrouch=inputState.crouch;
    p.pos.x=Math.max(BOUNDS.minX,Math.min(BOUNDS.maxX,p.pos.x));p.pos.z=Math.max(BOUNDS.minZ,Math.min(BOUNDS.maxZ,p.pos.z));p.pos.y=ground(p.pos.x,p.pos.z);
    const picked=selected();
    // Context interactions have range and orientation checks; never use the old civilian target picker.
    if(raw.interactPressed&&!inputState.scan&&state.mode==='ready'){
      const terminal=devices.find(d=>d.id==='terminal');
      if(mission.phase==='infiltrate'&&Math.hypot(p.pos.x-terminal.x,p.pos.z-terminal.z)<2.5&&visible(origin,terminal)){
        missionAction('retrieve',{authorized:true});log('取回源核芯片：实体终端访问');toast('芯片已取得 · 返回入口撤离');
      }else{
        const victim=targets.find(t=>t.hp>0&&Math.hypot(t.x-p.pos.x,t.z-p.pos.z)<2.2&&t.brain.mode!=='combat'&&
          (Math.sin(t.heading)*(p.pos.x-t.x)+Math.cos(t.heading)*(p.pos.z-t.z))<-.5&&visible(origin,t));
        if(victim&&inputState.crouch){hit(victim,100,true);missionAction('takedown');log('从背后制服守卫',{target:victim.id});}
      }
    }
    const hackValid=!!picked&&Math.hypot(picked.x-p.pos.x,picked.z-p.pos.z)<18&&
      (picked.id!=='terminal'||mission.phase==='infiltrate'&&(access||targets.every(t=>!t.hp)));
    const result=stepCombat(state,input,{sprinting:!!raw.sprint&&!inputState.crouch&&Math.hypot(move.x,move.z)>.2,perks:progress().perks,hackTarget:{id:picked?.id,valid:hackValid&&(inputState.scan||state.mode!=='hacking')}},dt);
    state=result.state;p.stamina=state.stamina;
    for(const e of result.events){
      if(e.type==='shot'){
        p.heading=Math.atan2(-Math.sin(o.yaw),-Math.cos(o.yaw));p.actor.heading=p.heading;log('开火 · '+weaponName+' · 剩余弹药 '+state.ammo,{ammo:state.ammo});flashTime=.055;o.pitch=Math.max(-1.5,o.pitch-.016);sound('bonk');noiseAt(32,true);missionAction('shot');
        if(picked?.brain){
          const impact=rayTarget(origin,direction,[picked],35,obstruction(35));
          const headshot=impact&&origin.y+direction.y*impact.distance>picked.y+.4;
          hit(picked,Math.round((progress().perks.includes('marksman')?30:24)*(headshot?1.6:1)));
        }
      }else if(e.type==='empty'){if(!emptyNotified){toast('弹匣已空 · 按 R 或点击换弹');emptyNotified=true;}}else if(e.type==='reloadStarted'){log('开始换弹');
      }else if(e.type==='meleeStarted'){log(e.heavy?'发动重击':'发动近战攻击');
        p.heading=Math.atan2(-Math.sin(o.yaw),-Math.cos(o.yaw));p.actor.play(p.actor.has(e.heavy?'combatHeavy':'combatLight')?(e.heavy?'combatHeavy':'combatLight'):(e.heavy?'kick':'jab'),{dur:e.heavy?1:.5});sound('whoosh');
      }else if(e.type==='meleeContact'){
        aim();const victim=targets.filter(t=>t.hp>0&&Math.hypot(t.x-p.pos.x,t.z-p.pos.z)<2.4&&visible(origin,t)&&
          (direction.x*(t.x-p.pos.x)+direction.z*(t.z-p.pos.z))>.3).sort((a,b)=>Math.hypot(a.x-p.pos.x,a.z-p.pos.z)-Math.hypot(b.x-p.pos.x,b.z-p.pos.z))[0];
        if(victim){hit(victim,e.heavy?45:24);noiseAt(9,false);}
      }else if(e.type==='dodge'){log('闪避：打断当前动作');
        const len=Math.hypot(move.x,move.z),dx=len?move.x/len:-Math.sin(o.yaw),dz=len?move.z/len:-Math.cos(o.yaw);p.heading=Math.atan2(dx,dz);p.actor.heading=p.heading;
        for(let i=0;i<12;i++){const [x,z]=resolve(p.pos.x+dx*.12,p.pos.z+dz*.12,p.r,p.pos.y);p.pos.x=Math.max(BOUNDS.minX,Math.min(BOUNDS.maxX,x));p.pos.z=Math.max(BOUNDS.minZ,Math.min(BOUNDS.maxZ,z));}p.pos.y=ground(p.pos.x,p.pos.z);if(p.actor.has('combatDodge'))p.actor.play('combatDodge',{dur:COMBAT_RULES.dodgeTime});sound('whoosh');
      }else if(e.type==='hackStarted'){if(p.actor.has('combatHack'))p.actor.play('combatHack',{dur:COMBAT_RULES.hackTime});trace=Math.min(1,trace+.25);log('开始快速破解',{target:e.target});}
      else if(e.type==='hackApply'){
        missionAction('hack');const subject=[...targets,...devices].find(t=>t.id===e.target);
        if(subject?.brain){subject.disabled=8;hit(subject,25,true);log('快速破解：武器故障',{target:e.target,duration:8});}
        else if(subject?.id==='relay'){access=true;targets.forEach(t=>t.disabled=8);devices.forEach(t=>t.disabled=10);log('接管中继器：安保武器与监控暂时停用');toast('中继器已接管 · 终端远程访问开放');}
        else if(subject?.id==='camera'){subject.disabled=18;log('监控停用 18 秒');}
        else if(subject?.id==='terminal'){missionAction('retrieve',{authorized:true});log('远程提取源核芯片');toast('芯片已取得 · 返回入口撤离');}
      }else if(e.type==='reloaded'){emptyNotified=false;log('换弹完成 · 装入 '+e.count+' 发',{ammo:state.ammo,reserve:state.reserve});sound('click');}
    }
    if(state.scanning)trace=Math.max(0,trace-dt*.015);else trace=Math.max(0,trace-dt*.06);
    if(trace>=1){radio={x:p.pos.x,z:p.pos.z,left:.2};trace=.5;log('破解暴露：安保定位到源核信号');}
    if(Math.hypot(move.x,move.z)>.2&&!inputState.crouch&&raw.sprint)noiseAt(10,false);
    const cameraDevice=devices.find(d=>d.id==='camera');
    for(const d of devices)d.disabled=Math.max(0,d.disabled-dt);
    const camRange=Math.hypot(p.pos.x-cameraDevice.x,p.pos.z-cameraDevice.z);
    if(!cameraDevice.disabled&&p.pos.z>cameraDevice.z&&camRange<18&&visible(cameraDevice,origin))cameraSuspicion=Math.min(1,cameraSuspicion+dt*(inputState.crouch?.5:1.2));
    else cameraSuspicion=Math.max(0,cameraSuspicion-dt*.4);
    if(cameraSuspicion>=1){radio={x:p.pos.x,z:p.pos.z,left:.2};missionAction(null,{alert:true});if(!cameraTriggered){cameraTriggered=true;log('监控发现入侵者，向安保发送位置');}}
    if(cameraSuspicion<.5)cameraTriggered=false;
    const phaseBefore=mission.phase;
    if(mission.phase!=='complete')for(const t of targets)advanceGuard(t,dt,p);
    if(noise){noise.left-=dt;if(noise.left<=0)noise=null;}if(radio){radio.left-=dt;if(radio.left<=0)radio=null;}
    mission=stepEncounterMission(mission,Math.hypot(p.pos.x-EXIT.x,p.pos.z-EXIT.z)<2.5?'extract':null,{atExit:true,dead:p.down},dt);
    if(mission.phase==='complete'&&phaseBefore!=='complete')complete();
    flashTime=Math.max(0,flashTime-dt);hitTime=Math.max(0,hitTime-dt);hurtTime=Math.max(0,hurtTime-dt);flash.visible=flashTime>0;
    effects.update(dt);if(handMode!==state.weapon){p.actor.wear('weapon',state.weapon==='gun'?handWeapon:handBat);handMode=state.weapon;}
    if(state.mode==='blocking'&&p.actor.has('combatBlock')&&p.actor.moving!=='combatBlock')p.actor.play('combatBlock');
    else if(state.mode!=='blocking'&&p.actor.moving==='combatBlock')p.actor.stopMove();
    view.visible=o.mode==='first'&&!o.override;gun.visible=state.weapon==='gun';blade.visible=!gun.visible;
    const reloadArc=state.mode==='reloading'?Math.sin(Math.PI*(1-state.action.remaining/COMBAT_RULES.reloadTime)):0;
    gun.position.x=state.aiming?-.23:-.02;gun.position.z=-.14+(flashTime?flashTime*.7:0);
    gun.rotation.z=-.45*reloadArc;gun.position.y=(state.aiming?.12:0)-.16*reloadArc;
    blade.rotation.z=state.mode==='meleeWindup'?-.7:state.mode==='meleeRecovery'?.5:state.mode==='blocking'?-.9:0;
    view.position.y=Math.sin(elapsed*8)*Math.hypot(move.x,move.z)*.007;
    const fov=state.aiming?44:58;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
    hud.hidden=false;hud.querySelector('.combat-hitmark').style.opacity=hitTime?'1':'0';hud.querySelector('.combat-damage').style.opacity=hurtTime?'1':'0';
    hud.querySelector('.combat-readout').textContent=`${state.weapon==='gun'?weaponName:'近战'} · 弹药 ${state.ammo}/${state.reserve} · 体力 ${Math.floor(state.stamina)} · 算力 ${state.ram.toFixed(1)}${inputState.crouch?' · 潜行':''}${state.mode==='reloading'?' · 换弹中':''}`;
    const highest=Math.max(cameraSuspicion,...targets.map(t=>t.hp?t.brain.suspicion:0));
    hud.querySelector('.combat-objective').textContent=mission.phase==='complete'?`完成 · ${mission.route} · 点“撤离据点”返回`:mission.phase==='extract'?'芯片已取得 · 返回入口绿色圆环撤离':`目标：取回后方终端的源核芯片 · 警戒 ${Math.round(highest*100)}%`;
    hud.querySelector('.combat-target').textContent=inputState.scan?`扫描：${picked?picked.id==='relay'?'中继器 · E 接管':picked.id==='camera'?'监控 · E 停用':picked.id==='terminal'?access?'芯片终端 · E 远程提取':'终端加密 · 先接管中继器':'安保 · E 武器故障':'无目标'}${picked&&Math.hypot(picked.x-p.pos.x,picked.z-p.pos.z)>18?' · 超出破解距离':state.nextHack>state.clock?' · 冷却 '+(state.nextHack-state.clock).toFixed(1)+' 秒':state.ram<(progress().perks.includes('efficientHack')?2:3)?' · 算力不足':''} · 追踪 ${Math.round(trace*100)}%`:picked?.brain?`${picked.brain.mode==='combat'?'交战':picked.brain.mode==='search'?'搜索':picked.brain.mode==='suspicious'?'怀疑':'巡逻'} · 安保 ${picked.hp} HP`:'Ctrl 潜行 · Q 扫描 · E 操作/背后处置 · 3 切换武器';
  }
  return {start,stop,update,get assetsReady(){return assetReady;},get active(){return active;},get state(){return state;},get targets(){return targets;},get device(){return devices.find(d=>d.id==='relay');},get devices(){return devices;},get mission(){return mission;},get crouched(){return inputState.crouch;},get scanning(){return inputState.scan;}};
}
