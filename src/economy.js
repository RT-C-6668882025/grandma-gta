// Small deterministic economy. Money transfers conserve supply; only explicit issuance creates money.
export const GOODS = {bread:{name:'菠蘿麵包',base:30},soda:{name:'彈珠汽水',base:25},bolida:{name:'寶力大補',base:60}};
export function createEconomy() {
  return {version:1,round:0,elapsed:0,issued:0,bank:2000,producer:6000,shop:3000,player:1000,
    households:Array.from({length:12},(_,id)=>({id,cash:250,hunger:0})),
    stock:{bread:24,soda:24,bolida:12},warehouse:{bread:60,soda:60,bolida:30},supply:1,cargo:0,logs:[]};
}
export function totalMoney(e){return e.bank+e.producer+e.shop+e.player+e.households.reduce((n,h)=>n+h.cash,0);}
const log=(e,message)=>{e.logs.unshift({round:e.round,message});e.logs.length=Math.min(16,e.logs.length);};
export function price(e,id){const good=GOODS[id];if(!good)return null;return Math.round(good.base*Math.max(.7,Math.min(2.5,24/(e.stock[id]+8)))*(1+e.issued/15000));}
export function buyGood(e,id,amount){if(!GOODS[id]||e.stock[id]<1||!Number.isSafeInteger(amount)||amount<1||e.player<amount)return false;e.player-=amount;e.shop+=amount;e.stock[id]--;log(e,`阿嬤購買${GOODS[id].name} · NT$${amount}`);return true;}
export function pickupCargo(e){if(e.cargo||e.warehouse.bread<10)return false;e.warehouse.bread-=10;e.cargo=10;log(e,'阿嬤領取 10 份麵包，等待送到柑仔店');return true;}
export function deliverCargo(e){const cost=e.cargo*15,fee=40;if(!e.cargo||e.shop<cost+fee)return false;e.shop-=cost+fee;e.producer+=cost;e.player+=fee;e.stock.bread+=e.cargo;e.cargo=0;log(e,'阿嬤送貨完成 · 運費 NT$40');return true;}
export function issueMoney(e){e.issued+=1000;e.bank+=1000;for(const h of e.households){const n=80;e.bank-=n;h.cash+=n;}log(e,'增發 NT$1,000 · 居民各領 NT$80，餘款入公庫');}
export function economyRound(e){
  e.round++;
  // Workers receive wages while the producer has funds, including temporary production shutdowns.
  for(const h of e.households){const wage=28;if(e.producer>=wage){e.producer-=wage;h.cash+=wage;for(const id of Object.keys(GOODS))e.warehouse[id]=Math.min(240,e.warehouse[id]+Math.round((id==='bolida'?1:2)*e.supply));}h.hunger=Math.min(10,h.hunger+1);}
  // Retail purchases warehouse goods; shortages propagate to prices and unmet needs.
  for(const id of Object.keys(GOODS)){const wholesale=Math.round(GOODS[id].base*.5);const quantity=Math.max(0,Math.min(24-e.stock[id],e.warehouse[id],Math.floor(e.shop/wholesale)));e.stock[id]+=quantity;e.warehouse[id]-=quantity;e.shop-=quantity*wholesale;e.producer+=quantity*wholesale;}
  let sold=0;
  for(let i=0;i<e.households.length;i++){const h=e.households[(i+e.round)%e.households.length];for(const id of ['bread','soda']){const p=price(e,id);if(e.stock[id]>0&&h.cash>=p){h.cash-=p;e.shop+=p;e.stock[id]--;sold++;if(id==='bread')h.hunger=Math.max(0,h.hunger-2);}}}
  // Retail profits return to resident owners, keeping wages and spending circulating.
  const dividend=Math.max(0,Math.floor((e.shop-3000)/12));for(const h of e.households){e.shop-=dividend;h.cash+=dividend;}
  log(e,`第 ${e.round} 輪 · 居民消費 ${sold} 件 · 未滿足需求 ${e.households.filter(h=>h.hunger>0).length} 戶`);
}
export function tickEconomy(e,dt){if(!Number.isFinite(dt)||dt<=0)return;e.elapsed+=Math.min(dt,1);while(e.elapsed>=15-1e-9){e.elapsed=Math.max(0,e.elapsed-15);economyRound(e);}}
export function restoreEconomy(value){
  const fresh=createEconomy();if(!value||value.version!==1)return fresh;
  const money=['issued','bank','producer','shop','player','round','cargo'];
  if(money.some(k=>!Number.isSafeInteger(value[k])||value[k]<0)||!Number.isFinite(value.elapsed)||value.elapsed<0||value.elapsed>=15||!Array.isArray(value.households)||value.households.length!==12||value.households.some(h=>!Number.isSafeInteger(h.cash)||h.cash<0||!Number.isSafeInteger(h.hunger)||h.hunger<0)||![0,1].includes(value.supply)||![0,10].includes(value.cargo))return fresh;
  for(const key of ['stock','warehouse'])if(Object.keys(GOODS).some(id=>!Number.isSafeInteger(value[key]?.[id])||value[key][id]<0))return fresh;
  const e={...fresh,...value,logs:[]};if(!Number.isFinite(totalMoney(e))||Math.abs(totalMoney(e)-(15000+e.issued))>.001)return fresh;return e;
}
