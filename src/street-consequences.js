import {event} from './economy-ledger.js';
export function streetInjury(e,id,damage,location){
 const h=e.households.find(h=>h.id===id);if(!h||!Number.isFinite(damage)||damage<=0)return false;
 h.injuredUntil=Math.max(h.injuredUntil||0,e.round+3);h.working=false;delete h.visit;
 event(e,'街头冲突',h.name+' 受伤，停工至第 '+h.injuredUntil+' 轮；无法领取工作工资或完成到店消费',{resident:id,industry:h.industry,location,damage,until:h.injuredUntil});return true;
}
export function recoverStreetInjuries(e){for(const h of e.households)if(h.injuredUntil&&e.round>=h.injuredUntil){h.injuredUntil=0;event(e,'康复',h.name+' 康复，可重新应聘；是否上岗取决于岗位与资金',{resident:h.id,industry:h.industry,location:h.location});}}
