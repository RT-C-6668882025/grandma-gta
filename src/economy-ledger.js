export const cashOf=(e,owner)=>owner==='cryptoEscrow'?(e.cryptoEscrow||0):owner.startsWith('i:')?e.industries?.[owner.slice(2)]?.cash:owner.startsWith('h:')?e.households[+owner.slice(2)]?.cash:e[owner];
function setCash(e,owner,value){if(owner.startsWith('i:'))e.industries[owner.slice(2)].cash=value;else if(owner.startsWith('h:'))e.households[+owner.slice(2)].cash=value;else e[owner]=value;}
export function record(e,from,to,amount,reason){
  event(e,'收支',reason,{from,to,amount,currency:'NT$'});
  e.ledger ||= [];e.flows ||= {};e.sequence=(e.sequence||0)+1;
  e.ledger.unshift({id:e.sequence,round:e.round,from,to,amount,reason});e.ledger.length=Math.min(120,e.ledger.length);
  for(const [owner,type] of [[from,'out'],[to,'in']])if(owner){e.flows[owner] ||= {in:0,out:0};e.flows[owner][type]+=amount;}
}
export function transfer(e,from,to,amount,reason){
  if(typeof from!=='string'||typeof to!=='string'||from===to||!Number.isSafeInteger(amount)||amount<=0)return false;
  const a=cashOf(e,from),b=cashOf(e,to);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<amount||!Number.isSafeInteger(b+amount))return false;
  setCash(e,from,a-amount);setCash(e,to,b+amount);record(e,from,to,amount,reason);return true;
}
export const accountLabel=owner=>({player:'阿嬤',bank:'公庫 / 兌換池',producer:'生產商',shop:'商店',cryptoEscrow:'交易託管','i:market':'菜市場產業','i:shop':'柑仔店產業','i:hardware':'五金行產業','i:clinic':'診所產業','i:recycle':'回收場產業','i:betel':'檳榔攤產業'})[owner]||(/^h:\d+$/.test(owner)?`居民 ${+owner.slice(2)+1}`:'發行');

export function event(e,type,message,details={}){
  e.events ||= [];e.eventSerial=(e.eventSerial||0)+1;
  const row={id:e.eventSerial,round:e.round,type,message,...details};
  e.events.unshift(row);if(e.events.length>10000)e.events.length=10000;return row;
}
export function decision(e,message){
  const row=event(e,'决策',message);
  e.pendingDecisions ||= [];e.pendingDecisions.push({id:row.id,round:e.round,message,workers:e.metrics.workers||0,gdp:e.metrics.gdp||0,production:e.metrics.production||0});
  e.pendingDecisions=e.pendingDecisions.slice(-50);
}
export function issueTo(e,currency,owner,amount){
  if(typeof owner!=='string'||!['ntd','beta'].includes(currency)||!Number.isSafeInteger(amount)||amount<1||amount>1000000)return false;
  if(currency==='ntd'&&e.issued+amount>1000000000||currency==='beta'&&e.crypto.supply+amount>1000000000)return false;
  if(owner.startsWith('i:asset:')&&!e.industries?.[owner.slice(2)]){
    const asset=e.world?.assets.find(a=>'i:asset:'+a.id===owner);if(!asset)return false;
    const id=owner.slice(2);e.industries[id]={cash:0,open:true,currency:'ntd',owner:'player',revenue:0,wages:0,revenueNT:0,wagesNT:0,stock:0,level:1,capacity:0,items:{}};
    e.crypto.holders[owner]=0;e.world.places.push({id,name:asset.name+' 专项账户',sector:'storage',kind:'archive',x:asset.x,z:asset.z});
  }
  if(currency==='ntd'){
    const cash=cashOf(e,owner);if(!Number.isSafeInteger(cash)||e.issued+amount>1000000000||!Number.isSafeInteger(cash+amount))return false;
    e.issued+=amount;setCash(e,owner,cash+amount);record(e,null,owner,amount,'定向增发');
  }else{
    const c=e.crypto;if(!Object.hasOwn(c.holders,owner)||c.supply+amount>1000000000)return false;
    c.supply+=amount;c.minted+=amount;c.holders[owner]+=amount;
    c.issuance.unshift({round:e.round,quantity:amount,destination:owner});c.issuance.length=Math.min(40,c.issuance.length);
  }
  decision(e,'定向增发 '+amount+' '+(currency==='ntd'?'NT$':'GOD')+' → '+owner);return true;
}
