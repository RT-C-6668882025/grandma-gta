import {transfer} from './economy-ledger.js';
import {cancelOrder} from './crypto-market.js';
export const POPULATIONS=[12,24,48,96];
const surnames=['陳','林','黃','張','李','王','吳','劉'];
const names=['志明','美玲','文雄','淑芬','建宏','雅惠','國華','秀英','俊傑','麗華','明德','玉蘭'];
export function resident(id,cash=0,serial=id){return {id,uid:'R'+String(serial+1).padStart(6,'0'),name:surnames[serial%8]+names[Math.floor(serial/8)%12],age:22+serial*7%49,cash,hunger:0,job:'work',working:true,miningProgress:0,mined:0,present:true};}
export function restoreIdentities(e){
  const ids=new Set();let next=Number.isSafeInteger(e.residentSerial)&&e.residentSerial>=e.households.length?e.residentSerial:e.households.length;
  for(const h of e.households){if(typeof h.uid!=='string'||!/^R\d{6,}$/.test(h.uid)||ids.has(h.uid))h.uid='R'+String(++next).padStart(6,'0');ids.add(h.uid);next=Math.max(next,Number(h.uid.slice(1)));}
  e.residentSerial=next;
}
export function populate(e,count){
  if(!POPULATIONS.includes(count))return false;
  const previous=e.households.length;
  restoreIdentities(e);
  for(let i=count;i<previous;i++){
    const owner='h:'+i;for(const o of [...e.crypto.orders])if(o.owner===owner)cancelOrder(e,o.id,owner);
    if(e.households[i].cash)transfer(e,owner,'bank',e.households[i].cash,'居民遷出結算');
    e.crypto.reserve+=e.crypto.holders[owner];delete e.crypto.holders[owner];
  }
  e.households.length=Math.min(previous,count);
  for(let i=previous;i<count;i++){e.households.push(resident(i,0,e.residentSerial++));e.crypto.holders['h:'+i]=0;const grant=Math.min(100,e.bank);if(grant)transfer(e,'bank','h:'+i,grant,'居民遷入安置');}
  return true;
}
export function chooseJobs(e){
  for(const h of e.households){
    const owner='h:'+h.id,wealthy=e.crypto.enabled&&h.cash>600&&e.crypto.holders[owner]*e.crypto.price>2000;
    const oldJob=h.job;
    h.job=e.coinMode?(e.crypto.holders[owner]>40&&h.hunger<3?'rest':e.crypto.reserve>0&&h.hunger<3&&h.id%4===0?'mine':'work'):wealthy?'rest':e.crypto.enabled&&e.crypto.reserve>0&&h.hunger<3&&h.cash>=2&&h.id%4===0?'mine':'work';
    if(oldJob!==h.job&&h.placed)h.present=false;
    h.working=h.job==='work';
  }
}
export const JOB_LABELS={work:'生產',mine:'挖礦',rest:'休息'};
