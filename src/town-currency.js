// Reuse town businesses. This module adds settlement rules, never new geometry.
import {cashOf,transfer,event,decision} from './economy-ledger.js';
export const INDUSTRIES=[
  {id:'market',name:'菜市場生產合作社',kind:'production',x:-60,z:-40},
  {id:'shop',name:'阿桃柑仔店',kind:'retail',x:-24,z:-13},
  {id:'hardware',name:'金興五金行',kind:'service',x:18,z:-13},
  {id:'clinic',name:'仁愛診所',kind:'service',x:-128,z:13},
  {id:'recycle',name:'回收場',kind:'service',x:140,z:36},
  {id:'betel',name:'檳榔攤',kind:'service',x:214,z:44},
];
export const industriesOf=e=>e.world?.enabled?e.world.places:INDUSTRIES;
export function ensureIndustries(e){
  e.industries ||= {};
  for(const d of industriesOf(e)){e.industries[d.id] ||= {owner:'player',open:true,revenue:0,wages:0};const b=e.industries[d.id];b.cash ??= 0;b.currency=b.currency==='ntd'?'ntd':'beta';b.revenueNT ??= 0;b.wagesNT ??= 0;e.crypto.holders['i:'+d.id] ??= 0;}
  if(!e.world?.enabled)for(const h of e.households)h.industry=INDUSTRIES[h.id%INDUSTRIES.length].id;
  e.coinLedger ||= [];e.coinSequence ||= 0;
}
export function coinTransfer(e,from,to,amount,reason){
  const c=e.crypto;
  if(from===to||!Number.isSafeInteger(amount)||amount<=0||!Object.hasOwn(c.holders,from)||!Object.hasOwn(c.holders,to)||c.holders[from]<amount||!Number.isSafeInteger(c.holders[to]+amount))return false;
  event(e,'收支',reason,{from,to,amount,currency:'GOD'});
  c.holders[from]-=amount;c.holders[to]+=amount;
  const identity=k=>k.startsWith('h:')?e.households[Number(k.slice(2))]?.uid||k:k;
  e.coinSequence=(e.coinSequence||0)+1;e.coinLedger ||= [];
  e.coinLedger.unshift({id:e.coinSequence,round:e.round,from:identity(from),to:identity(to),amount,reason});e.coinLedger.length=Math.min(120,e.coinLedger.length);return true;
}
export const exchangeRate=e=>e.ratePolicy?.mode==='fixed'?e.ratePolicy.value:e.crypto.price;
export function setExchangeRate(e,mode,value){
  if(!['fixed','market'].includes(mode)||mode==='fixed'&&(!Number.isSafeInteger(value)||value<1||value>100000))return false;
  const previous=exchangeRate(e);decision(e,'汇率 '+previous+' → '+(mode==='fixed'?value:e.crypto.price)+'（'+(mode==='fixed'?'固定':'市场')+'）');e.ratePolicy={mode,value:mode==='fixed'?value:e.crypto.price};
  e.rateHistory ||= [];e.rateHistory.unshift({round:e.round,mode,previous,value:exchangeRate(e)});e.rateHistory.length=Math.min(60,e.rateHistory.length);return true;
}
export const toCoins=(e,nt)=>Math.max(1,Math.ceil(nt/exchangeRate(e)));
export const fiatPrice=(e,id)=>Math.round(({bread:30,soda:25,bolida:60})[id]*Math.max(.7,Math.min(2.5,24/(e.stock[id]+8)))*(1+e.issued/15000));
export const coinPrice=(e,id)=>toCoins(e,fiatPrice(e,id));
export const shopCurrency=e=>e.coinMode?(e.industries?.shop?.currency||'beta'):'ntd';
export const paymentBalance=(e,owner,currency)=>currency==='beta'?e.crypto.holders[owner]:cashOf(e,owner);
export function exchange(e,owner,side,quantity){
  const c=e.crypto,rate=exchangeRate(e),nt=quantity*rate;
  if(!c.enabled||owner==='bank'||!Object.hasOwn(c.holders,owner)||!['buy','sell'].includes(side)||!Number.isSafeInteger(quantity)||quantity<=0||!Number.isSafeInteger(nt)||nt<=0)return false;
  const from=side==='buy'?owner:'bank',to=side==='buy'?'bank':owner,coinFrom=side==='buy'?'bank':owner,coinTo=side==='buy'?owner:'bank';
  if(!Number.isSafeInteger(cashOf(e,from))||!Number.isSafeInteger(cashOf(e,to))||cashOf(e,from)<nt||!Number.isSafeInteger(cashOf(e,to)+nt)||c.holders[coinFrom]<quantity||!Number.isSafeInteger(c.holders[coinTo]+quantity))return false;
  transfer(e,from,to,nt,'兌換 '+quantity+' GOD @ '+rate);
  coinTransfer(e,coinFrom,coinTo,quantity,'兌換 NT$'+nt+' @ '+rate);
  e.exchanges ||= [];e.exchanges.unshift({round:e.round,owner,side,quantity,rate,nt});e.exchanges.length=Math.min(60,e.exchanges.length);return true;
}
export function ensurePayment(e,owner,currency,amount){
  if(!Number.isSafeInteger(amount)||amount<=0||!['ntd','beta'].includes(currency))return false;
  const balance=paymentBalance(e,owner,currency);if(!Number.isSafeInteger(balance))return false;if(balance>=amount)return true;
  const quantity=currency==='beta'?amount-balance:Math.ceil((amount-balance)/exchangeRate(e));
  return exchange(e,owner,currency==='beta'?'buy':'sell',quantity);
}
export function canPay(e,owner,currency,amount){
  if(!Number.isSafeInteger(amount)||amount<=0)return false;
  const balance=paymentBalance(e,owner,currency);if(!Number.isSafeInteger(balance))return false;if(balance>=amount)return true;if(!e.crypto.enabled)return false;
  const qty=currency==='beta'?amount-balance:Math.ceil((amount-balance)/exchangeRate(e));
  return currency==='beta'?e.crypto.holders.bank>=qty&&cashOf(e,owner)>=qty*exchangeRate(e):e.crypto.holders[owner]>=qty&&e.bank>=qty*exchangeRate(e);
}
export function deliverWithCurrency(e){
  ensureIndustries(e);const currency=shopCurrency(e),cost=currency==='beta'?toCoins(e,e.cargo*15):e.cargo*15,fee=currency==='beta'?toCoins(e,40):40;
  if(!e.cargo||!e.industries.shop.open||!Number.isSafeInteger(paymentBalance(e,'i:market',currency)+cost)||!Number.isSafeInteger(paymentBalance(e,'player',currency)+fee)||!ensurePayment(e,'i:shop',currency,cost+fee))return false;
  const pay=currency==='beta'?coinTransfer:transfer;pay(e,'i:shop','i:market',cost,'送貨採購');pay(e,'i:shop','player',fee,'送貨運費');
  e.industries.market[currency==='beta'?'revenue':'revenueNT']+=cost;e.stock.bread+=e.cargo;e.cargo=0;return true;
}
export function settle(e,from,to,nt,currency,reason){
  const amount=currency==='beta'?toCoins(e,nt):nt;
  if(from===to||!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(paymentBalance(e,to,currency))||!Number.isSafeInteger(paymentBalance(e,to,currency)+amount)||!ensurePayment(e,from,currency,amount))return false;
  return currency==='beta'?coinTransfer(e,from,to,amount,reason):transfer(e,from,to,amount,reason);
}
export function investIndustry(e,id,amount=100,currency='beta'){ensureIndustries(e);if(!e.industries[id]||!['ntd','beta'].includes(currency))return false;return currency==='beta'?coinTransfer(e,'player','i:'+id,amount,'產業注資'):transfer(e,'player','i:'+id,amount,'產業注資');}
export function buyWithCoins(e,owner,id){
  ensureIndustries(e);if(!e.industries.shop.open||!Object.hasOwn(e.stock,id)||e.stock[id]<1)return false;
  const currency=shopCurrency(e),nt=fiatPrice(e,id),p=currency==='beta'?toCoins(e,nt):nt;if(!settle(e,owner,'i:shop',nt,currency,'購買 '+id))return false;
  e.stock[id]--;e.industries.shop[currency==='beta'?'revenue':'revenueNT']+=p;e.metrics.sales+=currency==='beta'?p*exchangeRate(e):p;return true;
}
export function coinEconomyRound(e){
  ensureIndustries(e);
  for(const h of e.households){
    const owner='h:'+h.id;h.hunger=Math.min(10,h.hunger+1);
    h.industry=INDUSTRIES[h.id%INDUSTRIES.length].id;
    const b=e.industries[h.industry];
    if(h.working&&h.present!==false&&b.open&&settle(e,'i:'+h.industry,owner,28,b.currency,'工資')){
      const wage=b.currency==='beta'?toCoins(e,28):28;b[b.currency==='beta'?'wages':'wagesNT']+=wage;e.metrics.wages+=b.currency==='beta'?wage*exchangeRate(e):wage;e.metrics.workers++;
      if(h.industry==='market')for(const id of Object.keys(e.stock)){const q=Math.max(0,Math.min(240-e.warehouse[id],Math.round((id==='bolida'?1:2)*e.supply)));e.warehouse[id]+=q;e.metrics.production+=q;}
    }
  }
  if(e.industries.shop.open&&e.industries.market.open)for(const id of Object.keys(e.stock)){
    const currency=e.industries.market.currency,unit=Math.round(({bread:30,soda:25,bolida:60})[id]*.5),q=Math.max(0,Math.min(e.households.length*2-e.stock[id],e.warehouse[id]));
    // One item at a time avoids refusing a small affordable partial restock.
    for(let n=0;n<q;n++){if(!settle(e,'i:shop','i:market',unit,currency,'批發 '+id))break;e.stock[id]++;e.warehouse[id]--;e.industries.market[currency==='beta'?'revenue':'revenueNT']+=currency==='beta'?toCoins(e,unit):unit;}
  }
  for(let n=0;n<e.households.length;n++){
    const h=e.households[(n+e.round)%e.households.length],owner='h:'+h.id;
    if(h.hunger>0&&buyWithCoins(e,owner,'bread'))h.hunger=Math.max(0,h.hunger-2);
    if(e.crypto.holders[owner]*exchangeRate(e)+h.cash>60)buyWithCoins(e,owner,'soda');
    if(e.round%5===h.id%5){const id=['hardware','clinic','recycle','betel'][h.id%4],b=e.industries[id];if(b.open&&settle(e,owner,'i:'+id,10,b.currency,'居民服務消費')){b[b.currency==='beta'?'revenue':'revenueNT']+=b.currency==='beta'?toCoins(e,10):10;h.serviceVisits=(h.serviceVisits||0)+1;}}
  }
}
