import {transfer,event,decision} from './economy-ledger.js';
import {exchangeRate,coinTransfer} from './town-currency.js';
const styles=['发展','民生','强硬'];
export function ensureAgents(e){
 if(!e.world?.enabled)return;
 e.crypto.enabled=true;
 if(!e.industries.civic){e.world.places.push({id:'civic',name:'小镇市政厅',sector:'public',kind:'government',x:-24,z:0});e.industries.civic={cash:0,open:true,currency:'ntd',revenue:0,wages:0,revenueNT:0,wagesNT:0,stock:0,items:{},level:1,capacity:3};e.crypto.holders['i:civic']=0;transfer(e,'bank','i:civic',Math.min(300,e.bank),'市政公库成立');}
 e.government ||= {leader:0,style:'发展',policy:'减税',approval:65,term:1};
 for(const h of e.households)h.ability=Number.isInteger(h.ability)&&h.ability>=1&&h.ability<=5?h.ability:1+(h.id*7%5);
 for(const [i,d] of e.world.places.entries()){const b=e.industries[d.id];if(!b)continue;if(d.id==='civic'||d.sector==='public'){b.owner='government';continue;}if(!b.controlVersion){b.owner=e.households.length?'h:'+e.households[i%e.households.length].id:'player';b.controlVersion=1;}if(b.owner!=='player'&&!e.households.some(h=>'h:'+h.id===b.owner))b.owner=e.households.length?'h:'+e.households[0].id:'player';b.support ||=0;}
}
export function ownerName(e,b){return b.owner==='player'?'你':b.owner==='government'?'小镇政府':e.households.find(h=>'h:'+h.id===b.owner)?.name||'待接手';}
export function shopQuote(e,id){const b=e.industries[id];return Math.max(100,Math.round((b.cash+(e.crypto.holders['i:'+id]||0)*exchangeRate(e)+b.level*100+b.stock*4)*1.2));}
export function interveneShop(e,id,action){ensureAgents(e);const b=e.industries[id],d=e.world.places.find(d=>d.id===id);if(!b||!d||b.owner==='government')return false;let text;
 if(action==='support'){if(!transfer(e,'player','i:'+id,100,'扶持 '+d.name))return false;b.support+=100;b.open=true;text='扶持 NT$100，店铺恢复招聘与采购';}
 else if(action==='acquire'){if(b.owner==='player'||!transfer(e,'player',b.owner,shopQuote(e,id),'收购 '+d.name))return false;const old=ownerName(e,b);b.owner='player';b.support=0;text='从 '+old+' 手中收购，后续自动分红';}
 else if(action==='withdraw'){const n=Math.min(b.support,b.cash);if(!n||!transfer(e,'i:'+id,'player',n,'撤回扶持 '+d.name))return false;b.support-=n;text='撤回 NT$'+n+'，店铺将按剩余资金经营';}
 else return false;
 const row=decision(e,d.name+'：'+text,{industry:id,location:d.entrance||d});b.lastDecisionId=row.id;event(e,'产业',text,{industry:id,decisionId:row.id});return true;
}
export function governmentAction(e,action){ensureAgents(e);const g=e.government;let message;
 if(action==='support'){if(!transfer(e,'player','i:civic',100,'扶持政府'))return false;message='给政府 NT$100，自动安排公共支出';}
 else if(['减税','补贴','治安'].includes(action)){g.policy=action;message='政府政策改为 '+action;}
 else if(styles.includes(action)){g.leader=(g.leader+1)%Math.max(1,e.households.length);g.style=action;g.term++;message='更换执政者，采用'+action+'取向';}
 else return false;decision(e,message,{industry:'civic'});return true;
}
// Earned surplus purchases existing coins from the issuer; no fabricated profits or currency.
function accumulate(e,owner,earned){if(!e.crypto.enabled||earned<=0)return;const rate=exchangeRate(e),cash=owner.startsWith('h:')?e.households[+owner.slice(2)].cash:e.industries[owner.slice(2)].cash;const keep=owner.startsWith('h:')?60:100;const qty=Math.min(Math.floor(earned*.3/rate),Math.floor(Math.max(0,cash-keep)/rate),e.crypto.holders.player);if(qty>0&&transfer(e,owner,'player',qty*rate,'收入积累 GOD')){coinTransfer(e,'player',owner,qty,'收入积累 GOD');e.issuerSalesNT=(e.issuerSalesNT||0)+qty*rate;}}
export function agentRound(e){ensureAgents(e);const g=e.government;
 for(const h of e.households){const earned=h.working?(h.roundIncome||0):0;accumulate(e,'h:'+h.id,earned);}
 for(const d of e.world.places){const b=e.industries[d.id];if(b.owner==='government'||d.kind==='archive')continue;const rate=exchangeRate(e);if(b.owner!=='player'){const owner=e.households.find(h=>'h:'+h.id===b.owner);if(owner?.cash>300&&b.cash<56&&transfer(e,b.owner,'i:'+d.id,100,'老板自动补充运营资金')){b.open=true;event(e,'经营',owner.name+' 补充资金，'+d.name+' 继续招聘',{industry:d.id});}}b.profit=(b.roundSales||0)-(b.roundPayroll||0)-(b.roundCosts||0)-(b.roundTax||0);accumulate(e,'i:'+d.id,b.profit);const reserve=Math.max(100,b.capacity*(b.wage||28)*2);const dividend=Math.max(0,Math.min(Math.floor(b.profit*.5),Math.max(0,b.cash-reserve)));if(dividend&&transfer(e,'i:'+d.id,b.owner,dividend,'经营分红 · '+d.name)){accumulate(e,b.owner,dividend);if(b.owner==='player')e.playerDividends=(e.playerDividends||0)+dividend;event(e,'分红',d.name+' 向 '+ownerName(e,b)+' 分红 NT$'+dividend,{industry:d.id});}
  if(b.cash+(e.crypto.holders['i:'+d.id]||0)*rate<28)b.distress=(b.distress||0)+1;else b.distress=0;
  if(b.distress>=4&&b.owner!=='player'){const buyer=[...e.households].filter(h=>'h:'+h.id!==b.owner&&h.active!==false).sort((a,b)=>b.cash-a.cash)[0],price=shopQuote(e,d.id);if(buyer&&buyer.cash>price+100&&transfer(e,'h:'+buyer.id,b.owner,price,'接手困境店铺')){b.owner='h:'+buyer.id;b.distress=0;transfer(e,b.owner,'i:'+d.id,100,'新老板恢复经营');b.open=true;event(e,'控股变更',buyer.name+' 接手 '+d.name,{industry:d.id});}}
 }
 const treasury=e.industries.civic;accumulate(e,'i:civic',e.metrics.tax||0);
 const budget=g.policy==='补贴'||g.style==='民生'?8:4;for(const h of e.households.filter(h=>h.active!==false&&(!h.working||h.hunger>2)).slice(0,8))if(treasury.cash>=budget)transfer(e,'i:civic','h:'+h.id,budget,'政府民生补贴');
 for(const d of e.world.places.filter(d=>d.sector==='public'||d.sector==='transport'))if(d.id!=='civic'&&e.industries[d.id].cash<56&&treasury.cash>=28)transfer(e,'i:civic','i:'+d.id,28,'公共岗位与维护预算');
 const active=e.households.filter(h=>h.active!==false),stress=active.filter(h=>!h.working||h.hunger>3).length/Math.max(1,active.length);const previous=g.approval;g.approval=Math.max(0,Math.min(100,Math.round(g.approval+2+(g.policy==='治安'||g.style==='强硬'?1:0)-stress*8)));g.protest=g.approval<35;g.strike=g.approval<20&&g.policy!=='治安'&&g.style!=='强硬';if(previous>=35&&g.protest)event(e,'抗议','居民开始抗议失业和生活成本',{industry:'civic'});if(g.approval<10){g.leader=(g.leader+1)%Math.max(1,active.length);g.term++;g.approval=40;g.strike=false;event(e,'政府更替','治理失败，新执政者接任市政厅',{industry:'civic'});}
}
