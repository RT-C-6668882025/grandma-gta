// Pure economic rules. Scene adapters supply identities and availability; no renderer dependency.
import {transfer,event} from './economy-ledger.js';
import {ensureIndustries,settle,exchangeRate,toCoins,coinTransfer} from './town-currency.js';
export const SECTOR_NAMES={food:'食品',retail:'零售',tools:'制造维修',health:'医疗',leisure:'休闲',recycling:'回收',farm:'农业',housing:'住宅',transport:'交通',public:'公共服务',storage:'仓储'};
export function sectorOf(d){
  if(d.kind&&d.kind!=='business')return d.kind==='retail'&&/菜|吃/.test(d.name)?'food':d.kind;
  if(d.special==='police')return 'public';
  if(/五金|修理|機車|水電|電器|瓦斯|鎖匠|碾米/.test(d.name))return 'tools';
  if(/診所|牙科|藥/.test(d.name))return 'health';
  if(/麵|豆漿|早餐|餐|粥|豬腳|肉圓|冰果|茶|碗粿|菜/.test(d.name))return 'food';
  if(/卡拉|髮|理髮|婚紗/.test(d.name))return 'leisure';return 'retail';
}
const finite=n=>Number.isSafeInteger(n)&&n>=0;
export function validWorld(w){
  return !!w&&w.version===1&&typeof w.enabled==='boolean'&&[1,2,4,8,16].includes(w.speed)&&Array.isArray(w.places)&&w.places.length<=2000&&new Set(w.places.map(d=>d.id)).size===w.places.length&&w.places.every(d=>typeof d.id==='string'&&/^[\w:.-]+$/.test(d.id)&&!['__proto__','constructor','prototype'].includes(d.id)&&typeof d.name==='string'&&Object.hasOwn(SECTOR_NAMES,d.sector)&&Number.isFinite(d.x)&&Number.isFinite(d.z))&&(!w.history||Array.isArray(w.history))&&(!w.assets||Array.isArray(w.assets));
}
export function attachWorld(e,places){
  const seen=new Set(),defs=[];
  for(const d of places){let id=d.id;if(seen.has(id))id+=':'+defs.length;seen.add(id);defs.push({id,name:d.name,x:d.x,z:d.z,sector:sectorOf(d),kind:d.kind||'business'});}
  // Keep the six original business wallets on upgrade. The market is a cooperative account.
  for(const [id,name,sector,x,z] of [['market','菜市场生产合作社','farm',-60,-40],['shop','阿桃柑仔店','retail',-24,-13],['hardware','金兴五金行','tools',18,-13],['clinic','仁爱诊所','health',-128,13],['recycle','回收场','recycling',140,36],['betel','槟榔摊','retail',214,44]])if(!seen.has(id)){seen.add(id);defs.push({id,name,sector,x,z,kind:'business'});}
  if(!e.world)e.world={version:1,enabled:true,speed:1,places:defs,assets:[],history:[],totals:{production:0,sales:0,wages:0},started:e.round};
  else {e.world.enabled=true;e.world.places=defs;e.world.assets ||= [];e.world.totals ||= {production:0,sales:0,wages:0};e.world.history ||= [];}
  // Preserve removed model accounts in the registry rather than losing saved balances.
  for(const id of Object.keys(e.industries||{}))if(!seen.has(id)){e.world.places.push({id,name:'存档资产 '+id,sector:'storage',kind:'archive',x:0,z:0});}
  ensureIndustries(e);
  for(const d of e.world.places){const b=e.industries[d.id];b.sector=d.sector;b.stock=finite(b.stock)?b.stock:12;b.level=finite(b.level)&&b.level>=1?b.level:1;b.capacity=finite(b.capacity)?b.capacity:4;b.units=finite(b.units)?b.units:0;b.items ||= {};b.cash ??=0;b.currency=e.coinMode?b.currency:'ntd';b.reason='等待生产轮次';}
  if(!e.world.seeded){
    // Move the original producer/retail working capital; never issue money implicitly.
    const candidates=e.world.places.filter(d=>!['housing','storage'].includes(d.sector));
    const sectors=Object.keys(SECTOR_NAMES).map(sector=>candidates.filter(d=>d.sector===sector));
    const targets=[];for(let i=0;targets.length<Math.min(64,candidates.length);i++)for(const group of sectors)if(group[i]&&targets.length<64)targets.push(group[i]);
    for(const source of ['producer','shop']){const budget=e[source],each=Math.floor(budget/targets.length);for(const d of targets)if(each)transfer(e,source,'i:'+d.id,each,'原产业资金分配');}
    e.world.seeded=true;
  }
  snapshotEconomy(e);
}
export function worldService(e,id,nt,reason,owner='player'){
  const b=e.industries?.[id];if(!b||!b.open)return false;
  const currency=e.coinMode?b.currency:'ntd';if(!settle(e,owner,'i:'+id,nt,currency,reason))return false;
  const paid=currency==='beta'?toCoins(e,nt):nt;b[currency==='beta'?'revenue':'revenueNT']+=paid;
  if(owner==='player'||owner.startsWith('h:'))e.metrics.gdp=(e.metrics.gdp||0)+nt;
  e.metrics.sales+=(currency==='beta'?paid*exchangeRate(e):paid);return true;
}
const shopFor=where=>({mart:'shop',cloth:'cloth'}[where]||where);
export function itemQuote(e,where,id,base){const b=e.industries?.[shopFor(where)];const nt=Math.max(1,Math.round(base*(1+e.issued/15000)));return {nt,currency:e.coinMode?(b?.currency||'beta'):'ntd',amount:e.coinMode&&b?.currency==='beta'?toCoins(e,nt):nt,stock:Math.min(b?.items?.[id]??5,b?.stock??0)};}
export function tradeItem(e,where,id,quantity,side,base){
  const key=shopFor(where),b=e.industries?.[key];if(!e.world?.enabled||!b?.open||!finite(quantity)||!quantity||!finite(base)||!['buy','sell'].includes(side))return false;
  b.items ||= {};const q=itemQuote(e,where,id,base),stock=b.items[id]??5;
  if(side==='buy'&&(stock<quantity||b.stock<quantity))return false;
  if(!settle(e,side==='buy'?'player':'i:'+key,side==='buy'?'i:'+key:'player',q.nt*quantity,q.currency,(side==='buy'?'购买 ':'出售 ')+id))return false;
  b.items[id]=stock+(side==='buy'?-quantity:quantity);b.stock+=side==='buy'?-quantity:quantity;b.units+=quantity;
  if(side==='buy'){e.metrics.gdp=(e.metrics.gdp||0)+q.nt*quantity;const paid=q.currency==='beta'?toCoins(e,q.nt*quantity):q.nt*quantity;b[q.currency==='beta'?'revenue':'revenueNT']+=paid;e.metrics.sales+=q.currency==='beta'?paid*exchangeRate(e):paid;}
  else if(['cardboard','bottle'].includes(id)){e.world.recycled=(e.world.recycled||0)+quantity;}
  return true;
}
export function recordHarvest(e,n){if(e.world?.enabled){e.world.harvested=(e.world.harvested||0)+n;e.world.totals.production+=n;}}
export function fundAll(e,amount,currency='ntd'){
  if(!e.world?.enabled||!finite(amount)||!amount||!['ntd','beta'].includes(currency))return false;
  const balance=currency==='ntd'?e.player:e.crypto.holders.player;if(balance<amount)return false;
  const ds=e.world.places.filter(d=>e.industries[d.id].open);if(!ds.length)return false;
  const unit=Math.floor(amount/ds.length),rest=amount%ds.length;
  for(const [i,d] of ds.entries()){const n=unit+(i<rest?1:0);if(n)(currency==='ntd'?transfer:coinTransfer)(e,'player','i:'+d.id,n,'全镇注资');}return true;
}
function outputKind(s){return ['farm','food','tools','recycling'].includes(s);}
export function worldRound(e){
  const w=e.world;if(!w?.enabled)return;
  ensureIndustries(e);const ds=w.places,active=e.households.filter(h=>h.active!==false),rate=exchangeRate(e);
  const bySector={};for(const d of ds)(bySector[d.sector] ||= []).push(d);
  const assets=w.assets||[],transport=assets.filter(a=>a.kind==='vehicle'&&a.available),livestock=assets.filter(a=>a.kind==='animal'&&a.available&&['rooster','goose','buffalo'].includes(a.type));
  const workingTransport=transport.filter(a=>a.moving||a.assigned).length;
  const m=e.metrics;Object.assign(m,{gdp:0,services:0,tax:0,unpaid:0,logistics:workingTransport,active:active.length});
  for(const d of ds){const b=e.industries[d.id];b.staff=0;b.roundSales=0;b.roundOutput=0;b.reason=b.open?(b.cash+(e.crypto.holders['i:'+d.id]||0)*rate<28?'缺少运营资金':(['housing','storage'].includes(d.sector)?'无需员工':'等待招聘')):'已停业';}
  const employable=ds.filter(d=>!['housing','storage'].includes(d.sector)&&e.industries[d.id].open);
  // Job vacancies follow existing scene roles. Residents may change employers when firms run out of cash.
  for(const h of active){
    const owner='h:'+h.id;h.hunger=Math.min(10,h.hunger+1);h.working=false;h.job='work';
    if(h.unavailable){m.unpaid++;continue;}
    const preferred=h.role==='cop'?'public':h.role==='driver'?'transport':h.role==='dancer'?'leisure':h.role==='farmer'?'farm':null;
    let candidates=preferred?(bySector[preferred]||[]):employable;
    const last=ds.find(d=>d.id===h.industry);
    candidates=[...(last&&e.industries[last.id].open?[last]:[]),...candidates.slice(h.id%candidates.length),...candidates.slice(0,h.id%candidates.length)];
    const d=candidates.find(d=>{const b=e.industries[d.id];return b.open&&b.staff<b.capacity&&(b.cash+(e.crypto.holders['i:'+d.id]||0)*rate)>=28;});
    if(!d){h.job='rest';m.unpaid++;continue;}
    const b=e.industries[d.id],currency=e.coinMode?b.currency:'ntd';
    if(!settle(e,'i:'+d.id,owner,28,currency,'工资 · '+d.name)){b.reason='无法支付工资 / 兑换池不足';m.unpaid++;continue;}
    const wage=currency==='beta'?toCoins(e,28):28;b[currency==='beta'?'wages':'wagesNT']+=wage;b.staff++;m.workers++;m.wages+=currency==='beta'?wage*rate:wage;h.working=true;if(h.industry!==d.id)event(e,'就业',h.name+' 入职 '+d.name,{resident:h.id,industry:d.id});h.industry=d.id;b.reason='营业中';
    if(e.crypto.enabled&&e.crypto.reserve>0&&h.id%8===0&&h.hunger<3){h.job='mine';h.working=false;b.reason='提供挖矿岗位';continue;}
    if(!e.supply){b.reason='生产开关关闭';continue;}
    if(outputKind(d.sector)){
      let qty=(d.sector==='farm'?5:3)+Math.min(2,b.equipment||0);
      if(d.sector==='farm')qty+=Math.min(2,Math.floor(livestock.length/8));
      if(d.sector==='food'){
        const farm=(bySector.farm||[]).find(q=>e.industries[q.id].open&&e.industries[q.id].stock>0);
        if(!farm||!settle(e,'i:'+d.id,'i:'+farm.id,4,currency,'采购农产品')){b.reason='缺少原料或采购资金';continue;}e.industries[farm.id].stock--;e.industries[farm.id].roundSales+=4;
      }
      qty=Math.min(qty+b.level-1,500-b.stock);b.stock+=qty;b.roundOutput+=qty;m.production+=qty;
      for(const key of Object.keys(b.items))if(b.items[key]<5&&b.stock>0){b.items[key]++;}
    }else {b.roundOutput++;m.services++;}
  }
  // Wholesaling requires a staffed outlet and working transport; stock and payment move together.
  let deliveries=2+workingTransport*3;
  for(const d of ds){const b=e.industries[d.id];if(!b.open||!b.staff||b.stock>=12||!['retail','food','health','leisure'].includes(d.sector))continue;
    const supplier=ds.find(q=>['farm','tools','food'].includes(q.sector)&&q.id!==d.id&&e.industries[q.id].open&&e.industries[q.id].stock>4);
    if(!supplier||!deliveries)continue;const count=Math.min(4,deliveries,e.industries[supplier.id].stock);
    if(settle(e,'i:'+d.id,'i:'+supplier.id,count*4,e.coinMode?b.currency:'ntd','批发及物流')){e.industries[supplier.id].stock-=count;b.stock+=count;deliveries-=count;}
  }
  for(const h of active){
    const owner='h:'+h.id;
    for(const sector of ['food',...(e.round%3===h.id%3?['health','leisure','retail']:[])]){
      const list=(bySector[sector]||[]).filter(d=>{const b=e.industries[d.id];return b.open&&b.staff>0&&b.stock>0;});if(!list.length)continue;
      const d=list[(h.id+e.round)%list.length],b=e.industries[d.id],price=sector==='food'?12:8;
      if(worldService(e,d.id,price,'居民消费 · '+d.name,owner)){b.stock--;b.units++;b.roundSales+=price;if(sector==='food')h.hunger=Math.max(0,h.hunger-2);else h.serviceVisits=(h.serviceVisits||0)+1;}
    }
    // Housing is an occupied asset, not a producer; rent only with a funded household.
    const homes=bySector.housing||[];if(homes.length&&e.round%4===h.id%4){const d=homes[h.id%homes.length];worldService(e,d.id,4,'住房租金',owner);}
  }
  // Civic funding is transferred from business taxes, never fabricated.
  for(const d of ds){const b=e.industries[d.id];const tax=Math.floor(b.roundSales*.08);if(tax&&transfer(e,'i:'+d.id,'bank',tax,'经营税'))m.tax+=tax;
    if(b.cash>=300&&b.staff>=b.capacity&&b.level<5&&transfer(e,'i:'+d.id,'producer',100,'设备扩建')){b.level++;b.capacity++;event(e,'发展',d.name+' 扩建至 '+b.level+' 级');}
  }
  const publics=[...(bySector.public||[]),...(bySector.transport||[])];for(const d of publics){if(e.bank>=28&&e.industries[d.id].cash<56)transfer(e,'bank','i:'+d.id,28,'公共服务预算');}
  // Working animals need feed; vehicles need upkeep. Their service availability feeds next round.
  for(const d of ds){const b=e.industries[d.id];if(b.open&&b.staff&&e.supply)for(const key of Object.keys(b.items))if(b.items[key]<5&&b.stock>0)b.items[key]++;}
  const repair=(bySector.tools||[]).find(d=>e.industries[d.id].open),farm=(bySector.farm||[]).find(d=>e.industries[d.id].open&&e.industries[d.id].stock>0);
  for(const a of assets){
    if(!a.available)continue;
    if(a.kind==='animal'&&farm){const b=e.industries[farm.id];if(e.round%4===a.index%4&&b.stock>0){const budget='asset:'+a.id;if(!e.industries[budget]||worldService(e,farm.id,2,'动物饲料','i:'+budget)){b.stock--;a.fed=e.round;event(e,'资产',a.name+' 已喂食');}}}
    if(a.kind==='vehicle'&&(a.moving||a.assigned)&&repair&&e.round%4===a.index%4){const owner=e.industries['asset:'+a.id]?'i:asset:'+a.id:a.owner==='player'?'player':'i:'+(bySector.transport?.[0]?.id||'market');a.maintained=worldService(e,repair.id,2,'载具维护',owner);event(e,'资产',a.name+(a.maintained?' 完成维护':' 维护费不足'));}
  }
  w.wellbeing=assets.filter(a=>a.kind==='animal'&&['cat','dog'].includes(a.type)&&a.available&&e.round-(a.fed??-10)<5).length;
  if(w.unpaidRewards>0&&e.bank>100){const pay=Math.min(w.unpaidRewards,e.bank-100);if(transfer(e,'bank','player',pay,'结清任务奖励'))w.unpaidRewards-=pay;}
  for(const d of ds){const b=e.industries[d.id];if(b.reason!==b.loggedReason){event(e,'产业',d.name+'：'+b.reason);b.loggedReason=b.reason;}}
  event(e,'轮次','GDP NT$'+m.gdp+' · 就业 '+m.workers+'/'+active.length+' · 产出 '+m.production+' · 未获工资 '+m.unpaid,{gdp:m.gdp,workers:m.workers,production:m.production});
  for(const d of e.pendingDecisions||[])if(e.round>d.round)event(e,'决策反馈',d.message+' 后：就业 '+d.workers+' → '+m.workers+'，GDP '+d.gdp+' → '+m.gdp+'，产出 '+d.production+' → '+m.production+'。这是同期变化，可能受其他事件共同影响。',{decisionId:d.id});
  e.pendingDecisions=(e.pendingDecisions||[]).filter(d=>e.round<=d.round);
  w.totals.production+=m.production;w.totals.sales+=m.sales;w.totals.wages+=m.wages;
  const reasons=[];if(m.unpaid)reasons.push(m.unpaid+' 人未获工资');if(!e.supply)reasons.push('生产已关闭');if(active.some(h=>h.hunger>2))reasons.push('食品供给或居民购买力不足');if(!workingTransport)reasons.push('物流仅有步行运力');w.bottlenecks=reasons;
}
export function snapshotEconomy(e){
  if(!e.world)return;const w=e.world,active=e.households.filter(h=>h.active!==false),m=e.metrics;
  const point={round:e.round,gdp:m.gdp||0,production:m.production||0,sales:m.sales||0,wages:m.wages||0,workers:m.workers||0,population:active.length,unmet:active.filter(h=>h.hunger>0).length,rate:exchangeRate(e),cash:e.player,coins:e.crypto.holders.player,stock:Object.values(e.industries||{}).reduce((n,b)=>n+(b.stock||0),0)};
  const prev=w.history.at(-1);if(prev?.round===e.round)w.history[w.history.length-1]=point;else w.history.push(point);w.history=w.history.slice(-120);return point;
}
