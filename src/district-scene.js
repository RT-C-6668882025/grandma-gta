import {regionAt} from './city-regions.js';
import * as THREE from 'three';
import {shopState} from './district.js';
import {ensureAgents,ownerName,shopQuote,interveneShop,governmentAction,sourcecoreAction} from './town-agents.js';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createDistrictScene({scene,camera,ground,ui,getEconomy,navigate,save,unlock}){
 const entries=new Map(),screen=new THREE.Vector3();
 function open(id){const e=getEconomy();ensureAgents(e);const d=e.world.places.find(d=>d.id===id);if(!d)return;unlock();const gov=id==='civic';
  ui.panel(regionAt(d.x,d.z).name+' · '+d.name+(gov?' · 政府':' · 店铺'),`<div class="row"><select id="districtShop">${[...new Set([...(e.world.district||[]),id,'civic'])].map(key=>{const place=e.world.places.find(d=>d.id===key);return `<option value="${esc(key)}" ${key===id?'selected':''}>${esc(place.name)}</option>`;}).join('')}</select></div><div id="shopFacts"></div><div class="acts">${gov?'<button data-government="support">扶持 · NT$100</button><button id="policyChoices">推动政策</button><button id="leaderChoices">更换执政者</button>':'<button data-shop="support">扶持 · NT$100</button><button data-shop="acquire" id="acquireShop">收购</button><button data-shop="withdraw" id="withdrawShop">撤资</button>'}</div><div id="sourcecoreControls"></div><div id="governmentChoices" class="acts"></div><div class="row"><button id="shopGo">${gov?'导航到市政厅':'导航到店'}</button><button id="shopLog">日志</button></div><div class="note">${gov?'政府自动收税、补贴居民、安排公共岗位；满意度过低会出现抗议、停工和政府更替。':'经营者自动招聘、采购与扩建，控股人自动领取分红。扶持不是购买股份；撤资最多取回仍留在店内的扶持资金。'}</div>`,root=>{
   root.querySelector('#districtShop').onchange=ev=>open(ev.target.value);
   const refresh=()=>{const b=e.industries[id],g=e.government,queue=e.households.filter(h=>h.visit?.industry===id).length;
    root.querySelector('#shopFacts').innerHTML=gov?`<h3>${g.protest?'居民抗议中':'小镇治理中'}</h3><p>执政者：${esc(e.households[g.leader]?.name||'市政委员会')} · ${esc(g.style)}取向 · 第 ${g.term} 届</p><p>满意度 ${g.approval}/100 · 当前政策：${esc(g.policy)}</p><p>公库 NT$${b.cash} / ${e.crypto.holders['i:civic']||0} GOD · 本轮税收 NT$${e.metrics.tax||0}</p>`:`<h3>${shopState(e,id)}</h3><p>控股人：${esc(ownerName(e,b))} · 员工 ${b.staff||0}/${b.capacity} · 前来消费 ${queue} 人</p><p>库存 ${b.stock} · 本轮经营利润 NT$${b.profit||0} · ${b.level} 级店铺</p><details><summary>店铺详情</summary><p>资金 NT$${b.cash} / ${e.crypto.holders['i:'+id]||0} GOD · 本轮产出 ${b.roundOutput||0} · ${esc(b.reason||'等待经营')}</p></details>`;
    if(!gov){const p=b.sourcecore,host=root.querySelector('#sourcecoreControls');host.innerHTML=`<p>源核合作：${p?(p.active?'已落地 · 生产岗位增产 2 / 工资 +NT$2':'试用 '+p.progress+'/3'):'未授权'}${p?' · 累计授权收益 NT$'+p.royalties:''}</p><button id="sourcecoreAction">${p?'终止合作':'授权试用 · NT$100'}</button><div class="note">3 个有员工实际完成生产或服务的轮次后落地，正经营利润的 10% 自动付给你；缺人或停业会暂停。投入进入店铺账户，终止不退还已用资金。</div>`;host.querySelector('button').onclick=()=>act(()=>sourcecoreAction(e,id),'源核合作已更新，进度与收益记入日志');const acquire=root.querySelector('#acquireShop');acquire.textContent=b.owner==='player'?'已由你控股':'收购 · NT$'+shopQuote(e,id);acquire.disabled=b.owner==='player';const withdraw=root.querySelector('#withdrawShop');withdraw.textContent='撤资 · NT$'+Math.min(b.support||0,b.cash);withdraw.disabled=!Math.min(b.support||0,b.cash);}
   };
   const act=(fn,message)=>{const ok=fn();ui.toast(ok?message:'资金不足，操作未执行',!ok);save();refresh();};
   root.querySelectorAll('[data-shop]').forEach(button=>button.onclick=()=>act(()=>interveneShop(e,id,button.dataset.shop),'已干预，经营者将自动行动'));
   root.querySelectorAll('[data-government]').forEach(button=>button.onclick=()=>act(()=>governmentAction(e,button.dataset.government),'政府收到扶持，将安排支出'));
   if(gov){const choices=(values)=>{const host=root.querySelector('#governmentChoices');host.innerHTML=values.map(v=>`<button>${v}</button>`).join('');[...host.children].forEach((button,i)=>button.onclick=()=>{act(()=>governmentAction(e,values[i]),'政府安排已更新');host.innerHTML='';});};root.querySelector('#policyChoices').onclick=()=>choices(['减税','补贴','治安']);root.querySelector('#leaderChoices').onclick=()=>choices(['发展','民生','强硬']);}
   root.querySelector('#shopGo').onclick=()=>{ui.close();navigate({...d.entrance||d,label:d.name});};root.querySelector('#shopLog').onclick=()=>ui.openDistrictJournal?.(id);ui.developmentRefresh=refresh;refresh();
  },'development-panel');ui.developmentLive=true;
 }
 function update(player){const e=getEconomy();if(!e.world?.district)return;
  const occupied=[];for(const id of [...e.world.district,'civic'].sort((a,b)=>{const x=e.world.places.find(d=>d.id===a),y=e.world.places.find(d=>d.id===b);return Math.hypot(player.pos.x-x.x,player.pos.z-x.z)-Math.hypot(player.pos.x-y.x,player.pos.z-y.z);})){const d=e.world.places.find(d=>d.id===id),b=e.industries[id],at=d.entrance||d;let entry=entries.get(id);
   if(!entry){const button=document.createElement('button');button.className='shop-world-label';button.onclick=()=>open(id);button.dataset.industry=id;document.body.append(button);entry={button};entries.set(id,entry);}
   const status=id==='civic'?(e.government?.protest?'居民抗议':'满意度 '+e.government?.approval):shopState(e,id),range=Math.hypot(player.pos.x-at.x,player.pos.z-at.z);screen.set(at.x,ground(at.x,at.z)+3.6,at.z).project(camera);
   entry.button.hidden=!!ui.open||range>85||screen.z< -1||screen.z>1||Math.abs(screen.x)>.9||Math.abs(screen.y)>.75;
   const px=(screen.x*.5+.5)*innerWidth,py=(-screen.y*.5+.5)*innerHeight;if(!entry.button.hidden){if(occupied.length>=3||occupied.some(p=>Math.abs(p.x-px)<205&&Math.abs(p.y-py)<42))entry.button.hidden=true;else occupied.push({x:px,y:py});}
   entry.button.style.left=(screen.x*.5+.5)*innerWidth+'px';entry.button.style.top=(-screen.y*.5+.5)*innerHeight+'px';entry.button.textContent=regionAt(d.x,d.z).name+' · '+d.name+' · '+ownerName(e,b)+' · '+status;entry.button.dataset.state=status;
  }
 }
 return {update,open};
}
