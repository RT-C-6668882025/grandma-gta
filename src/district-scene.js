import * as THREE from 'three';
import {shopState,shopDecision,payrollQuote} from './district.js';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createDistrictScene({scene,camera,ground,ui,getEconomy,navigate,save,unlock}){
 const entries=new Map(),screen=new THREE.Vector3(),geometry=new THREE.BoxGeometry(.65,.65,.65),material=new THREE.MeshLambertMaterial({color:0xc5a362});
 function open(id){const e=getEconomy(),d=e.world.places.find(d=>d.id===id);if(!d)return;unlock();
  ui.panel(d.name+' · 经营',`<label>试验街区店铺 <select id="districtShop">${e.world.district.map(key=>{const place=e.world.places.find(d=>d.id===key);return `<option value="${esc(key)}" ${key===id?'selected':''}>${esc(place.name)}</option>`;}).join('')}</select></label><div id="shopFacts"></div><div class="row"><label>金额 / 每人工资 <input id="shopAmount" type="number" min="1" max="100000" value="100"></label><button data-shop="invest">注资</button><button data-shop="wage">调整工资</button><button data-shop="toggle">开业 / 停业</button><button id="shopGo">导航到店</button><button id="shopLog">日志</button></div><div class="note">试验街区：步行员工到店后才领取本轮工资和生产；前来消费的居民到店后才付款。资金、岗位和到岗人数分别计算。</div>`,root=>{
   root.querySelector('#districtShop').onchange=ev=>open(ev.target.value);
   const refresh=()=>{const b=e.industries[id],commuting=e.households.filter(h=>h.industry===id&&h.job==='commute').length,queue=e.households.filter(h=>h.visit?.industry===id).length;root.querySelector('#shopFacts').innerHTML=`<h3>${shopState(e,id)}</h3><p>资金 NT$${b.cash} / ${e.crypto.holders['i:'+id]||0} GOD · 库存 ${b.stock}</p><p>到岗 ${b.staff||0}/${b.capacity} · 通勤 ${commuting} · 前来消费 ${queue} · 累计到店消费 ${b.visitors||0}</p><p>工资 ${payrollQuote(e,id)} · 本轮收入 NT$${b.roundSales||0} · 本轮产出 ${b.roundOutput||0} · 原因：${esc(b.reason||'等待下一轮')}</p>`;};
   root.querySelectorAll('[data-shop]').forEach(button=>button.onclick=()=>{if(!shopDecision(e,id,button.dataset.shop,Number(root.querySelector('#shopAmount').value)))ui.toast('余额不足或数值无效',true);save();refresh();});
   root.querySelector('#shopGo').onclick=()=>{ui.close();navigate({...d.entrance||d,label:d.name});};root.querySelector('#shopLog').onclick=()=>ui.openDistrictJournal?.(id);ui.developmentRefresh=refresh;refresh();
  },'development-panel');ui.developmentLive=true;
 }
 function update(player){const e=getEconomy();if(!e.world?.district)return;
  const occupied=[];for(const id of [...e.world.district].sort((a,b)=>{const x=e.world.places.find(d=>d.id===a),y=e.world.places.find(d=>d.id===b);return Math.hypot(player.pos.x-x.x,player.pos.z-x.z)-Math.hypot(player.pos.x-y.x,player.pos.z-y.z);})){const d=e.world.places.find(d=>d.id===id),b=e.industries[id],at=d.entrance||d;let entry=entries.get(id);
   if(!entry){const button=document.createElement('button');button.className='shop-world-label';button.onclick=()=>open(id);button.dataset.industry=id;document.body.append(button);const boxes=[];for(let i=0;i<4;i++){const box=new THREE.Mesh(geometry,material);box.position.set(at.x+1+i*.8,ground(at.x,at.z)+.35,at.z);scene.add(box);boxes.push(box);}entry={button,boxes};entries.set(id,entry);}
   const status=shopState(e,id),range=Math.hypot(player.pos.x-at.x,player.pos.z-at.z);screen.set(at.x,ground(at.x,at.z)+3.6,at.z).project(camera);
   entry.button.hidden=!!ui.open||range>85||screen.z< -1||screen.z>1||Math.abs(screen.x)>.9||Math.abs(screen.y)>.75;
   const px=(screen.x*.5+.5)*innerWidth,py=(-screen.y*.5+.5)*innerHeight;if(!entry.button.hidden){if(occupied.length>=3||occupied.some(p=>Math.abs(p.x-px)<205&&Math.abs(p.y-py)<42))entry.button.hidden=true;else occupied.push({x:px,y:py});}
   entry.button.style.left=(screen.x*.5+.5)*innerWidth+'px';entry.button.style.top=(-screen.y*.5+.5)*innerHeight+'px';entry.button.textContent=d.name+' · '+status;entry.button.dataset.state=status;
   entry.boxes.forEach((box,i)=>box.visible=b.open&&range<100&&i<Math.ceil(Math.min(20,b.stock)/5));
  }
 }
 return {update,open};
}
