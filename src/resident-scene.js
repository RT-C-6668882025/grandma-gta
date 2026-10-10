import {P,ROADS} from './world/layout.js';
import {roadRoute,distance} from './map-navigation.js';
import {INDUSTRIES} from './town-currency.js';
export const MINE={x:P.market.x+4,z:P.market.z+10};
export const residentHome=id=>({x:-125+(id%12)*18,z:id%2?14:-14});
export const residentTarget=h=>h.job==='mine'?MINE:h.job==='rest'?residentHome(h.id):INDUSTRIES.find(d=>d.id===h.industry)||{x:P.market.x,z:P.market.z+15};
export function createResidentScene({ground=()=>0}={}){
  const bindings=new Map();let lastEconomy=null;
  return {
    sync(e,ents){
      if(e.world?.enabled)return;
      if(lastEconomy!==e){for(const n of bindings.values()){delete n.residentUid;delete n.economyId;delete n.economyReady;delete n.economyJob;n.name=n.originalResidentName||'路人';}bindings.clear();lastEconomy=e;}
      for(const [id,n] of bindings)if(id>=e.households.length||n.residentUid!==e.households[id].uid||!ents.includes(n)){delete n.residentUid;delete n.economyId;delete n.economyReady;delete n.economyJob;n.name=n.originalResidentName||'路人';bindings.delete(id);}
      for(const h of e.households){
        let n=bindings.get(h.id);
        if(!n&&h.id<(e.world?.enabled?256:24)){n=ents.find(n=>n.role==='ped'&&n.economyId===undefined&&!n.talk&&!n.hostile&&!n.veh&&!n.down);if(n){n.originalResidentName=n.name;n.economyId=h.id;n.residentUid=h.uid;bindings.set(h.id,n);}}
        h.placed=!!n;if(!n){h.present=true;h.location=residentTarget(h);continue;}
        n.name=h.name;const target=residentTarget(h),offset={x:target.x+(h.id%3-1)*1.5,z:target.z+(Math.floor(h.id/3)%3-1)*1.5};
        // Existing ambient pedestrians become persistent residents; story characters are untouched.
        if(!n.economyReady){n.economyReady=true;n.pos.x=offset.x;n.pos.z=offset.z;n.pos.y=ground(offset.x,offset.z);n.place();}
        h.location={x:n.pos.x,z:n.pos.z};h.present=!n.down&&!n.veh&&distance(n.pos,offset)<6;
        if(n.down||n.veh||['fight','flee'].includes(n.state))continue;
        const targetKey=h.job+':'+offset.x+':'+offset.z;
        if(n.economyJob!==targetKey){n.economyJob=targetKey;n.economyPath=roadRoute(ROADS,n.pos,offset).slice(1);}
        while(n.economyPath?.length&&distance(n.pos,n.economyPath[0])<2)n.economyPath.shift();
        if(n.economyPath?.length){const p=n.economyPath[0];n.goal=[p.x,p.z];n.state='walk';n.stateT=60;}
        else {n.state='idle';n.stateT=60;}
      }
    },
    advanceFar(n,dt){
      if(n.economyId===undefined||n.down||n.veh||['fight','flee'].includes(n.state)||!n.economyPath?.length)return;
      const p=n.economyPath[0],d=distance(n.pos,p),step=Math.min(d,(n.speedWalk||1.2)*dt);if(d>.001){n.pos.x+=(p.x-n.pos.x)/d*step;n.pos.z+=(p.z-n.pos.z)/d*step;n.pos.y=ground(n.pos.x,n.pos.z);}
    },
    markers(e){return e.households.map(h=>({id:h.uid,x:h.location?.x??residentHome(h.id).x,z:h.location?.z??residentHome(h.id).z,label:h.name,category:'resident',color:h.job==='mine'?'#cc8bff':h.job==='rest'?'#a9b6bf':'#5de0ae',detail:`${h.uid} · ${h.placed?'場景居民':'後台居民'} · ${h.job==='mine'?'挖礦':h.job==='rest'?'休息':'生產'} · NT$${h.cash} · ${e.crypto.holders['h:'+h.id]} BETA` }));}
  };
}
