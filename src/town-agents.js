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
export const playerShare=b=>b.owner==='player'?100:(b.playerShare||0);
export function buyShopShares(e,id,percent,currency='ntd'){
 ensureAgents(e);const b=e.industries[id],d=e.world.places.find(d=>d.id===id);
 if(!b||!d||b.owner==='government'||d.kind==='archive'||!['ntd','beta'].includes(currency)||!Number.isSafeInteger(percent)||percent<1||percent+playerShare(b)>100)return false;
 const nt=Math.ceil(shopQuote(e,id)*percent/100),price=currency==='beta'?Math.ceil(nt/exchangeRate(e)):nt,previous=ownerName(e,b);
 if(!(currency==='beta'?coinTransfer:transfer)(e,'player',b.owner,price,'购买股份 · '+d.name))return false;
 b.playerShare=playerShare(b)+percent;if(b.playerShare===100){b.owner='player';b.support=0;}
 const row=decision(e,d.name+'：向 '+previous+' 买入 '+percent+'% 股份，支付 '+price+' '+(currency==='beta'?'GOD':'NT$'),{industry:id,location:d.entrance||d});b.lastDecisionId=row.id;
 event(e,'持股',d.name+'：持股 '+b.playerShare+'%，后续按份额自动分红',{industry:id,decisionId:row.id});return true;
}
export function interveneShop(e,id,action){ensureAgents(e);const b=e.industries[id],d=e.world.places.find(d=>d.id===id);if(!b||!d||b.owner==='government')return false;let text;
 if(action==='support'){if(!transfer(e,'player','i:'+id,100,'扶持 '+d.name))return false;b.support+=100;b.open=true;text='扶持 NT$100，店铺恢复招聘与采购';}
 else if(action==='acquire'){if(b.owner==='player'||!transfer(e,'player',b.owner,Math.ceil(shopQuote(e,id)*(100-playerShare(b))/100),'收购 '+d.name))return false;const old=ownerName(e,b);b.owner='player';b.support=0;text='从 '+old+' 手中收购，后续自动分红';}
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
// Cooperation is attached to the fixed shop, so an ownership change keeps the license.
export function sourcecoreAction(e,id){
 ensureAgents(e);const b=e.industries?.[id],d=e.world?.places.find(d=>d.id===id);
 if(!b||!d||b.owner==='government'||['housing','storage'].includes(d.sector)||d.kind==='archive')return false;
 const p=b.sourcecore;
 if(p){delete b.sourcecore;decision(e,'终止 '+d.name+' 的源核合作；已使用的研发投入不退回',{industry:id});return true;}
 if(!transfer(e,'player','i:'+id,100,'源核试用投入 · '+d.name))return false;
 const row=decision(e,'向 '+d.name+' 授权源核试用，投入 NT$100；完成 3 个有员工工作的生产轮次后落地',{industry:id});
 b.sourcecore={version:1,progress:0,active:false,royalties:0,decisionId:row.id,lastRound:e.round};return true;
}
export function sourcecoreRound(e,d){
 const b=e.industries[d.id],p=b.sourcecore;if(!p||p.version!==1||p.lastRound===e.round)return;
 p.lastRound=e.round;
 const working=b.open&&b.staff>0&&b.roundOutput>0&&e.supply;
 const status=working?(p.active?'运行中':'试用中'):!b.open?'店铺停业':!e.supply?'生产已关闭':!b.staff?'没有到岗员工':'未完成生产或服务';
 if(p.status!==status){event(e,'源核合作',d.name+'：'+status,{industry:d.id,decisionId:p.decisionId});p.status=status;}
 if(!working)return;
 if(!p.active){p.progress=Math.min(3,(p.progress||0)+1);event(e,'源核合作',d.name+' 试用进度 '+p.progress+'/3',{industry:d.id,decisionId:p.decisionId});if(p.progress===3){p.active=true;event(e,'源核落地',d.name+' 下轮起每名员工工资增加 NT$2，生产岗位每人产出增加 2；正经营利润的 10% 支付给阿嬤，亏损不付',{industry:d.id,decisionId:p.decisionId});}return;}
 const fee=Math.min(Math.floor(Math.max(0,b.profit||0)*.1),Math.max(0,b.cash-Math.max(100,b.capacity*(b.wage||12)*2)));
 if(fee>0&&transfer(e,'i:'+d.id,'player',fee,'源核授权收益 · '+d.name)){b.roundCosts=(b.roundCosts||0)+fee;b.profit-=fee;p.royalties+=fee;event(e,'源核收益',d.name+' 实付授权收益 NT$'+fee+'；累计 NT$'+p.royalties,{industry:d.id,decisionId:p.decisionId});}
}
// Earned surplus purchases existing coins from the issuer; no fabricated profits or currency.
function accumulate(e,owner,earned){if(!e.crypto.enabled||earned<=0||owner==='player')return;const rate=exchangeRate(e),account=owner.startsWith('h:')?e.households[+owner.slice(2)]:e.industries[owner.slice(2)],cash=account.cash;const keep=owner.startsWith('h:')?60:100;account.godSavingsNT=(account.godSavingsNT||0)+Math.floor(earned*.3);const qty=Math.min(Math.floor(account.godSavingsNT/rate),Math.floor(Math.max(0,cash-keep)/rate),e.crypto.holders.player);if(qty>0&&transfer(e,owner,'player',qty*rate,'收入积累 GOD')){coinTransfer(e,'player',owner,qty,'收入积累 GOD');account.godSavingsNT-=qty*rate;e.issuerSalesNT=(e.issuerSalesNT||0)+qty*rate;}}
export function agentRound(e){ensureAgents(e);const g=e.government;
 for(const h of e.households){const earned=h.working?Math.min(h.roundIncome||0,Math.max(0,h.cash-(h.roundStartCash??(h.cash-(h.roundIncome||0))))):0;accumulate(e,'h:'+h.id,earned);}
 for(const d of e.world.places){const b=e.industries[d.id];if(b.owner==='government'||d.kind==='archive')continue;const rate=exchangeRate(e);if(b.owner!=='player'){const owner=e.households.find(h=>'h:'+h.id===b.owner);if(owner?.cash>180&&b.cash<56&&transfer(e,b.owner,'i:'+d.id,100,'老板自动补充运营资金')){b.open=true;event(e,'经营',owner.name+' 补充资金，'+d.name+' 继续招聘',{industry:d.id});}}b.businessState=b.previousSales>0&&b.roundSales<b.previousSales*.7?'生意转弱，减少招聘':b.roundSales>(b.previousSales||0)*1.2&&b.roundSales>0?'客流增加，准备扩张':'正常经营';b.profit=(b.roundSales||0)-(b.roundPayroll||0)-(b.roundCosts||0)-(b.roundTax||0);sourcecoreRound(e,d);accumulate(e,'i:'+d.id,b.profit);const reserve=Math.max(100,b.capacity*(b.wage||12)*2);const dividend=Math.max(0,Math.min(Math.floor(b.profit*.5),Math.max(0,b.cash-reserve)));if(dividend){const mine=Math.floor(dividend*playerShare(b)/100),rest=dividend-mine;if(mine&&transfer(e,'i:'+d.id,'player',mine,'持股分红 · '+d.name)){e.playerDividends=(e.playerDividends||0)+mine;event(e,'分红',d.name+' 向你分红 NT$'+mine,{industry:d.id});}if(rest&&transfer(e,'i:'+d.id,b.owner,rest,'经营分红 · '+d.name)){accumulate(e,b.owner,rest);event(e,'分红',d.name+' 向 '+ownerName(e,b)+' 分红 NT$'+rest,{industry:d.id});}}
  if(b.cash+(e.crypto.holders['i:'+d.id]||0)*rate<(b.wage||12))b.distress=(b.distress||0)+1;else b.distress=0;
  if(b.distress>=4&&b.owner!=='player'){const buyer=[...e.households].filter(h=>'h:'+h.id!==b.owner&&h.active!==false).sort((a,b)=>b.cash-a.cash)[0],price=shopQuote(e,d.id);if(buyer&&buyer.cash>price+100&&transfer(e,'h:'+buyer.id,b.owner,price,'接手困境店铺')){b.owner='h:'+buyer.id;b.distress=0;transfer(e,b.owner,'i:'+d.id,100,'新老板恢复经营');b.open=true;event(e,'控股变更',buyer.name+' 接手 '+d.name,{industry:d.id});}}
 }
 const treasury=e.industries.civic;accumulate(e,'i:civic',e.metrics.tax||0);
 const budget=g.policy==='补贴'||g.style==='民生'?8:4;for(const h of e.households.filter(h=>h.active!==false&&(!h.working||h.hunger>2)).slice(0,8))if(treasury.cash>=budget)transfer(e,'i:civic','h:'+h.id,budget,'政府民生补贴');
 for(const d of e.world.places.filter(d=>d.sector==='public'||d.sector==='transport'))if(d.id!=='civic'&&e.industries[d.id].cash<56&&treasury.cash>=28)transfer(e,'i:civic','i:'+d.id,28,'公共岗位与维护预算');
 const active=e.households.filter(h=>h.active!==false),stress=active.filter(h=>(!h.working&&h.cash+(e.crypto.holders['h:'+h.id]||0)*exchangeRate(e)<60*(e.world.priceIndex||1))||h.hunger>3).length/Math.max(1,active.length);const previous=g.approval;g.approval=Math.max(0,Math.min(100,Math.round(g.approval+2+(g.policy==='治安'||g.style==='强硬'?1:0)-stress*8)));g.protest=g.approval<35;for(const h of active)h.protesting=g.protest&&h.id%3===0&&(h.hunger>3||!h.working&&h.cash+(e.crypto.holders['h:'+h.id]||0)*exchangeRate(e)<60*(e.world.priceIndex||1));g.strike=g.approval<20&&g.policy!=='治安'&&g.style!=='强硬';if(previous>=35&&g.protest)event(e,'抗议','居民开始抗议失业和生活成本',{industry:'civic'});if(g.approval<10){g.leader=(g.leader+1)%Math.max(1,active.length);g.term++;g.approval=40;g.strike=false;event(e,'政府更替','治理失败，新执政者接任市政厅',{industry:'civic'});}
}
