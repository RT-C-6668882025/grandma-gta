import {transfer,record} from './economy-ledger.js';
import {createCrypto,marketRound,validCrypto} from './crypto-market.js';
export const GOODS={bread:{name:'菠蘿麵包',base:30},soda:{name:'彈珠汽水',base:25},bolida:{name:'寶力大補',base:60}};
export function createEconomy(){return {version:1,round:0,elapsed:0,issued:0,bank:2000,producer:6000,shop:3000,player:1000,cryptoEscrow:0,crypto:createCrypto(),ledger:[],flows:{},sequence:0,metrics:{wages:0,sales:0,production:0,workers:12},households:Array.from({length:12},(_,id)=>({id,cash:250,hunger:0})),stock:{bread:24,soda:24,bolida:12},warehouse:{bread:60,soda:60,bolida:30},supply:1,cargo:0,logs:[]};}
export function totalMoney(e){return e.bank+e.producer+e.shop+e.player+(e.cryptoEscrow||0)+e.households.reduce((n,h)=>n+h.cash,0);}
const log=(e,message)=>{e.logs.unshift({round:e.round,message});e.logs.length=Math.min(16,e.logs.length);};
export function price(e,id){const g=GOODS[id];if(!g)return null;return Math.round(g.base*Math.max(.7,Math.min(2.5,24/(e.stock[id]+8)))*(1+e.issued/15000));}
export function buyGood(e,id,amount){if(!GOODS[id]||e.stock[id]<1||!transfer(e,'player','shop',amount,'購買'+GOODS[id].name))return false;e.stock[id]--;log(e,`阿嬤購買${GOODS[id].name} · NT$${amount}`);return true;}
export function pickupCargo(e){if(e.cargo||e.warehouse.bread<10)return false;e.warehouse.bread-=10;e.cargo=10;log(e,'阿嬤領取 10 份麵包，等待送到柑仔店');return true;}
export function deliverCargo(e){const cost=e.cargo*15,fee=40;if(!e.cargo||e.shop<cost+fee)return false;transfer(e,'shop','producer',cost,'送貨採購');transfer(e,'shop','player',fee,'送貨運費');e.stock.bread+=e.cargo;e.cargo=0;log(e,'阿嬤送貨完成 · 運費 NT$40');return true;}
export function issueMoney(e){if(e.issued>1000000000)return false;e.issued+=1000;e.bank+=1000;record(e,null,'bank',1000,'普通貨幣增發');for(let i=0;i<12;i++)transfer(e,'bank','h:'+i,80,'居民補助');log(e,'增發 NT$1,000 · 居民各領 NT$80，餘款入公庫');return true;}
export function economyRound(e){
  e.round++;e.metrics={wages:0,sales:0,production:0,workers:0};
  for(let i=0;i<12;i++){
    const h=e.households[i],owner='h:'+i;
    const wealthy=e.crypto.enabled && h.cash>600 && e.crypto.holders[owner]*e.crypto.price>2000;
    h.working=!wealthy; // Liquid savings and crypto wealth together determine willingness to work.
    if(h.working&&transfer(e,'producer',owner,28,'工資')){e.metrics.wages+=28;e.metrics.workers++;for(const id of Object.keys(GOODS)){const quantity=Math.min(240-e.warehouse[id],Math.round((id==='bolida'?1:2)*e.supply));e.warehouse[id]+=quantity;e.metrics.production+=quantity;}}
    h.hunger=Math.min(10,h.hunger+1);
  }
  for(const id of Object.keys(GOODS)){const wholesale=Math.round(GOODS[id].base*.5),quantity=Math.max(0,Math.min(24-e.stock[id],e.warehouse[id],Math.floor(e.shop/wholesale)));if(quantity&&transfer(e,'shop','producer',quantity*wholesale,'批發'+GOODS[id].name)){e.stock[id]+=quantity;e.warehouse[id]-=quantity;}}
  let sold=0;
  for(let i=0;i<12;i++){const index=(i+e.round)%12,h=e.households[index],owner='h:'+index;for(const id of h.cash>700?['bread','soda','bolida']:['bread','soda']){const p=price(e,id);if(e.stock[id]>0&&transfer(e,owner,'shop',p,'居民消費'+GOODS[id].name)){e.stock[id]--;e.metrics.sales+=p;sold++;if(id==='bread')h.hunger=Math.max(0,h.hunger-2);}}}
  const dividend=Math.max(0,Math.floor((e.shop-3000)/12));if(dividend)for(let i=0;i<12;i++)transfer(e,'shop','h:'+i,dividend,'商店利潤分紅');
  marketRound(e);
  log(e,`第 ${e.round} 輪 · 消費 ${sold} 件 · 工作 ${e.metrics.workers} 人 · 未滿足需求 ${e.households.filter(h=>h.hunger>0).length} 戶`);
}
export function tickEconomy(e,dt){if(!Number.isFinite(dt)||dt<=0)return;e.elapsed+=Math.min(dt,1);while(e.elapsed>=15-1e-9){e.elapsed=Math.max(0,e.elapsed-15);economyRound(e);}}
export function restoreEconomy(value){
  const fresh=createEconomy();if(!value||value.version!==1)return fresh;
  if(['issued','bank','producer','shop','player','round','cargo'].some(k=>!Number.isSafeInteger(value[k])||value[k]<0)||!Number.isFinite(value.elapsed)||value.elapsed<0||value.elapsed>=15||!Array.isArray(value.households)||value.households.length!==12||value.households.some(h=>!Number.isSafeInteger(h.cash)||h.cash<0||!Number.isSafeInteger(h.hunger)||h.hunger<0||h.hunger>10)||![0,1].includes(value.supply)||![0,10].includes(value.cargo))return fresh;
  for(const key of ['stock','warehouse'])if(Object.keys(GOODS).some(id=>!Number.isSafeInteger(value[key]?.[id])||value[key][id]<0))return fresh;
  const e={...fresh,...value};
  if(!Number.isSafeInteger(totalMoney(e))||totalMoney(e)!==15000+e.issued||!Number.isSafeInteger(e.cryptoEscrow)||e.cryptoEscrow<0||!validCrypto(e))return fresh;
  // Display histories never influence balances; sanitize them independently of the simulation state.
  e.crypto.trades=(Array.isArray(e.crypto.trades)?e.crypto.trades:[]).filter(t=>Number.isSafeInteger(t.price)&&t.price>0&&Number.isSafeInteger(t.quantity)&&t.quantity>0&&Object.hasOwn(e.crypto.holders,t.buyer)&&Object.hasOwn(e.crypto.holders,t.seller)).slice(0,60);
  e.ledger=(Array.isArray(e.ledger)?e.ledger:[]).filter(t=>Number.isSafeInteger(t.amount)&&t.amount>0&&typeof t.reason==='string').slice(0,120);
  e.logs=(Array.isArray(e.logs)?e.logs:[]).filter(t=>typeof t.message==='string').slice(0,16);e.flows={};
  // Rebuild lifetime totals only if the stored values are valid; old saves start recording at migration.
  for(const [owner,flow] of Object.entries(value.flows||{}))if(Number.isSafeInteger(flow?.in)&&flow.in>=0&&Number.isSafeInteger(flow?.out)&&flow.out>=0)e.flows[owner]=flow;
  e.sequence=Number.isSafeInteger(value.sequence)&&value.sequence>=0?value.sequence:0;return e;
}
