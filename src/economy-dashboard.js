import {exchangeRate,setExchangeRate,exchange,investIndustry} from './town-currency.js';
import {fundAll,SECTOR_NAMES} from './world-economy.js';
import {mintCoins} from './crypto-market.js';
import {transfer,issueTo,decision,event} from './economy-ledger.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n||0).toLocaleString();
function chart(history){
  const rows=history.slice(-40),max=Math.max(1,...rows.map(h=>(h.gdp||0)));const points=rows.map((h,i)=>`${10+i*580/Math.max(1,rows.length-1)},${90-(h.gdp||0)/max*70}`).join(' ');
  return `<svg viewBox="0 0 600 104" role="img" aria-label="最近40轮 GDP"><path d="M10 10V90H590" fill="none" stroke="#64748b"/><polyline points="${points}" fill="none" stroke="#6ee7b7" stroke-width="3"/><text x="14" y="20" fill="#ddd" font-size="12">最高 NT$${fmt(max)}</text></svg>`;
}
export function openDevelopment({ui,e,step,save,navigate,teleport,recruit,journal,enableCoins,legacy,issue}){
  let page=0,view='business',lastRows=-1,renderRows;
  ui.panel('小镇发展 · 实时控制台',`
    <div class="note">面板打开时世界继续运行；切后台暂停，不补算离线时间。每轮15秒，可调整模拟速度。</div>
    <div id="developmentStats" class="development-stats"></div><div id="developmentStatus" class="note" role="status"></div>
    <div class="row"><label>速度 <select id="simSpeed">${[1,2,4,8,16].map(n=>`<option value="${n}" ${e.world.speed===n?'selected':''}>${n}×</option>`).join('')}</select></label><button id="devStep">推进一轮</button><button id="devProduction">${e.supply?'停止':'恢复'}生产</button><button id="devSave">存档</button><button id="devLegacy">送货 / 原有功能</button><button id="devJournal">事件日志</button><button id="devRecruit">新增 32 名居民</button></div>
    <details open><summary>汇率与资金</summary>
    <div class="row"><label>汇率模式 <select id="rateMode"><option value="fixed" ${e.ratePolicy?.mode==='fixed'?'selected':''}>手动固定</option><option value="market" ${e.ratePolicy?.mode==='fixed'?'':'selected'}>市场浮动</option></select></label><label>1 GOD = NT$ <input id="manualRate" type="number" min="1" max="100000" step="1" value="${exchangeRate(e)}"></label><button id="applyRate">应用汇率</button></div>
    <div class="note">手动固定后成交不会覆盖结算汇率，工资、购买、兑换立即使用新值。支持整数 1–100000；改汇率不增发资产，公库兑换仍受储备限制。</div>
    <div class="row"><label>资金数量 <input id="fundAmount" type="number" min="1" max="1000000" value="100"></label><label>币种 <select id="fundCurrency"><option value="ntd">NT$</option><option value="beta">GOD</option></select></label></div>
    <div class="acts"><button data-fund="all">平均注资全镇（总额）</button><button data-fund="mint">增发 GOD 给自己</button><button data-fund="reserve">增发矿池</button><button data-fund="buy">买入 GOD</button><button data-fund="sell">卖出 GOD</button><button id="devCoins">${e.coinMode?'当前双币模式':'启用双币结算'}</button></div>
    <div class="row"><input id="issueSearch" placeholder="筛选增发对象"><label>定向增发到 <select id="issueTarget"><option value="player">玩家钱包</option><option value="bank">公库</option>${e.world.places.map(d=>`<option value="i:${esc(d.id)}">产业 · ${esc(d.name)} (${esc(d.id)})</option>`).join('')}${e.households.filter(h=>h.active!==false).map(h=>`<option value="h:${h.id}">居民 · ${esc(h.name)} #${h.id}</option>`).join('')}${e.world.assets.map(a=>`<option value="i:asset:${esc(a.id)}">资产 · ${esc(a.name)} ${esc(a.id)}</option>`).join('')}</select></label><button id="devTargetIssue">按数量和币种增发</button></div>
    <div class="note">只有 NT$ 和 GOD 两种货币。定向增发会增加总发行量；注资只转移已有资金。GDP 使用游戏最终消费口径，剔除批发、换汇和资产转手。</div>
    </details>
    <details open><summary>发展趋势 · GDP</summary><div id="developmentChart"></div></details>
    <div class="row"><select id="entityView" aria-label="查看对象"><option value="business">产业与场地</option><option value="assets">载具 / 动物 / 设施</option><option value="people">居民</option></select><input id="entitySearch" placeholder="搜索名称、行业、ID" aria-label="搜索"><button id="devPrevious">上一页</button><span id="devPage"></span><button id="devNext">下一页</button></div>
    <div id="developmentEntities"></div><details><summary>最近收支</summary><div id="developmentLedger" class="note"></div></details>
  `,root=>{
    root.closest('#panel')?.setAttribute('data-development','true');
    const amount=()=>Number(root.querySelector('#fundAmount').value),currency=()=>root.querySelector('#fundCurrency').value;
    const action=fn=>{const pending=e.pendingDecisions?.length||0,label=document.activeElement?.textContent||'经济操作';const result=fn();if(result!==false&&(e.pendingDecisions?.length||0)===pending)decision(e,label);if(result===false)event(e,'失败',label+'：数值、资金或储备不足');if(result===false)ui.toast('操作失败：数值无效、余额不足或兑换池缺少储备',true);save();lastRows=-1;refresh();};
    root.querySelector('#simSpeed').onchange=ev=>{e.world.speed=Number(ev.target.value);decision(e,'模拟速度改为 '+e.world.speed+' 倍');save();};
    root.querySelector('#devStep').onclick=()=>action(()=>step());
    root.querySelector('#devProduction').onclick=ev=>action(()=>{e.supply=e.supply?0:1;decision(e,e.supply?'恢复生产':'停止生产');ev.target.textContent=e.supply?'停止生产':'恢复生产';});
    root.querySelector('#devLegacy').onclick=legacy;
    root.querySelector('#devJournal').onclick=journal;
    root.querySelector('#devRecruit').onclick=()=>action(recruit);
    root.querySelector('#issueSearch').oninput=ev=>{const q=ev.target.value.trim();const select=root.querySelector('#issueTarget');for(const o of select.options)o.hidden=!!q&&!o.textContent.includes(q);const first=[...select.options].find(o=>!o.hidden);if(first)select.value=first.value;};
    root.querySelector('#devTargetIssue').onclick=()=>action(()=>issueTo(e,currency(),root.querySelector('#issueTarget').value,amount()));
    root.querySelector('#devSave').onclick=()=>{save();ui.toast('已存档');};
    root.querySelector('#applyRate').onclick=()=>action(()=>setExchangeRate(e,root.querySelector('#rateMode').value,Number(root.querySelector('#manualRate').value)));
    root.querySelector('#devCoins').onclick=ev=>action(()=>{enableCoins();ev.target.textContent='当前双币模式';});
    root.querySelectorAll('[data-fund]').forEach(b=>b.onclick=()=>action(()=>{const a=b.dataset.fund;if(a==='all')return fundAll(e,amount(),currency());if(a==='mint'||a==='reserve'){enableCoins();return mintCoins(e,'player',amount(),a==='mint'?'player':'reserve');}enableCoins();return exchange(e,'player',a,amount());}));
    const filtered=()=>{const q=root.querySelector('#entitySearch').value.trim().toLowerCase();let rows=view==='assets'?e.world.assets:view==='people'?e.households.filter(h=>h.active!==false):e.world.places;return rows.filter(d=>[d.id,d.name,d.sector,SECTOR_NAMES[d.sector],d.type].join(' ').toLowerCase().includes(q));};
    renderRows=()=>{
      const all=filtered();page=Math.max(0,Math.min(page,Math.ceil(all.length/20)-1));root.querySelector('#devPage').textContent=`${page+1} / ${Math.max(1,Math.ceil(all.length/20))} · ${all.length} 项`;
      root.querySelector('#developmentEntities').innerHTML=all.slice(page*20,page*20+20).map(d=>{
        const id=esc(d.id);if(view==='people')return `<div class="row"><div><b>${esc(d.name)}</b> · ${esc(d.uid)}<div class="ds">${d.unavailable?'受伤 / 冲突':d.working?'已就业':'待业'} · ${esc(e.world.places.find(b=>b.id===d.industry)?.name||'未分配')} · NT$${fmt(d.cash)} / ${fmt(e.crypto.holders['h:'+d.id])} GOD · 饥饿 ${d.hunger}/10</div></div><button data-nav="${id}">导航</button><button data-teleport="${id}">瞬移</button><button data-budget="h:${id}">增发至此</button></div>`;
        if(view==='assets')return `<div class="row"><div><b>${esc(d.name)}</b> · ${id}<div class="ds">${d.available?'可用':'损坏 / 暂不可用'} · ${d.moving?'运行中':d.assigned?'已编入运输队':'闲置'} · 所有者 ${d.owner==='player'?'玩家':'产业'} · 专项 NT$${fmt(e.industries['asset:'+d.id]?.cash)} / ${fmt(e.crypto.holders['i:asset:'+d.id])} GOD · 估值 NT$${d.price}${d.kind==='animal'?' · 上次饲喂 '+(d.fed??'无'):''}</div></div><div class="acts"><button data-nav="${id}">导航</button><button data-teleport="${id}">瞬移</button><button data-budget="i:asset:${id}">增发至此</button>${d.owner!=='player'?`<button data-asset="${id}">购买</button>`:''}${d.kind==='vehicle'?`<button data-dispatch="${id}">${d.assigned?'撤出运输队':'编入运输队'}</button>`:''}</div></div>`;
        const b=e.industries[d.id];return `<div class="row"><div><b>${esc(d.name)}</b> · ${esc(SECTOR_NAMES[d.sector])}<div class="ds">${id} · NT$${fmt(b.cash)} / ${fmt(e.crypto.holders['i:'+d.id])} GOD · 库存 ${b.stock} · 员工 ${b.staff||0}/${b.capacity} · 等级 ${b.level}<br>${esc(b.reason)} · 本轮产出 ${b.roundOutput||0} / 收入 NT$${b.roundSales||0}</div></div><div class="acts"><button data-nav="${id}">导航</button><button data-teleport="${id}">瞬移</button><button data-invest="${id}">注资</button><button data-budget="i:${id}">增发至此</button><button data-open="${id}">${b.open?'停业':'开业'}</button><button data-currency="${id}">${b.currency==='beta'?'GOD':'NT$'}</button></div></div>`;
      }).join('')||'<div class="note">没有匹配对象</div>';
    };
    root.querySelector('#entityView').onchange=ev=>{view=ev.target.value;page=0;renderRows();};root.querySelector('#entitySearch').oninput=()=>{page=0;renderRows();};
    root.querySelector('#devPrevious').onclick=()=>{page--;renderRows();};root.querySelector('#devNext').onclick=()=>{page++;renderRows();};
    root.querySelector('#developmentEntities').onclick=ev=>{const b=ev.target.closest('button');if(!b)return;const a=b.dataset;
      if(a.budget){const target=root.querySelector('#issueTarget');root.querySelector('#issueSearch').value='';for(const o of target.options)o.hidden=false;target.value=a.budget;target.scrollIntoView({block:'center'});return;}
      if(a.nav||a.teleport){const d=filtered().find(d=>String(d.id)===(a.nav||a.teleport));if(d){ui.close();(a.teleport?teleport:navigate)({...d.location||d,label:d.name});}return;}
      action(()=>{if(a.invest){const ok=investIndustry(e,a.invest,amount(),currency());if(ok)decision(e,'注资 '+a.invest+' '+amount()+' '+(currency()==='beta'?'GOD':'NT$'));return ok;}if(a.open){const f=e.industries[a.open];f.open=!f.open;decision(e,a.open+' '+(f.open?'开业':'停业'));return true;}if(a.currency){enableCoins();const f=e.industries[a.currency];f.currency=f.currency==='ntd'?'beta':'ntd';decision(e,a.currency+' 结算币种改为 '+(f.currency==='beta'?'GOD':'NT$'));return true;}
        const asset=e.world.assets.find(d=>d.id===(a.asset||a.dispatch));if(!asset)return false;
        if(a.asset){if(!transfer(e,'player','i:market',asset.price,'购买 '+asset.name))return false;asset.owner='player';return true;}asset.assigned=!asset.assigned;decision(e,asset.name+(asset.assigned?'加入运输队':'退出运输队'));return true;
      });
    };
    const refresh=()=>{
      if(!root.isConnected)return;const select=root.querySelector('#issueTarget'),known=new Set([...select.options].map(o=>o.value));for(const h of e.households)if(h.active!==false&&!known.has('h:'+h.id)){const o=document.createElement('option');o.value='h:'+h.id;o.textContent='居民 · '+h.name+' #'+h.id;select.append(o);}const w=e.world,m=e.metrics,active=e.households.filter(h=>h.active!==false),staffed=w.places.filter(d=>e.industries[d.id].staff>0).length;
      root.querySelector('#developmentStats').innerHTML=[['轮次',e.round],['下一轮',(Math.max(0,15-e.elapsed)/(e.world.speed||1)).toFixed(1)+' 秒'],['居民',active.length],['就业',`${m.workers||0} / ${active.length}`],['有员工产业',staffed],['登记场地',w.places.length],['功能资产',w.assets.length],['本轮产出',m.production||0],['本轮 GDP','NT$'+fmt(m.gdp)],['累计产出',fmt(w.totals.production)],['你的钱包',`NT$${fmt(e.player)} / ${fmt(e.crypto.holders.player)} GOD`],['结算汇率',`1 GOD = NT$${exchangeRate(e)}`],['市场成交价',e.crypto.price],['兑换池',`NT$${fmt(e.bank)} / ${fmt(e.crypto.holders.bank)} GOD`]].map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('');
      root.querySelector('#developmentStatus').textContent=((w.bottlenecks||[]).join('；')||(e.round?'经济运行中':'等待首轮运行，账户和场景已经接入。'))+(w.unpaidRewards?'；公库待付奖励 NT$'+fmt(w.unpaidRewards):'');
      if(lastRows!==e.round){lastRows=e.round;renderRows();root.querySelector('#developmentChart').innerHTML=chart(w.history);root.querySelector('#developmentLedger').textContent=e.ledger.slice(0,12).map(t=>`${t.round}轮 ${t.from||'发行'} → ${t.to} NT$${t.amount} ${t.reason}`).join('\n');}
    };
    ui.developmentRefresh=refresh;refresh();
  },'development-panel');
  ui.developmentLive=true;
}
