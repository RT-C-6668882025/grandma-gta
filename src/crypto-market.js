import {cashOf,transfer} from './economy-ledger.js';
export const INITIAL_COINS=2100;
export function createCrypto(){return {enabled:false,supply:INITIAL_COINS,price:10,previous:10,serial:0,volume:0,holders:{player:100,bank:150,...Object.fromEntries(Array.from({length:12},(_,i)=>['h:'+i,[400,300,200,150][i]||100]))},orders:[],trades:[]};}
export function totalCoins(c){return Object.values(c.holders).reduce((a,b)=>a+b,0)+c.orders.filter(o=>o.side==='sell').reduce((a,o)=>a+o.quantity,0);}
export function cancelOrder(e,id,owner){const c=e.crypto,o=c.orders.find(o=>o.id===id&&o.owner===owner);if(!o)return false;if(o.side==='buy')transfer(e,'cryptoEscrow',owner,o.quantity*o.price,'撤銷買單退款');else c.holders[owner]+=o.quantity;c.orders=c.orders.filter(x=>x!==o);return true;}
export function setCryptoEnabled(e,on){if(!on)for(const o of [...e.crypto.orders])cancelOrder(e,o.id,o.owner);e.crypto.enabled=!!on;}
export function placeOrder(e,owner,side,quantity,price){
  const c=e.crypto;if(!c.enabled||!Object.hasOwn(c.holders,owner)||!['buy','sell'].includes(side)||!Number.isSafeInteger(quantity)||quantity<1||quantity>c.supply||!Number.isSafeInteger(price)||price<1||price>100000||c.orders.filter(o=>o.owner===owner).length>=10)return {ok:false,error:'訂單無效或超過 10 筆未成交訂單'};
  if(side==='buy'){if(!transfer(e,owner,'cryptoEscrow',quantity*price,'買單資金託管'))return {ok:false,error:'可用小鎮貨幣不足'};}else{if(c.holders[owner]<quantity)return {ok:false,error:'可用持幣不足'};c.holders[owner]-=quantity;}
  const id=++c.serial;c.orders.push({id,owner,side,quantity,price});matchOrders(e);return {ok:true,id};
}
export function matchOrders(e){
  const c=e.crypto;if(!c.enabled)return;
  for(let n=0;n<200;n++){
    const bids=c.orders.filter(o=>o.side==='buy').sort((a,b)=>b.price-a.price||a.id-b.id),asks=c.orders.filter(o=>o.side==='sell').sort((a,b)=>a.price-b.price||a.id-b.id);
    let bid,ask;for(const b of bids){const a=asks.find(a=>a.price<=b.price&&a.owner!==b.owner);if(a){bid=b;ask=a;break;}}
    if(!bid)break;
    const quantity=Math.min(bid.quantity,ask.quantity),price=bid.id<ask.id?bid.price:ask.price;
    if(!transfer(e,'cryptoEscrow',ask.owner,quantity*price,'BETA 成交貨款'))throw new Error('交易託管餘額不一致');
    const refund=quantity*(bid.price-price);if(refund&&!transfer(e,'cryptoEscrow',bid.owner,refund,'成交價差退款'))throw new Error('交易退款餘額不一致');
    c.holders[bid.owner]+=quantity;bid.quantity-=quantity;ask.quantity-=quantity;c.previous=c.price;c.price=price;c.volume+=quantity;
    c.trades.unshift({round:e.round,buyer:bid.owner,seller:ask.owner,quantity,price});c.trades.length=Math.min(60,c.trades.length);c.orders=c.orders.filter(o=>o.quantity>0);
  }
}
export function marketRound(e){
  const c=e.crypto;if(!c.enabled)return;
  for(const o of [...c.orders])if(o.owner!=='player')cancelOrder(e,o.id,o.owner);
  for(let n=0;n<12;n++){
    const i=(n+e.round)%12,owner='h:'+i,h=e.households[i],coins=c.holders[owner],p=c.price;
    const reserve=100,phase=(e.round+i)%5;
    if(coins && (h.cash<reserve||h.hunger>1||phase<2))placeOrder(e,owner,'sell',Math.min(coins,h.cash<reserve?10:3),Math.max(1,p+(h.cash<reserve?-1:phase-1)));
    else if(h.cash>reserve+2*p)placeOrder(e,owner,'buy',Math.min(5,Math.floor((h.cash-reserve)*.2/Math.max(1,p+1))),Math.max(1,p+(phase===4?1:-1)));
  }
}
export function validCrypto(e){
  const c=e.crypto,owners=['player','bank',...Array.from({length:12},(_,i)=>'h:'+i)];
  if(!c||typeof c.enabled!=='boolean'||c.supply!==INITIAL_COINS||!Number.isSafeInteger(c.price)||c.price<1||c.price>100000||!Number.isSafeInteger(c.serial)||c.serial<0||!Number.isSafeInteger(c.volume)||c.volume<0||!c.holders||Object.keys(c.holders).length!==14||owners.some(k=>!Number.isSafeInteger(c.holders[k])||c.holders[k]<0)||!Array.isArray(c.orders)||c.orders.length>140)return false;
  const ids=new Set();for(const o of c.orders){if(!owners.includes(o.owner)||!['buy','sell'].includes(o.side)||!Number.isSafeInteger(o.id)||o.id<1||o.id>c.serial||ids.has(o.id)||!Number.isSafeInteger(o.price)||o.price<1||o.price>100000||!Number.isSafeInteger(o.quantity)||o.quantity<1||o.quantity>INITIAL_COINS)return false;ids.add(o.id);}
  return totalCoins(c)===INITIAL_COINS&&e.cryptoEscrow===c.orders.filter(o=>o.side==='buy').reduce((n,o)=>n+o.quantity*o.price,0)&& (c.enabled||c.orders.length===0);
}
