export const cashOf=(e,owner)=>owner==='cryptoEscrow'?(e.cryptoEscrow||0):owner.startsWith('h:')?e.households[+owner.slice(2)]?.cash:e[owner];
function setCash(e,owner,value){if(owner.startsWith('h:'))e.households[+owner.slice(2)].cash=value;else e[owner]=value;}
export function record(e,from,to,amount,reason){
  e.ledger ||= [];e.flows ||= {};e.sequence=(e.sequence||0)+1;
  e.ledger.unshift({id:e.sequence,round:e.round,from,to,amount,reason});e.ledger.length=Math.min(120,e.ledger.length);
  for(const [owner,type] of [[from,'out'],[to,'in']])if(owner){e.flows[owner] ||= {in:0,out:0};e.flows[owner][type]+=amount;}
}
export function transfer(e,from,to,amount,reason){
  if(typeof from!=='string'||typeof to!=='string'||from===to||!Number.isSafeInteger(amount)||amount<=0)return false;
  const a=cashOf(e,from),b=cashOf(e,to);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<amount||!Number.isSafeInteger(b+amount))return false;
  setCash(e,from,a-amount);setCash(e,to,b+amount);record(e,from,to,amount,reason);return true;
}
export const accountLabel=owner=>({player:'阿嬤',bank:'公庫',producer:'生產商',shop:'商店',cryptoEscrow:'交易託管'})[owner]||(/^h:\d+$/.test(owner)?`居民 ${+owner.slice(2)+1}`:'發行');
