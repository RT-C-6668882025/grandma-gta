import {exchangeRate,setExchangeRate,exchange} from './town-currency.js';
import {issueTo,event} from './economy-ledger.js';
import {shopQuote,playerShare,buyShopShares} from './town-agents.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n||0).toLocaleString();
export function openDevelopment({ui,e,save,enableCoins}){
 const shops=e.world.places.filter(d=>e.industries[d.id]?.owner!=='government'&&d.kind!=='archive'&&d.sector!=='public');
 ui.panel('控制台',`
 <div id="controlWallet" class="control-wallet"></div>
 <div class="control-tabs" role="tablist">${[['issue','发币'],['trade','买卖'],['invest','持股'],['rate','汇率']].map(([id,name],i)=>`<button role="tab" aria-selected="${i===0}" data-tab="${id}" aria-controls="control-${id}">${name}</button>`).join('')}</div>
 <section id="control-issue" role="tabpanel"><div class="row"><label>币种 <select id="issueCurrency"><option value="beta">GOD</option><option value="ntd">NT$</option></select></label><label>数量 <input id="issueAmount" type="number" min="1" max="1000000" step="1" value="100"></label></div><div class="row"><label>发给 <select id="issueTarget"><option value="player">自己</option><option value="bank">兑换池</option>${shops.map(d=>`<option value="i:${esc(d.id)}">${esc(d.name)}</option>`).join('')}${e.households.filter(h=>h.active!==false).map(h=>`<option value="h:${h.id}">${esc(h.name)}</option>`).join('')}</select></label><button id="controlIssue">发币</button></div></section>
 <section id="control-trade" role="tabpanel" hidden><label>GOD 数量 <input id="tradeAmount" type="number" min="1" step="1" value="100"></label><p id="tradeQuote"></p><div class="row"><button id="controlBuy">买入 GOD</button><button id="controlSell">卖出 GOD</button></div><p class="note">用 NT$ 买卖 GOD，成交受兑换池余额限制。</p></section>
 <section id="control-invest" role="tabpanel" hidden><div class="row"><label>店铺 <select id="shareShop">${shops.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select></label><label>支付币种 <select id="shareCurrency"><option value="ntd">NT$</option><option value="beta">GOD</option></select></label><label>买入股份 % <input id="sharePercent" type="number" min="1" max="100" step="1" value="10"></label></div><p id="shareQuote"></p><button id="controlInvest">买入股份</button><p class="note">款项付给原持有人，盈利后按持股比例自动分红。</p></section>
 <section id="control-rate" role="tabpanel" hidden><div class="row"><label>1 GOD = NT$ <input id="manualRate" type="number" min="1" max="100000" step="1" value="${exchangeRate(e)}"></label><button id="applyRate">修改汇率</button></div><p class="note">修改后固定使用这个汇率，工资、消费和换汇随之变化。</p></section>
 <div id="controlResult" class="note" role="status" aria-live="polite"></div>
 `,root=>{
 root.closest('#panel')?.setAttribute('data-development','true');
 const get=id=>root.querySelector('#'+id),number=id=>Number(get(id).value);
 const refresh=()=>{if(!root.isConnected)return;get('controlWallet').textContent=`NT$ ${fmt(e.player)}　·　GOD ${fmt(e.crypto.holders.player)}　·　1 GOD = NT$ ${exchangeRate(e)}`;
 get('tradeQuote').textContent=`成交金额：NT$ ${fmt(number('tradeAmount')*exchangeRate(e))}`;
 const id=get('shareShop').value,b=e.industries[id],percent=number('sharePercent'),currency=get('shareCurrency').value;
 if(b){const nt=Math.ceil(shopQuote(e,id)*percent/100),cost=currency==='beta'?Math.ceil(nt/exchangeRate(e)):nt;get('shareQuote').textContent=`已持股 ${playerShare(b)}% · 本次 ${fmt(cost)} ${currency==='beta'?'GOD':'NT$'} · 累计分红 NT$ ${fmt(e.playerDividends)}`;get('controlInvest').disabled=!Number.isSafeInteger(percent)||percent<1||percent+playerShare(b)>100;}else {get('shareQuote').textContent='没有可投资的店铺';get('controlInvest').disabled=true;}};
 const act=(fn,message)=>{enableCoins();const ok=fn();get('controlResult').textContent=ok===false?'未成交：请检查数量、余额或兑换池储备。':message;if(ok===false)event(e,'失败',message+'：数量、余额或储备不足');save();refresh();};
 root.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{root.querySelectorAll('[data-tab]').forEach(b=>{const selected=b===button;b.setAttribute('aria-selected',String(selected));get('control-'+b.dataset.tab).hidden=!selected;});get('controlResult').textContent='';refresh();});
 get('controlIssue').onclick=()=>act(()=>issueTo(e,get('issueCurrency').value,get('issueTarget').value,number('issueAmount')),'已发币，数量和去向已记入日志。');
 get('controlBuy').onclick=()=>act(()=>exchange(e,'player','buy',number('tradeAmount')),'买入完成，钱包已更新。');
 get('controlSell').onclick=()=>act(()=>exchange(e,'player','sell',number('tradeAmount')),'卖出完成，钱包已更新。');
 get('controlInvest').onclick=()=>act(()=>buyShopShares(e,get('shareShop').value,number('sharePercent'),get('shareCurrency').value),'买入股份完成，后续按持股比例自动分红。');
 get('applyRate').onclick=()=>act(()=>setExchangeRate(e,'fixed',number('manualRate')),'汇率已修改，影响继续记入日志。');
 for(const id of ['tradeAmount','shareShop','shareCurrency','sharePercent'])get(id).addEventListener('input',refresh);
 ui.developmentRefresh=refresh;refresh();
 },'development-panel');ui.developmentLive=true;
}
