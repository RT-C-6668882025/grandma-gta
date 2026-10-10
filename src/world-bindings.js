import {resident} from './residents.js';
import {transfer} from './economy-ledger.js';
import {attachWorld} from './world-economy.js';
const prices={bicycle:120,tricycle:300,scooter:500,sedan:1500,minitruck:1800,taxi:1800,luxcar:3000};
export function createWorldBindings(){
  let last=null,serial=0,assetSerial=0,equipment=[];
  return {init(e,places,props=[]){equipment=props;attachWorld(e,places);last=null;},sync(e,ents,vehicles,animals,player){
    if(!e.world?.enabled)return;
    if(last!==e){last=e;serial=0;assetSerial=0;for(const v of [...vehicles,...animals])delete v.worldAsset;for(const n of ents){delete n.worldHousehold;delete n.economyId;delete n.residentUid;}for(const h of e.households){h.active=!h.sceneActor;h.placed=false;}}
    for(const h of e.households)if(h.sceneActor)h.active=false;
    for(const n of ents){
      if(n===player)continue;
      if(n.worldHousehold===undefined){n.worldHousehold=serial++;if(n.worldHousehold>=256)continue;
        while(e.households.length<=n.worldHousehold){const id=e.households.length;e.households.push(resident(id,0,e.residentSerial||id));e.residentSerial=(e.residentSerial||id)+1;e.crypto.holders['h:'+id]=0;const grant=Math.min(10,e.bank);if(grant)transfer(e,'bank','h:'+id,grant,'居民账户接入');}
      }
      const h=e.households[n.worldHousehold];if(!h)continue;
      h.sceneActor=true;h.active=true;h.placed=true;h.name=n.name||'居民';h.role=n.role==='ped'&&n.name==='農夫'?'farmer':n.role;h.unavailable=!!(n.down||n.hostile||['fight','flee'].includes(n.state));h.present=!h.unavailable;h.location={x:n.pos.x,z:n.pos.z};n.economyId=h.id;n.residentUid=h.uid;
      // Ambient workers commute to their real employer; story NPC behavior has priority.
      if(n.role==='ped'&&!h.unavailable&&!n.veh&&h.industry){const d=e.world.places.find(d=>d.id===h.industry);if(d&&Math.hypot(d.x-n.pos.x,d.z-n.pos.z)>5){n.goal=[d.x,d.z];n.state='walk';n.stateT=60;}}
    }
    const old=new Map(e.world.assets.map(a=>[a.id,a]));
    e.world.assets=[...vehicles.map((v,index)=>{const id=v.worldAsset||('vehicle:'+(assetSerial++)),prev=old.get(id);v.worldAsset=id;if(prev?.owner==='player')v.owner='ama';return {...prev,id,index,kind:'vehicle',type:v.type,name:v.def.name,x:v.pos.x,z:v.pos.z,available:!v.broken&&v.hp>0,moving:Math.abs(v.speed)>0.5,owner:prev?.owner||(v.owner==='ama'?'player':'market'),assigned:prev?.assigned||false,price:prices[v.type]||500};}),...animals.map((a,index)=>{const id=a.worldAsset||('animal:'+(assetSerial++));a.worldAsset=id;return {...old.get(id),id,index,kind:'animal',type:a.sp,name:({dog:'狗',cat:'猫',rooster:'鸡',goose:'鹅',buffalo:'水牛'})[a.sp],x:a.pos.x,z:a.pos.z,available:!a.down&&!a.parked,owner:old.get(id)?.owner||'market',price:a.sp==='buffalo'?500:50};}),...equipment.map(a=>({...a,...old.get(a.id)}))];
    for(const a of equipment){const nearest=e.world.places.reduce((best,d)=>Math.hypot(a.x-d.x,a.z-d.z)<Math.hypot(a.x-best.x,a.z-best.z)?d:best,e.world.places[0]);if(nearest)e.industries[nearest.id].equipment=Math.min(4,equipment.filter(q=>Math.hypot(q.x-nearest.x,q.z-nearest.z)<8).length);}
  }};
}
