// Reuse town businesses. This module adds settlement rules, never new geometry.
export const INDUSTRIES=[
  {id:'market',name:'菜市場生產合作社',kind:'production',x:-60,z:-40},
  {id:'shop',name:'阿桃柑仔店',kind:'retail',x:-24,z:-13},
  {id:'hardware',name:'金興五金行',kind:'service',x:18,z:-13},
  {id:'clinic',name:'仁愛診所',kind:'service',x:-128,z:13},
  {id:'recycle',name:'回收場',kind:'service',x:140,z:36},
  {id:'betel',name:'檳榔攤',kind:'service',x:214,z:44},
];
export function ensureIndustries(e){
  e.industries ||= {};
  for(const d of INDUSTRIES){e.industries[d.id] ||= {owner:'player',open:true,revenue:0,wages:0};e.crypto.holders['i:'+d.id] ??= 0;}
  for(const h of e.households)h.industry=INDUSTRIES[h.id%INDUSTRIES.length].id;
  e.coinLedger ||= [];e.coinSequence ||= 0;
}
export function coinTransfer(e,from,to,amount,reason){
  const c=e.crypto;
  if(from===to||!Number.isSafeInteger(amount)||amount<=0||!Object.hasOwn(c.holders,from)||!Object.hasOwn(c.holders,to)||c.holders[from]<amount||!Number.isSafeInteger(c.holders[to]+amount))return false;
  c.holders[from]-=amount;c.holders[to]+=amount;
  const identity=k=>k.startsWith('h:')?e.households[Number(k.slice(2))]?.uid||k:k;
  e.coinSequence=(e.coinSequence||0)+1;e.coinLedger ||= [];
  e.coinLedger.unshift({id:e.coinSequence,round:e.round,from:identity(from),to:identity(to),amount,reason});e.coinLedger.length=Math.min(120,e.coinLedger.length);return true;
}
export const coinPrice=(e,id)=>Math.max(1,Math.round(({bread:2,soda:2,bolida:4})[id]*Math.max(.7,Math.min(2.5,24/(e.stock[id]+8)))));
export function investIndustry(e,id,amount=100){ensureIndustries(e);return !!e.industries[id]&&coinTransfer(e,'player','i:'+id,amount,'產業注資');}
export function buyWithCoins(e,owner,id){
  ensureIndustries(e);if(!e.industries.shop.open||!Object.hasOwn(e.stock,id)||e.stock[id]<1)return false;
  const p=coinPrice(e,id);if(!coinTransfer(e,owner,'i:shop',p,'購買 '+id))return false;
  e.stock[id]--;e.industries.shop.revenue+=p;e.metrics.sales+=p;return true;
}
export function coinEconomyRound(e){
  ensureIndustries(e);
  for(const h of e.households){
    const owner='h:'+h.id;h.hunger=Math.min(10,h.hunger+1);
    h.industry=INDUSTRIES[h.id%INDUSTRIES.length].id;
    const b=e.industries[h.industry];
    if(h.working&&h.present!==false&&b.open&&coinTransfer(e,'i:'+h.industry,owner,2,'工資')){
      b.wages+=2;e.metrics.wages+=2;e.metrics.workers++;
      if(h.industry==='market')for(const id of Object.keys(e.stock)){const q=Math.max(0,Math.min(240-e.warehouse[id],Math.round((id==='bolida'?1:2)*e.supply)));e.warehouse[id]+=q;e.metrics.production+=q;}
    }
  }
  if(e.industries.shop.open&&e.industries.market.open)for(const id of Object.keys(e.stock)){
    const q=Math.max(0,Math.min(e.households.length*2-e.stock[id],e.warehouse[id],e.crypto.holders['i:shop']));
    if(q&&coinTransfer(e,'i:shop','i:market',q,'批發 '+id)){e.stock[id]+=q;e.warehouse[id]-=q;e.industries.market.revenue+=q;}
  }
  for(let n=0;n<e.households.length;n++){
    const h=e.households[(n+e.round)%e.households.length],owner='h:'+h.id;
    if(h.hunger>0&&buyWithCoins(e,owner,'bread'))h.hunger=Math.max(0,h.hunger-2);
    if(e.crypto.holders[owner]>6)buyWithCoins(e,owner,'soda');
    if(e.round%5===h.id%5){const id=['hardware','clinic','recycle','betel'][h.id%4],b=e.industries[id];if(b.open&&coinTransfer(e,owner,'i:'+id,1,'居民服務消費')){b.revenue++;h.serviceVisits=(h.serviceVisits||0)+1;}}
  }
}
