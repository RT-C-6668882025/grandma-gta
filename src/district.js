import {decision,event} from './economy-ledger.js';
import {investIndustry,exchangeRate,toCoins} from './town-currency.js';
export function initDistrict(e,roads=[]){
 if(!e.world)return;
 const eligible=e.world.places.filter(d=>['food','retail','tools','health'].includes(d.sector)&&Math.hypot(d.x+24,d.z)<105);
 const ids=new Set(['shop','hardware','clinic',...eligible.filter(d=>d.sector==='food').slice(0,3).map(d=>d.id),...eligible.slice(0,2).map(d=>d.id)]);
 e.world.district=e.world.places.filter(d=>ids.has(d.id)).slice(0,8).map(d=>d.id);
 for(const id of e.world.district){const d=e.world.places.find(d=>d.id===id);let best=null;
  for(const road of roads)for(let i=1;i<road.pts.length;i++){const [ax,az]=road.pts[i-1],[bx,bz]=road.pts[i],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((d.x-ax)*dx+(d.z-az)*dz)/(dx*dx+dz*dz||1))),x=ax+t*dx,z=az+t*dz,dist=Math.hypot(d.x-x,d.z-z);if(!best||dist<best.dist)best={x,z,dist};}
  d.entrance=best?{x:best.x+(d.x-best.x)/Math.max(1,best.dist)*Math.min(4,best.dist),z:best.z+(d.z-best.z)/Math.max(1,best.dist)*Math.min(4,best.dist)}:{x:d.x,z:d.z};
 }
}
export const inDistrict=(e,id)=>e.world?.district?.includes(id);
export function shopState(e,id){const b=e.industries[id];return !b.open?'已停业':b.stock<=0?'缺货':!b.staff?(b.cash+(e.crypto.holders['i:'+id]||0)*exchangeRate(e)<(b.wage||28)?'资金不足':'等待员工到岗'):'营业中';}
export function shopDecision(e,id,action,amount=100){
 const b=e.industries?.[id],d=e.world?.places.find(d=>d.id===id);if(!b||!d)return false;
 let message='';
 if(action==='invest'){if(!investIndustry(e,id,amount,'ntd'))return false;message='注资 NT$'+amount;}
 else if(action==='toggle'){b.open=!b.open;message=b.open?'恢复营业':'停止营业';}
 else if(action==='wage'){if(!Number.isSafeInteger(amount)||amount<1||amount>1000)return false;b.wage=amount;message='每轮工资改为 NT$'+amount;}
 else return false;
 const row=decision(e,d.name+'：'+message,{industry:id,location:d.entrance||d});b.lastDecisionId=row.id;
 event(e,'产业',d.name+' '+message,{industry:id,decisionId:row.id,location:d.entrance||d});return true;
}
export function payrollQuote(e,id){const b=e.industries[id],nt=b.wage||28;return e.coinMode&&b.currency==='beta'?toCoins(e,nt)+' GOD / 人':nt+' NT$ / 人';}
