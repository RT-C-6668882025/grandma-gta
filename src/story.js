import {tradeItem,recordHarvest,worldService} from './world-economy.js';
import { GOODS, buyGood } from './economy.js';
import { DANCE_MUSIC } from './audio.js';
// Town life and missions. Missions are async scripts: they await lines of
// dialogue (MiMo voice + subtitles), arrivals, fights and timers. The tick
// loop resolves the waits. Chapter 1 — 「番薯寮的一天」:
//   0 生日的早晨   family scene at home
//   1 送報紙       bicycle paper round for the lazy son
//   2 柑仔店的禮物 sunglasses from 阿水伯, first cigarette, how shops work
//   3 菜市場保護費 thugs shaking down the vegetable seller
//   4 追存摺       scammers took 阿水伯's passbook — steal a car, chase
//   5 阿嬤開小黃   taxi fares
//   6 廣場舞大賽   sunset contest at the community court vs the qipao troupe, love scene
// Side activities: taxi, recycling, garden, lottery, family chat, praying.

import * as THREE from 'three';
import { ents, env, Player, NPC, Animal, spawnPickup, pickups, spawnProjectile } from './entities.js';
import { Vehicle, vehicles, trafficBrain, VTYPES } from './vehicles.js';
import { heightAt } from './world/terrain.js';
import { P, PAPER_ROUTE, FARES, GARDEN } from './world/layout.js';
import { doors, spawnSpots, parkSpots, seats, cardboard, court } from './world/town.js';
import { G, emit, on, give, count, addMoney, spend, addWanted, swag, priceOf, sellPrice, equip } from './game.js';
import { ITEMS, SHOP_STOCK, BUYS } from './gear.js';
import { ui, blips } from './ui.js';
import { clamp } from './util.js';
import { chapter2 } from './chapter2.js';
import { PEN, buildPen, tickGoose, gooseInteract, initGoose, gooseGame } from './goose.js';

let ctx = null; // { player, sky, audio, scene, orbit }
let LINES = {};
export const npcs = {};
const SPEAKER = {
  ama: ['秀琴阿嬤', '#ff8ac0'], agong: ['阿水伯', '#8ad0ff'], son: ['阿明', '#f2c230'], shop: ['阿桃姨', '#ffb070'], thug: ['流氓', '#ff6060'],
  cop: ['老林警員', '#6ab0ff'], mc: ['主持人', '#ffd24a'], jinya: ['金牙伯', '#ffd700'], dj: ['電台主持人', '#c0c0c0'], meiling: ['美玲姐', '#e080ff'], fare: ['乘客', '#dddddd'], vendor: ['菜販阿伯', '#a0e080'],
};
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- waits
const waits = [];
let abortTok = 0;
class Abort extends Error {}
function until(fn) { const tok = abortTok; return new Promise((res, rej) => waits.push({ fn, res, rej, tok })); }
const sleep = (s) => { const t = (ctx.time || 0) + s; return until(() => ctx.time >= t); };
export async function say(id, o = {}) {
  const L = LINES[id];
  if (!L) return;
  const [who] = L;
  const [name, color] = SPEAKER[who] || ['', '#fff'];
  const dur = await ctx.audio.say(id);
  ui.subs(name, L[1], color, dur + 0.6);
  if (o.speaker) o.speaker.actor.flash = 0;
  await sleep(dur + (o.gap ?? 0.25));
}
export function bark(id) { // fire-and-forget line with subtitle
  const L = LINES[id]; if (!L) return;
  const [name, color] = SPEAKER[L[0]] || ['', '#fff'];
  ctx.audio.say(id).then((d) => ui.subs(name, L[1], color, d + 0.5));
}
function cam(from, to) { ctx.orbit.override = { pos: new THREE.Vector3(...from), look: new THREE.Vector3(...to) }; }
function camG(fx, fy, fz, tx, ty, tz) { cam([fx, heightAt(fx, fz) + fy, fz], [tx, heightAt(tx, tz) + ty, tz]); }
function camFree() { ctx.orbit.override = null; }
// a two-shot framing of the player and someone, from the side
function twoShot(a, b, side = 1, dist = 3.2, h = 1.5) {
  const mx = (a.pos.x + b.pos.x) / 2, mz = (a.pos.z + b.pos.z) / 2;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
  const nx = -dz / d * side, nz = dx / d * side;
  camG(mx + nx * dist - dx / d * 0.6, h, mz + nz * dist - dz / d * 0.6, mx, 1.2, mz);
}
function face(e, other) { e.heading = Math.atan2(other.pos.x - e.pos.x, other.pos.z - e.pos.z); e.actor.heading = e.heading; }
const near = (e, x, z, r) => Math.hypot(e.pos.x - x, e.pos.z - z) < r;
let lock = 0; // player input locked during cutscenes
export const inputLocked = () => lock > 0;

// ---------------------------------------------------------------- mission state
const mission = { id: -1, title: '', obj: '', blips: [], timer: null, running: false, spawned: [] };
export const objective = () => mission.obj;
function setObj(html, sub = '') { mission.obj = html; ui.objective(html ? html + (sub ? `<small>${sub}</small>` : '') : ''); }
function addBlip(b) { blips.push(b); mission.blips.push(b); return b; }
function clearBlips() { for (const b of mission.blips) { const i = blips.indexOf(b); if (i >= 0) blips.splice(i, 1); } mission.blips = []; }
async function goTo(x, z, r, html, o = {}) {
  const b = addBlip({ x, z, color: '#f2c230', icon: '', route: true, label: o.label });
  const ring = marker(x, z, r);
  setObj(html, o.sub);
  await until(() => near(ctx.player, x, z, r) && (!o.onFoot || !ctx.player.veh) && (!o.inVeh || ctx.player.veh));
  ring.removeFromParent();
  const i = blips.indexOf(b); if (i >= 0) blips.splice(i, 1);
  setObj('');
}
function marker(x, z, r, color = 0xf2c230) {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 1.4, 24, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  g.position.set(x, heightAt(x, z) + 0.7, z);
  g.renderOrder = 3;
  ctx.scene.add(g);
  markers.push(g);
  return g;
}
const markers = [];
function passed(title, reward = 0, extra = '') {
  ctx.audio.play('passed');
  ui.banner('任務完成', title, reward ? `+ NT$ ${reward}` : extra);
  if (reward) addMoney(reward, title);
  ui.objective('');
}
function failed(why) { ctx.audio.play('failed'); ui.banner('任務失敗', why, '', true); ui.objective(''); ui.timer(null); ui.counter(null); }
async function runMission(n, fn) {
  mission.id = n; mission.running = true; mission.spawned = [];
  const tok = abortTok;
  try { await fn(); G.story = Math.max(G.story, n + 1); emit('save'); }
  catch (e) {
    if (!(e instanceof Abort)) console.error(e);
    // failed or aborted: take the mission's extras off the map (after the knock-out fade)
    const extra = mission.spawned.splice(0);
    setTimeout(() => { for (const x of extra) if (ents.includes(x) && !x.veh) x.remove(); }, 4500);
    if (mission.chase) { const c = mission.chase; mission.chase = null; setTimeout(() => c.dispose(), 4500); }
  }
  finally {
    if (tok === abortTok) { mission.running = false; clearBlips(); ui.timer(null); ui.counter(null); lock = 0; camFree(); }
  }
  if (tok === abortTok) setTimeout(() => nextMission(), 2500);
}
export function abortMission() {
  abortTok++;
  ctx.audio.setDanceMode(false);
  if (dance.on) { dance.on = false; ctx.player.actor.stopMove(); document.getElementById('danceLane').classList.add('hidden'); }
  const extra = mission.spawned.splice(0);
  setTimeout(() => { for (const x of extra) if (ents.includes(x) && !x.veh) x.remove(); }, 4500);
  for (const w of waits.splice(0)) w.rej(new Abort());
  mission.running = false; clearBlips(); ui.timer(null); ui.counter(null); lock = 0; camFree(); ui.objective('');
  for (const m of markers.splice(0)) m.removeFromParent();
}

// ---------------------------------------------------------------- population
function npc(kind, x, z, o = {}) { const n = new NPC(kind, x, z, o); if (o.id) npcs[o.id] = n; if (mission.running && !o.id) mission.spawned.push(n); return n; }
function populate() {
  const { home, shop, market, square, police, station, betel, recycle, banyan } = P;
  // family at home
  npc('agong', home.x - 3.5, home.z + 4.4, { id: 'agong', name: '阿水伯', role: 'family', ry: Math.PI, sit: true, label: '阿水伯', talk: talkAgong });
  npc('son', home.x + 3, home.z + 1, { id: 'son', name: '阿明', role: 'family', ry: -Math.PI / 2, label: '阿明', talk: talkSon });
  // shopkeepers and vendors
  npc('shopkeeper', doors.shop.x, doors.shop.z - 1.2, { id: 'shopkeeper', name: '阿桃姨', role: 'vendor', ry: 0 });
  npc('farmer', doors.hardware.x + 1, doors.hardware.z - 1.2, { id: 'hardware', name: '金興老闆', role: 'vendor', ry: 0 });
  npc('auntie', P.cloth.x - 1.5, P.cloth.z + 1.5, { id: 'clothlady', name: '衣攤阿姨', role: 'vendor', ry: Math.PI / 2 });
  npc('farmer', market.x - 3.2, -40, { id: 'vendor', name: '菜販阿伯', role: 'vendor', ry: Math.PI / 2 });
  for (let i = 0; i < 6; i++) npc(i % 2 ? 'auntie' : 'aunt2', market.x + (i % 2 ? 3.4 : -3.4), -24 - i * 14, { role: 'vendor', name: '攤販', ry: i % 2 ? -Math.PI / 2 : Math.PI / 2 });
  npc('son', betel.x + 0.4, betel.z, { id: 'betelguy', name: '檳榔攤老闆', role: 'vendor', ry: -Math.PI / 2 });
  npc('farmer', recycle.x - 16, recycle.z - 8, { id: 'recycler', name: '回收場老闆', role: 'vendor', ry: -Math.PI / 2 });
  // the old cop
  npc('police', police.x - 1, 8.5, { id: 'cop', name: '老林警員', role: 'cop', ry: Math.PI, hp: 60, dmg: 9 });
  // old men playing chess under the banyan
  for (const [x, z, ry] of seats.slice(-3)) npc('farmer', x, z, { role: 'sitter', name: '下棋阿伯', ry, sit: true });
  // aunties at the square (dance in the evening)
  for (let i = 0; i < 6; i++) { const n = npc('auntie', square.x - 8 + (i % 3) * 5, square.z + 2 + Math.floor(i / 3) * 4, { role: 'dancer', name: '土風舞阿姨', ry: Math.PI }); n.phase = i * 0.7; if (i === 0) npcs.meiling = n; }
  // pedestrians along the main street / market / square
  const kinds = ['farmer', 'auntie', 'aunt2', 'man2', 'oldman', 'farmer', 'auntie'];
  for (let i = 0; i < (G.economy.world?.populationTarget||160)-38; i++) {
    const s = spawnSpots[i % spawnSpots.length];
    npc(kinds[i % kinds.length], s[0], s[1], { role: 'ped', name: '居民 '+(i+1) });
  }
  // farmers in the fields
  for (const [x, z] of [[20, 90], [140, 110], [-100, 150], [40, 160]]) npc('farmer', x, z, { role: 'ped', name: '農夫' });
  // animals
  new Animal('dog', home.x + 6, home.z - 4, { r: 10 });
  new Animal('dog', market.x + 2, -60, { r: 20 });
  new Animal('dog', 60, 40, { r: 25 });
  new Animal('dog', -30, -8, { r: 30 });
  for (let i = 0; i < 4; i++) new Animal('cat', -80 + i * 55, i % 2 ? -9 : 9, { r: 10 });
  new Animal('cat', home.x - 5, home.z + 6, { r: 5 });
  for (let i = 0; i < 5; i++) new Animal('rooster', home.x + 12 + rnd(-2, 2), home.z - 5 + rnd(-2, 2), { r: 6 });
  // Tripo text-to-3D: a gaggle of white geese outside the gate, water buffalo wallowing in the paddies
  // the 鵝寮 flock roams the grass west of the 三合院 (抓大鵝 side game: goose.js)
  for (let i = 0; i < 5; i++) new Animal('goose', PEN.x + 5 + rnd(-3, 3), PEN.z + rnd(-4, 4), { r: 8 });
  for (const [x, z] of [[-66, 96], [28, 128], [150, 150], [-120, 170]]) new Animal('buffalo', x, z, { r: 9 });
  // 阿嬤's own tricycle and bicycle in the yard
  ctx.tricycle = new Vehicle('tricycle', home.x - 5, home.z - 3.5, Math.PI, { owner: 'ama', parked: true });
  ctx.bicycle = new Vehicle('bicycle', home.x + 4.5, home.z - 5.5, Math.PI * 0.9, { owner: 'ama', parked: true });
  // taxi at the stand, parked scooters in the arcades
  ctx.taxi = new Vehicle('taxi', P.taxiStand.x + 1, P.taxiStand.z + 2, Math.PI / 2, { parked: true });
  new Vehicle('minitruck', market.x + 1.8, -8, Math.PI, { parked: true });
  new Vehicle('scooter', police.x + 3, 8.4, Math.PI / 2, { parked: true, tint: 0xaaccff });
  let n = 0;
  for (const [x, z, ry] of parkSpots) { if (n++ % 2) continue; new Vehicle('scooter', x, z, ry + (Math.random() - 0.5) * 0.3, { parked: true, tint: [0xffffff, 0xff9a9a, 0x9ab8ff, 0xfff09a, 0xaaaaaa][n % 5] }); }
  // traffic
  const types = ['sedan', 'scooter', 'minitruck', 'scooter', 'sedan', 'taxi', 'scooter', 'minitruck', 'sedan', 'scooter'];
  const drivers = ['farmer', 'man2', 'auntie', 'thug2', 'oldman', 'aunt2'];
  types.forEach((t, i) => {
    const loop = i % 3 === 0 ? 1 : i % 5 === 0 ? 2 : 0;
    const pts = [[-150, 0], [200, 0], [200, 62], [-150, 62]];
    const L = loop === 1 ? [[200, -300 + i * 50], 0] : loop === 2 ? [[-100 + i * 20, 0], 0] : [pts[i % 4], i % 4];
    const v = new Vehicle(t, L[0][0] + (i * 13) % 40, L[0][1], 0, { tint: t === 'sedan' ? [0xffffff, 0xaaccff, 0xffdddd, 0xdddddd][i % 4] : null });
    trafficBrain(v, loop, loop === 1 ? 0 : L[1], 1);
    const d = npc(drivers[i % drivers.length], v.pos.x, v.pos.z, { role: 'driver', name: '司機' });
    d.ride(v);
  });
  // cardboard to collect
  for (const c of cardboard) spawnPickup('cardboard', c.x, c.z);
}

// ---------------------------------------------------------------- interactions (E)
export function interactables() {
  const out = [];
  const p = ctx.player;
  const at = (d, r = 2.4) => d && near(p, d.x, d.z, r);
  if (p.veh) {
    // gas station: wash, repair and respray the car — the gossip dies down too
    if (at(doors.gas, 10) && Math.abs(p.veh.speed) < 1.5) out.push({ label: '<kbd>E</kbd> 洗車 · 修車 · 換顏色 NT$150（車況全滿、八卦值清零）', act: respray });
    return out;
  }
  if (at(doors.mart, 3)) out.push({ label: '<kbd>E</kbd> 好鄰居超商 24H', act: () => openShop('好鄰居超商 24H', 'mart') });
  if (at(doors.shop, 3)) out.push({ label: '<kbd>E</kbd> 柑仔店 · 買賣東西', act: () => openShop('阿桃柑仔店', 'shop') });
  if (at(doors.hardware, 3)) out.push({ label: '<kbd>E</kbd> 金興五金行 · 買武器', act: () => openShop('金興五金行', 'hardware') });
  if (at(doors.cloth, 3)) out.push({ label: '<kbd>E</kbd> 夜市衣攤 · 換新衣帽眼鏡', act: () => openShop('香香夜市衣攤', 'cloth') });
  if (at(doors.betel, 3)) out.push({ label: '<kbd>E</kbd> 檳榔攤', act: () => openShop('大發檳榔攤', 'betel') });
  if (at(doors.recycle, 4)) out.push({ label: '<kbd>E</kbd> 回收場 · 賣紙箱寶特瓶', act: () => openShop('資源回收場', 'recycle') });
  if (at({ x: P.market.x - 1.5, z: -40 }, 3)) out.push({ label: '<kbd>E</kbd> 菜攤 · 賣菜', act: () => openShop('菜市場 · 阿伯的菜攤', 'market') });
  if (at(doors.closet, 2.5)) out.push({ label: '<kbd>E</kbd> 衣櫃 · 換衣服', act: () => ctx.openBackpack() });
  if (at(doors.garden, 5) && (G.flags.harvestDay || 0) < G.day) out.push({ label: '<kbd>E</kbd> 菜園 · 採高麗菜', act: harvest });
  if (at(doors.incense, 3)) out.push({ label: `<kbd>E</kbd> 拜拜 · 清除八卦值（香油錢 NT$20）`, act: pray });
  if (at(doors.shrine, 3)) out.push({ label: '<kbd>E</kbd> 拜土地公（NT$10，保佑刮刮樂）', act: () => { if (spend(10)) { G.flags.luck = G.day; ui.toast('土地公保佑：今天刮刮樂中獎機率加倍。'); ctx.audio.play('coin'); } } });
  for (const n of ents) {
    if (n === p || !n.talk || n.down || n.hostile) continue;
    if (n.distTo(p) < 2.4) out.push({ label: `<kbd>E</kbd> 跟${n.label}說話`, act: () => n.talk(n) });
  }
  if (mission.interact) out.push(...mission.interact().filter(Boolean));
  // 抓大鵝: during the game the dive comes first so E always grabs
  const goose = gooseInteract(p, ctx, marker, lock > 0);
  return gooseGame.on ? [...goose, ...out] : [...out, ...goose];
}
function openShop(title, where) {
  ctx.audio.play('door');
  if (where === 'shop' && Math.random() < 0.6) bark('shop_hi');
  const stock = SHOP_STOCK[where] || [], buys = BUYS[where] || [];
  ui.shop(title, stock, buys, {
    buy: (id) => {
      const it = ITEMS[id], p = priceOf(id);
      if(G.economy.world?.enabled){if(!tradeItem(G.economy,where,id,1,'buy',it.price)){ui.toast('产业停业、缺货或小镇钱包不足',true);return;}give(id,id==='cig'?10:1);ctx.audio.play('cash');if(it.slot)equip(it.slot,id);return;}
      if (GOODS[id] && !buyGood(G.economy,id,p)) { ui.toast('小鎮錢包不足或商品缺貨，按 N 查看經濟 / 接送貨工作', true); return; }
      if (!GOODS[id] && !spend(p)) { ui.toast('錢不夠啦！', true); return; }
      give(id, id === 'cig' ? 10 : 1);
      ctx.audio.play('cash');
      ui.toast(`買了 ${it.icon} ${it.name}`, 'money');
      emit('bought', id);
      if (it.slot) { equip(it.slot, id); ui.toast(`已經穿上：${it.name}（Tab 背包可以換）`); if (Math.random() < 0.5) bark(Math.random() < 0.5 ? 'dress1' : 'dress2'); }
    },
    sell: (id, n) => {
      if (!n) return;
      const p = sellPrice(id, where) * n;
      if(G.economy.world?.enabled){if(!tradeItem(G.economy,where,id,n,'sell',sellPrice(id,where))){ui.toast('收购方资金不足或停业',true);return;}give(id,-n);if(id==='cardboard')G.stats.recycled+=n;emit('sold',id,n);return;}
      give(id, -n); addMoney(p, '賣' + ITEMS[id].name);
      ctx.audio.play('cash');
      if (id === 'cardboard') G.stats.recycled += n;
      if (where === 'shop' && id === 'cardboard' && Math.random() < 0.6) bark('shop_sell');
      emit('sold', id, n);
    },
  }, where);
}
function respray() {
  const v = ctx.player.veh;
  if (!(G.economy.world?.enabled?worldService(G.economy,'gas',150,'车辆维修'):spend(150))) { ui.toast('洗車要 NT$150 啦。', true); return; }
  v.hp = v.def.hp; v.broken = false;
  const col = new THREE.Color().setHSL(Math.random(), 0.55, 0.62);
  v.body.traverse((m) => { if (m.isMesh && m.material?.color) { m.material = m.material.clone(); m.material.color.copy(col); } });
  ctx.audio.play('cash');
  if (G.wanted) addWanted(-5, 'respray');
  ui.toast('車子洗好、修好、換了顏色——大家認不出來了。');
}
function harvest() {
  G.flags.harvestDay = G.day;
  const n = 4 + Math.floor(Math.random() * 3);
  give('cabbage', n);recordHarvest(G.economy,n);
  ctx.player.actor.play('lift', { dur: 2.2 });
  ctx.audio.play('pickup');
  ui.toast(`採了 🥬 高麗菜 ×${n}。拿去菜市場或柑仔店賣。`, 'money');
}
function pray() {
  if (!(G.economy.world?.enabled?worldService(G.economy,'temple',20,'香油钱'):spend(20))) { ui.toast('連香油錢都沒有……', true); return; }
  ctx.player.actor.play('phone', { dur: 2.0 });
  bark('pray');
  emit('fx', 'wisp', new THREE.Vector3(doors.incense.x, 1.8, doors.incense.z - 1.6));
  if (G.wanted) { addWanted(-5, 'pray'); ui.toast('媽祖婆保佑，八卦值清零了。'); }
}
async function talkAgong() {
  const a = npcs.agong;
  lock++;
  twoShot(ctx.player, a, 1);
  const c = await ui.dialog('阿水伯', '秀琴啊，要做什麼？', ['聽阿水伯唱歌', '跟他抱怨', G.flags.cane ? '（沒事，走了）' : '借他的拐杖來用', '走了']);
  if (c === 0) await say(Math.random() < 0.5 ? 'agong_idle1' : 'agong_idle2');
  else if (c === 1) { ctx.player.actor.play('complain'); await say('m0_ama1'); }
  else if (c === 2 && !G.flags.cane) { G.flags.cane = 1; give('cane'); ui.toast('得到 🦯 阿水伯的拐杖（Tab 背包裝備）'); await say('agong_idle2'); }
  lock--; camFree();
}
async function talkSon() {
  const s = npcs.son;
  lock++;
  twoShot(ctx.player, s, -1);
  const c = await ui.dialog('阿明', G.eq.glasses ? '媽，妳今天很帥喔！' : '媽～', ['要錢？', '罵他', '走了']);
  if (c === 0) {
    await say('son_idle1');
    const c2 = await ui.dialog('阿明', '借我五百就好啦……', ['好啦拿去（NT$500）', '想得美！']);
    if (c2 === 0) { if (spend(500)) { G.flags.sonLoan = (G.flags.sonLoan || 0) + 500; ui.toast('借了阿明 NT$500。他說下個月還（？）'); } else ui.toast('阿嬤自己都沒錢了。', true); }
    else { ctx.player.actor.play('angry'); await say('m0_ama2'); }
  } else if (c === 1) { ctx.player.actor.play('angry'); await say('m0_ama2'); if (G.eq.glasses) await say('son_idle2'); }
  lock--; camFree();
}

// ---------------------------------------------------------------- missions
const MISSIONS = [
  // 0 生日的早晨
  async () => {
    const p = ctx.player, ag = npcs.agong, son = npcs.son;
    lock++;
    ctx.sky.hour = 6.3;
    p.pos.set(P.home.x - 1, 0, P.home.z + 2); p.heading = Math.PI; face(p, ag);
    ui.banner('第一章', '番薯寮的一天', '', false, 3.5);
    camG(P.home.x - 9, 3.5, P.home.z - 6, P.home.x - 2, 1, P.home.z + 3);
    await sleep(3);
    twoShot(p, ag, 1, 3);
    await say('m0_agong1');
    p.actor.play('complain', { dur: 2.6 });
    await say('m0_ama1');
    face(son, p);
    twoShot(p, son, -1, 3.4);
    await say('m0_son1');
    p.actor.play('angry', { dur: 2.2 });
    await say('m0_ama2');
    lock--; camFree();
    ui.help('<b>操作</b>：<kbd>WASD</kbd> 走路 · <kbd>Shift</kbd> 跑 · 滑鼠 轉鏡頭<br><kbd>F</kbd> 上下車（別人的車也可以「借」）· <kbd>E</kbd> 互動 · <kbd>Tab</kbd> 背包 · <kbd>T</kbd> 老人機 · <kbd>M</kbd> 地圖', 12);
    give('paper', 10);
    const b = ctx.bicycle;
    const bl = addBlip({ x: b.pos.x, z: b.pos.z, color: '#3fd8e8', icon: '🚲', route: true });
    setObj('騎上門口的<b>腳踏車</b>', '走到腳踏車旁按 F');
    await until(() => p.veh === b);
    blips.splice(blips.indexOf(bl), 1);
    passed('生日的早晨', 0, '報紙 ×10');
  },
  // 1 送報紙
  async () => {
    const p = ctx.player;
    bark('m1_start');
    ui.help('騎腳踏車經過<b>黃色光圈</b>的信箱時，按 <kbd>滑鼠左鍵</kbd> 把報紙丟進去。<br>送到 8 份就算完成。', 10);
    const targets = PAPER_ROUTE.map(([x, z]) => ({ x, z, done: false }));
    for (const t of targets) { t.blip = addBlip({ x: t.x, z: t.z, color: '#f2c230', icon: '📰', route: false }); t.ring = marker(t.x, t.z, 2.6); t.box = mailbox(t.x, t.z); }
    let delivered = 0, time = 240;
    mission.paperTargets = targets;
    const onLand = (pos) => {
      if (mission.paperTargets !== targets) return;
      const t = targets.filter((q) => !q.done).sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z))[0];
      if (t && Math.hypot(t.x - pos.x, t.z - pos.z) < 3.2) {
        t.done = true; delivered++; G.stats.papers++;
        t.ring.removeFromParent(); blips.splice(blips.indexOf(t.blip), 1);
        ctx.audio.play('coin'); if (Math.random() < 0.5) bark('m1_hit1');
        addMoney(15, '送報');
      } else if (Math.random() < 0.5) bark('m1_miss');
    };
    const off = on('paperLanded', onLand);
    mission.throwPaper = () => {
      if (count('paper') <= 0) { ui.toast('報紙丟完了。', true); return; }
      const t = targets.filter((q) => !q.done).sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))[0];
      give('paper', -1);
      const from = p.actor.bonePos('rHand', new THREE.Vector3());
      const dest = t && Math.hypot(t.x - p.pos.x, t.z - p.pos.z) < 11 ? new THREE.Vector3(t.x + rnd(-0.8, 0.8), heightAt(t.x, t.z) + 0.2, t.z + rnd(-0.8, 0.8)) : null;
      spawnProjectile('paper', from, null, p.actor.fwdAxis(), p, dest);
      ctx.audio.play('paper');
    };
    try {
      await until(() => {
        time -= ctx.dt;
        ui.timer(time); ui.counter(`📰 已送 <b>${delivered}</b> / 8 · 剩 ${count('paper')} 份`);
        setObj('把報紙丟進<b>信箱</b>', '騎車經過黃圈按左鍵');
        if (count('paper') <= 0 && delivered < 8) { give('paper', 3); ui.toast('阿明在路邊又塞了 3 份給妳。'); }
        return delivered >= 8 || time <= 0;
      });
    } finally {
      mission.throwPaper = null; mission.paperTargets = null;
      for (const t of targets) { t.ring.removeFromParent(); t.box.removeFromParent(); }
      if (G.inv.paper) give('paper', -G.inv.paper);
    }
    if (delivered < 8) { failed('太慢了，訂戶打電話來罵了'); await sleep(3); throw new Abort(); }
    bark('m1_done');
    passed('送報紙', 300);
  },
  // 2 柑仔店的禮物
  async () => {
    const p = ctx.player, shopk = npcs.shopkeeper;
    await goTo(doors.shop.x, doors.shop.z + 3, 3, '去<b>阿桃柑仔店</b>拿阿水伯的禮物', { label: '柑仔店' });
    if (p.veh) { p.unride(); }
    lock++;
    face(p, shopk); face(shopk, p);
    twoShot(p, shopk, 1, 3);
    await say('m2_shop1');
    await say('m2_shop2');
    give('toad'); equip('glasses', 'toad');
    ctx.audio.play('pickup');
    ui.toast('得到 🕶️ 蛤蟆鏡（已經戴上）');
    camG(p.pos.x + Math.sin(p.heading) * 1.8, 1.5, p.pos.z + Math.cos(p.heading) * 1.8, p.pos.x, 1.3, p.pos.z);
    await say('m2_ama1');
    lock--; camFree();
    ui.help('按 <kbd>Tab</kbd> 打開背包可以換帽子、眼鏡、項鍊、衣服、武器。<br>越痞越便宜（<b style="color:#ff5ab4">痞度</b>）。', 9);
    setObj('在柑仔店買一包<b>長壽菸</b>', '按 E 打開商店');
    if (!count('cig')) await until(() => count('cig') > 0);
    setObj('按 <b>X</b> 點一支菸');
    await until(() => ctx.player.smokeT > 0);
    await say('m2_smoke');
    await sleep(2);
    ui.help('<b>賺錢</b>：路邊的📦紙箱可以撿，拿去<b>回收場</b>或柑仔店賣；家裡菜園的高麗菜可以採來賣；柑仔店的刮刮樂……看運氣。', 10);
    passed('柑仔店的禮物', 0, '🕶️ 蛤蟆鏡');
  },
  // 3 菜市場保護費
  async () => {
    const p = ctx.player, v = npcs.vendor;
    await goTo(P.market.x, -34, 6, '去<b>菜市場</b>，阿伯好像有麻煩', { label: '菜市場' });
    if (p.veh) p.unride();
    const thugs = [];
    for (let i = 0; i < 3; i++) thugs.push(npc(i ? 'thug2' : 'thug', v.pos.x + 2 + i * 0.9, v.pos.z - 1.5 + i * 1.3, { name: '阿凱小弟', role: 'thug', hp: 36, dmg: 7, weapon: i === 2 ? 'stick' : null }));
    thugs.forEach((t) => face(t, v));
    lock++;
    twoShot(p, v, 1, 4);
    face(v, p);
    await say('m3_vendor');
    face(thugs[0], p); twoShot(p, thugs[0], -1, 3.6);
    thugs[0].actor.play('swing', { dur: 0.8 });
    await say('m3_thug1');
    p.actor.play('angry', { dur: 2 });
    await say('m3_ama1');
    lock--; camFree();
    if (G.eq.weapon === 'fist') { spawnPickup('stick', v.pos.x - 1.2, v.pos.z + 2.4); ui.help('阿伯的<b>竹扁擔</b>在地上！走過去撿起來。<br><kbd>滑鼠左鍵</kbd> 打人 · <kbd>G</kbd> 丟藍白拖', 8); }
    for (const t of thugs) { t.hostile = true; t.aggro = 30; }
    let ko = 0;
    await until(() => {
      for (const t of thugs) if (t.down) t.stayDown = true; // once beaten, they stay beaten
      ko = thugs.filter((t) => t.down).length;
      ui.counter(`👊 打倒流氓 <b>${ko}</b> / 3`);
      setObj('把收保護費的<b>流氓</b>打跑！');
      if (p.down) throw new Abort();
      return ko >= 3;
    });
    ui.counter(null);
    for (const t of thugs) { t.stayDown = true; }
    await sleep(1);
    lock++;
    const t0 = thugs[0];
    twoShot(p, t0, 1, 3.5);
    await say('m3_thug2');
    face(v, p); twoShot(p, v, -1, 3.2);
    await say('m3_done');
    lock--; camFree();
    give('spinach', 3);
    for (const t of thugs) { t.stayDown = false; t.hostile = false; t.downT = 0.1; setTimeout(() => { t.state = 'flee'; t.fleeT = 20; setTimeout(() => t.remove(), 15000); }, 400); }
    passed('菜市場保護費', 500);
  },
  // 4 追存摺
  async () => {
    const p = ctx.player;
    await sleep(4);
    ctx.audio.play('phone'); await sleep(1.2); ctx.audio.play('phone');
    ui.help('老人機響了！', 3);
    p.actor.play('phone', { dur: 6 });
    await say('m4_phone');
    await say('m4_ama1');
    p.actor.stopMove();
    // the scammer's blue sedan heads down the highway
    // spawn it on the main street ahead of her, heading east toward the highway ring
    const sx = clamp(p.pos.x + 45, -140, 170);
    const car = new Vehicle('sedan', sx, 1.9, Math.PI / 2, { tint: 0x7aa0ff });
    car.hp = 90; car.def = { ...car.def, max: 17 };
    trafficBrain(car, 0, 0, 1);
    car.ai.cruise = 14;
    const drv = npc('thug2', car.pos.x, car.pos.z, { name: '詐騙仔', role: 'thug', hp: 55, dmg: 9 });
    drv.ride(car);
    const bl = addBlip({ x: car.pos.x, z: car.pos.z, color: '#ff4040', icon: '💰', route: true, label: '詐騙仔' });
    mission.chase = car;
    setObj('<b>「借」一台車</b>，追上詐騙仔的藍色轎車！', '撞它讓它拋錨');
    ui.help('走到車旁按 <kbd>F</kbd>：有人開的車也可以搶（八卦值會上升）。<br>開車時 <kbd>R</kbd> 換電台、<kbd>空白鍵</kbd> 剎車 / 按喇叭。', 9);
    let spoke = false;
    await until(() => {
      bl.x = car.pos.x; bl.z = car.pos.z;
      const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
      if (d < 25 && !spoke) { spoke = true; bark('m4_scam1'); }
      if (d > 320) { failed('詐騙仔跑掉了'); throw new Abort(); }
      if (p.down) throw new Abort();
      return car.broken;
    });
    // he gets out and fights
    drv.unride(); drv.hostile = true; drv.aggro = 60; car.ai = null;
    setObj('把<b>詐騙仔</b>打倒，拿回存摺！');
    await until(() => { bl.x = drv.pos.x; bl.z = drv.pos.z; if (drv.down) drv.stayDown = true; return drv.down; });
    blips.splice(blips.indexOf(bl), 1);
    const pb = spawnPickup('passbook', drv.pos.x + 1, drv.pos.z);
    setObj('撿起<b>存摺</b>');
    await until(() => !pickups.includes(pb));
    give('passbook');
    await say('m4_done');
    drv.stayDown = false; drv.hostile = false;
    setTimeout(() => { drv.state = 'flee'; drv.fleeT = 30; }, 2000);
    passed('追存摺', 800);
  },
  // 5 阿嬤開小黃
  async () => {
    const p = ctx.player;
    const driver = npcs.taxiDriver || npc('oldman', P.taxiStand.x - 1.5, P.taxiStand.z - 1, { id: 'taxiDriver', name: '阿財', role: 'vendor', ry: Math.PI / 2 });
    await goTo(P.taxiStand.x, P.taxiStand.z, 5, '去<b>車站</b>的計程車招呼站', { label: '小黃', onFoot: false });
    if (p.veh && p.veh !== ctx.taxi) p.unride();
    ui.subs('阿財', '秀琴姐！我今天痔瘡發作，坐不住，小黃借妳跑兩趟啦，錢算妳的！', '#dddddd', 5);
    await sleep(4);
    bark('m5_taxi');
    setObj('坐上<b>小黃</b>（按 F）');
    await until(() => p.veh === ctx.taxi);
    ui.help('開計程車：路邊招手的乘客頭上有 🙋。停到他旁邊（速度夠慢）他就會上車。<br>準時送到有小費，撞車會被罵。', 9);
    taxiJob.on = true; taxiJob.done = 0;
    await until(() => { ui.counter(`🚕 完成載客 <b>${taxiJob.done}</b> / 2`); return taxiJob.done >= 2; });
    ui.counter(null);
    passed('阿嬤開小黃', 400, '');
    ui.toast('以後開小黃時都會有乘客招手（Tab 看存款）。');
  },
  // 6 廣場舞大賽 · 拿下冠軍 (the scene from 「GTA 大媽之廣場舞大賽」: sunset, fenced court, a qipao troupe)
  async () => {
    const p = ctx.player, C = P.court;
    await sleep(2);
    ctx.audio.play('phone');
    bark('agong_idle1');
    ui.help('阿水伯：今天傍晚活動中心有<b>廣場舞大賽</b>，冠軍有獎金五千塊喔！', 7);
    if (ctx.sky.hour < 16.8 || ctx.sky.hour > 18.2) { ui.toast('時間快轉到傍晚……'); ctx.fade(true); await sleep(1.2); ctx.sky.hour = 17.1; ctx.fade(false); }
    // the contest crowd
    const team = [];
    const tints = [0xffffff, 0xffe0f0, 0xf0e0ff, 0xfff0d8, 0xffffff, 0xffe8e8, 0xf4f0ff, 0xffffff];
    for (let i = 0; i < 8; i++) {
      const n = npc('qipao', C.x + 2 + (i % 4) * 1.8, C.z + (i < 4 ? -1.2 : 1.6), { name: i ? '旗袍隊阿姨' : '美玲姐', role: 'contest', ry: -Math.PI / 2, tint: tints[i], hp: 30, dmg: 5, brave: true });
      n.phase = i * 0.5; n.danceSpeed = 2.6; team.push(n);
    }
    const ml = team[0];
    const mc = npc('man2', C.x + 16.8, C.z + 5.5, { name: '主持人', role: 'contest', ry: -Math.PI / 2 });
    for (const [dz, k] of [[-0.9, 'aunt2'], [0, 'oldman'], [0.9, 'farmer']]) { const j = npc(k, C.x + 18.7, C.z + 3 + dz, { name: '評審', role: 'contest', ry: -Math.PI / 2, sit: true }); j.seatH = 0.47; }
    const crowd = [];
    for (let i = 0; i < 7; i++) crowd.push(npc(['farmer', 'auntie', 'man2', 'aunt2'][i % 4], C.x - 10 + i * 3.4, C.z + 10.5, { name: '看熱鬧的', role: 'contest', ry: Math.PI }));
    const ko = npc('farmer', C.x - 17, C.z + 9, { name: '昏倒的阿伯', role: 'contest' }); ko.knockOut(9999); ko.stayDown = true; ko.stars.visible = false; // someone always ends up on the ground
    const ag = npcs.agong;
    ag.sit = false; ag.actor.sit = 0; ag.pos.set(C.x - 4, 0, C.z + 10.8); ag.heading = Math.PI; ag.role = 'contest'; ag.talk = null;
    const cleanup = () => { for (const n of [...team, mc, ko, ...crowd]) if (n.role === 'contest' || n.role === 'ped') n.remove(); ents.filter((e) => e.name === '評審').forEach((e) => e.remove()); ag.role = 'family'; ag.talk = talkAgong; ag.pos.set(P.home.x - 3.5, 0, P.home.z + 4.4); ag.sit = true; ag.heading = Math.PI; };
    try {
      ui.banner('任務：拿下冠軍', '番薯寮第一屆廣場舞大賽', '', false, 4);
      await goTo(C.x - 16, C.z, 4, '傍晚去<b>活動中心籃球場</b>參加廣場舞大賽', { label: '廣場舞大賽', onFoot: false });
      ctx.sky.freeze = true; if (ctx.sky.hour > 17.6) ctx.sky.hour = 17.3; // hold the golden hour for the contest
      if (p.veh) p.unride();
      lock++;
      p.pos.set(C.x - 12, 0, C.z); p.heading = Math.PI / 2;
      camG(C.x - 19, 1.7, C.z + 1.5, C.x + 4, 1.4, C.z);   // behind her, like the video
      await sleep(2.5);
      camG(C.x + 12, 2.2, C.z + 7, C.x + 16, 1.4, C.z + 4);
      await say('c_open');
      face(ml, p); face(p, ml);
      twoShot(p, ml, 1, 4.2);
      await say('m6_meiling');
      p.actor.play('angry', { dur: 2 });
      await say('m6_ama1');
      // round 1: the qipao troupe
      camG(C.x - 6, 2.4, C.z + 6, C.x + 5, 1.2, C.z);
      await say('c_team1');
      await ctx.audio.loadDanceMusic(); ctx.audio.setDanceMode(true);
      for (const n of team) { n.dance = true; face(n, p); }
      await sleep(7);
      for (const n of team) n.dance = false;
      ctx.audio.setDanceMode(false);
      ui.banner('旗袍隊 86 分', '評審：整齊、優雅、很有氣勢', '', false, 3);
      await say('c_score1');
      await say('c_team2');
      // sabotage!
      const spk = court.speaker;
      const sab = team.slice(1, 4);
      await say('c_sabotage');
      for (const n of sab) { n.state = 'walk'; n.goal = [spk.x + (Math.random() - 0.5) * 2, spk.z + 1.2]; n.stateT = 8; }
      camG(spk.x + 4, 2.2, spk.z + 5, spk.x, 1, spk.z);
      await sleep(2.5);
      ctx.audio.play('static');
      await say('c_ama_fight');
      lock--; camFree();
      for (const n of sab) { n.hostile = true; n.aggro = 30; n.state = 'fight'; n.target = p; }
      ui.help('旗袍隊來鬧場了！<kbd>左鍵</kbd> 打 · <kbd>G</kbd> 丟藍白拖', 6);
      await until(() => { for (const n of sab) if (n.down) n.stayDown = true; const k = sab.filter((n) => n.down).length; ui.counter(`👊 擺平鬧場的旗袍阿姨 <b>${k}</b> / 3`); setObj('把拔插頭的<b>旗袍阿姨</b>擺平！'); if (p.down) throw new Abort(); return k >= 3; });
      ui.counter(null);
      bark('c_qipao_hit');
      for (const n of sab) { n.stayDown = true; n.hostile = false; }
      // plug the speaker back in
      mission.interact = () => [near(p, spk.x, spk.z, 2.8) ? { label: '<kbd>E</kbd> 把音響插頭插回去', act: () => { mission.plugged = true; } } : null];
      mission.plugged = false;
      const r = marker(spk.x, spk.z, 2);
      setObj('把<b>大媽音響</b>的插頭插回去');
      await until(() => mission.plugged);
      r.removeFromParent(); mission.interact = null; setObj('');
      p.actor.play('lift', { dur: 1.2 });
      await say('c_plug');
      // round 2: 阿嬤
      const acc = await danceOff({ x: C.x - 3, z: C.z, face: Math.PI / 2, cam: [C.x - 11, 3, C.z + 6] });
      const score = Math.round(60 + 40 * acc);
      ui.banner(`秀琴阿嬤 ${score} 分`, score > 86 ? '評審：台味十足，全場沸騰！' : '評審：勇氣可嘉……', '', score <= 86, 3);
      await sleep(3);
      if (score <= 86) { await say('c_lose'); failed(`${score} 分，輸給旗袍隊的 86 分`); await sleep(3); throw new Abort(); }
      lock++;
      camG(C.x + 10, 2, C.z + 7, C.x + 16, 1.4, C.z + 4);
      p.actor.play('cheer');
    await say('c_win');
      if (court.trophy) court.trophy.visible = false;
      give('trophy'); equip('weapon', 'trophy');
      addMoney(5000, '廣場舞大賽冠軍');
      ctx.audio.play('passed');
      p.pos.set(C.x + 1, 0, C.z + 3); face(p, crowd[3]);
      emit('fx', 'fireworks', new THREE.Vector3(C.x, 16, C.z - 12));
      twoShot(p, ml, -1, 4);
      await say('m6_win');
      // the love scene: 阿水伯 steps out of the crowd
      ag.pos.set(p.pos.x + 1.4, 0, p.pos.z + 1.0); face(ag, p); face(p, ag);
      twoShot(p, ag, 1, 2.8, 1.4);
      await say('m6_agong');
      await say('m6_ama2');
      ctx.audio.setRadio(true, 4);
      camG(C.x + 14, 7, C.z + 14, p.pos.x, 1.5, p.pos.z);
      emit('fx', 'fireworks', new THREE.Vector3(C.x + 6, 18, C.z - 14));
      await sleep(2.5);
      await say('chapter_end');
      lock--; camFree();
      passed('廣場舞大賽 · 拿下冠軍', 0, '🏆 冠軍獎盃 + NT$5000');
      await sleep(3);
      ui.banner('第一章 完', '番薯寮的一天 · 自由探索繼續開放', '', false, 6);
      await sleep(8);
    } finally {
      ctx.audio.setDanceMode(false);
      ctx.audio.setRadio(false);
      ctx.sky.freeze = false;
      setTimeout(cleanup, 6000);
    }
  },
];
function mailbox(x, z) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), new THREE.MeshStandardMaterial({ color: 0x555555 }));
  post.position.y = 0.5;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a8a3a }));
  box.position.y = 1.15;
  g.add(post, box);
  g.position.set(x, heightAt(x, z), z);
  ctx.scene.add(g);
  return g;
}

// ---------------------------------------------------------------- dance-off minigame
const ARROWS = [['ArrowLeft', '⬅️', 'KeyA'], ['ArrowUp', '⬆️', 'KeyW'], ['ArrowRight', '➡️', 'KeyD'], ['ArrowDown', '⬇️', 'KeyS']];
export const dance = { on: false, notes: [], hits: 0, total: 0, t: 0 };
async function danceOff(o) {
  const p = ctx.player;
  p.pos.set(o.x, 0, o.z); p.heading = o.face; p.actor.heading = o.face;
  const squareDance = o.station == null;
  if (squareDance) { await ctx.audio.loadDanceMusic(); ctx.audio.setDanceMode(true); ui.toast('廣場舞 · ' + DANCE_MUSIC.title); }
  else { ctx.audio.setRadio(true, o.station); ctx.audio.radioTone(false); ui.radioPop(o.station); }
  lock++;
  camG(o.cam[0], o.cam[1], o.cam[2], o.lookX ?? o.x, 1.2, o.lookZ ?? o.z);
  ui.help(o.help || '跟著節拍按方向鍵（或 WASD）！<br>箭頭落到白線時按下。', 6);
  p.actor.play(o.clip || 'dance', { loop: true });
  dance.on = true; dance.notes = []; dance.hits = 0; dance.total = 0; dance.t = 0;
  const beat = 60 / (o.bpm || (squareDance ? DANCE_MUSIC.bpm : 132));
  let tt = 2;
  for (let i = 0; i < (o.count || 40); i++) { dance.notes.push({ t: tt, k: Math.floor(Math.random() * 4), state: 0 }); tt += beat * (i % 8 < 6 ? 1 : 2); }
  const el = document.getElementById('danceLane');
  el.classList.remove('hidden');
  try {
  await until(() => {
    dance.t += ctx.dt;
    let html = '<div class="line"></div>';
    for (const n of dance.notes) {
      const dt = n.t - dance.t;
      if (n.state === 0 && dt < -0.22) { n.state = -1; dance.total++; }
      if (dt > 2.2 || dt < -0.5) continue;
      html += `<div class="note ${n.state === 1 ? 'ok' : n.state === -1 ? 'miss' : ''}" style="left:${20 + n.k * 60}px;top:${260 - dt * 110}px">${ARROWS[n.k][1]}</div>`;
    }
    html += `<div class="score">${dance.hits} / ${Math.max(1, dance.total)}</div>`;
    el.innerHTML = html;
    return dance.t > dance.notes[dance.notes.length - 1].t + 1;
  });
  return dance.hits / dance.notes.length;
  } finally {
    dance.on = false;
    el.classList.add('hidden');
    p.actor.stopMove();
    lock = Math.max(0, lock - 1);
    if (squareDance) ctx.audio.setDanceMode(false);
  }
}
export function danceKey(code) {
  if (!dance.on) return;
  const k = ARROWS.findIndex((a) => a[0] === code || a[2] === code);
  if (k < 0) return;
  const n = dance.notes.filter((q) => q.state === 0 && q.k === k && Math.abs(q.t - dance.t) < 0.22)[0];
  if (n) { n.state = 1; dance.hits++; dance.total++; ctx.audio.play('coin'); }
  else ctx.audio.play('bonk', 0.3);
}

// ---------------------------------------------------------------- taxi job
export const taxiJob = { on: false, fare: null, done: 0, dest: null, t: 0, ring: null, blip: null, crashes: 0 };
function tickTaxi(dt) {
  const p = ctx.player;
  const inTaxi = p.veh && p.veh.def.taxi;
  if (!taxiJob.on && !(G.story > 5 && inTaxi)) return;
  if (!inTaxi && !taxiJob.fare?.inCar) return;
  const tj = taxiJob;
  if (!tj.fare) {
    // spawn a waving fare somewhere not too close
    const opts = FARES.filter((f) => Math.hypot(f.x - p.pos.x, f.z - p.pos.z) > 60);
    const s = opts[Math.floor(Math.random() * opts.length)];
    const n = npc(['auntie', 'farmer', 'aunt2', 'man2'][Math.floor(Math.random() * 4)], s.x + 2, s.z + 2, { role: 'fare', name: '乘客' });
    n.fareFrom = s;
    tj.fare = n; tj.blip = addBlip({ x: n.pos.x, z: n.pos.z, color: '#3fd8e8', icon: '🙋', route: true, label: '乘客' });
    tj.ring = marker(n.pos.x, n.pos.z, 4, 0x3fd8e8);
    setObj('去載<b>招手的乘客</b> 🙋');
    return;
  }
  const f = tj.fare;
  if (!f.inCar) {
    f.actor.lean = Math.sin(performance.now() / 150) * 0.1; // waving-ish
    if (inTaxi && near(p, f.pos.x, f.pos.z, 6) && Math.abs(p.veh.speed) < 2) {
      f.inCar = true; f.ride(p.veh, true);
      tj.ring.removeFromParent(); blips.splice(blips.indexOf(tj.blip), 1);
      const opts = FARES.filter((q) => q !== f.fareFrom && Math.hypot(q.x - p.pos.x, q.z - p.pos.z) > 80);
      tj.dest = opts[Math.floor(Math.random() * opts.length)];
      tj.t = Math.hypot(tj.dest.x - p.pos.x, tj.dest.z - p.pos.z) / 7 + 25; tj.crashes = 0;
      tj.blip = addBlip({ x: tj.dest.x, z: tj.dest.z, color: '#3fd8e8', icon: '🏁', route: true, label: tj.dest.name });
      tj.ring = marker(tj.dest.x, tj.dest.z, 6, 0x3fd8e8);
      bark('fare_hi');
      setObj(`載乘客去<b>${tj.dest.name}</b>`);
    }
    return;
  }
  tj.t -= dt;
  ui.timer(tj.t);
  if (near(p, tj.dest.x, tj.dest.z, 7) && Math.abs(p.veh?.speed || 0) < 2.5) {
    const base = 120, tip = Math.max(0, Math.round(tj.t * 3)) - tj.crashes * 30;
    const pay = Math.max(60, base + tip);
    f.unride(); f.inCar = false; f.role = 'ped'; f.state = 'walk'; f.goal = [tj.dest.x + 6, tj.dest.z + 6]; f.stateT = 10;
    setTimeout(() => f.remove(), 12000);
    bark(tj.t > 0 && tj.crashes === 0 ? 'fare_fast' : 'fare_slow');
    addMoney(pay, '車資'); ctx.audio.play('cash');
    G.stats.fares++; tj.done++;
    tj.ring.removeFromParent(); blips.splice(blips.indexOf(tj.blip), 1);
    tj.fare = null; ui.timer(null); setObj('');
  }
}
on('carCrash', (a, b, rel) => { if (taxiJob.fare?.inCar && (a === ctx.player.veh || b === ctx.player.veh)) { taxiJob.crashes++; if (taxiJob.crashes === 1) bark('fare_crash'); } });

// ---------------------------------------------------------------- public API
// helpers handed to the chapter scripts (chapter2.js …)
export const api = {
  get ctx() { return ctx; }, say, bark, sleep, until, cam, camG, camFree, twoShot, face, near, npc, npcs, setObj, addBlip, marker, goTo, passed, failed, Abort, danceOff,
  lock(n) { lock += n; }, get mission() { return mission; }, talkAgong, openShop,
};
export async function initStory(c) {
  ctx = c;
  if (!MISSIONS.ch2) { MISSIONS.push(...chapter2(api)); MISSIONS.ch2 = true; }
  try { LINES = (await (await fetch('assets/voice/lines.json')).json()).lines; } catch (e) {}
  populate();
  if (!ctx.goosePen) {
    ctx.goosePen = buildPen(ctx.scene);
    blips.push({ x: PEN.x, z: PEN.z, color: '#ffffff', icon: '🪿', label: '鵝寮' });
  }
  initGoose({ audio: ctx.audio, setObj: (h) => ui.objective(h || mission.obj || ''), get player() { return ctx.player; } });
}
export function nextMission() {
  if (mission.running) return;
  const n = G.story;
  if (n >= MISSIONS.length) { setObj(''); return; }
  runMission(n, MISSIONS[n]);
}
export function tickStory(dt) {
  env.truce = lock > 0;
  for (let i = waits.length - 1; i >= 0; i--) {
    const w = waits[i];
    let ok = false;
    try { ok = w.fn(); } catch (e) { waits.splice(i, 1); w.rej(e); continue; }
    if (ok) { waits.splice(i, 1); w.res(); }
  }
  tickTaxi(dt);
  tickGoose(dt, ctx);
  for (const m of markers) { m.rotation.y += dt; m.material.opacity = 0.25 + Math.sin(performance.now() / 300) * 0.1; }
}
export const missionThrow = () => mission.throwPaper;
export const missionInfo = () => mission;
export function phoneMenu() {
  const items = [
    { label: '打給阿明', fn: () => bark(Math.random() < 0.5 ? 'son_idle1' : 'son_idle2') },
    { label: '打給阿水伯', fn: () => bark(Math.random() < 0.5 ? 'agong_idle1' : 'agong_idle2') },
    { label: '叫小黃（NT$50）', fn: () => { if (!spend(50)) return ui.toast('錢不夠', true); const p = ctx.player; const b = ctx.orbit.basis(); const v = new Vehicle('taxi', p.pos.x - b.r.x * 6, p.pos.z - b.r.z * 6, p.heading); ui.toast('小黃來了，停在旁邊。'); } },
    { label: '叫阿明把三輪車騎來', fn: () => { const p = ctx.player, t = ctx.tricycle; const b = ctx.orbit.basis(); t.pos.set(p.pos.x - b.r.x * 4, 0, p.pos.z - b.r.z * 4); t.speed = 0; t.heading = p.heading; ui.toast('阿明把三輪車騎過來了（他走路回家）。'); } },
    { label: '阿明：鵝寮的鵝又跑了？（抓大鵝）', fn: () => { bark('son_idle1'); ui.toast('鵝寮在三合院西邊草地（地圖 🪿），走過去按 E 開始抓大鵝。'); } },
    { label: '存款與紀錄', fn: () => ui.panel('老人機 · 紀錄', `<div class="row"><div class="nm">現金</div><div class="acts price">NT$ ${G.money}</div></div>${Object.entries({ 打人: G.stats.hits, 送報: G.stats.papers, 載客: G.stats.fares, 回收紙箱: G.stats.recycled, 刮刮樂: G.stats.lottery, 總收入: 'NT$' + G.stats.earned }).map(([k, v]) => `<div class="row"><div class="nm">${k}</div><div class="acts">${v}</div></div>`).join('')}`) },
  ];
  if (mission.running) items.push({ label: '放棄目前任務', fn: () => { abortMission(); ui.toast('放棄任務了。等一下再來。'); setTimeout(() => nextMission(), 4000); } });
  else if (G.story < MISSIONS.length) items.push({ label: '繼續主線任務', fn: () => nextMission() });
  ui.phone(items);
}
export function useItem(id) {
  const p = ctx.player;
  if (id === 'lottery') {
    give('lottery', -1); G.stats.lottery++;
    const luck = G.flags.luck === G.day ? 2 : 1;
    const r = Math.random();
    const win = r < 0.02 * luck ? 5000 : r < 0.08 * luck ? 1000 : r < 0.22 * luck ? 200 : r < 0.4 ? 100 : 0;
    if (win) { addMoney(win, '刮刮樂'); bark('lottery_win'); ui.banner('刮中了！', '', `+ NT$ ${win}`); ctx.audio.play('cash'); }
    else { bark('lottery_lose'); ui.toast('銘謝惠顧……', true); }
    return;
  }
  if (id === 'cig') return p.lightUp();
  if (id === 'betel') { if (!count('betel')) return; give('betel', -1); p.stamina = 100; p.betelT = 4; bark('betel'); return; }
  const it = ITEMS[id];
  if (it?.heal) {
    if (p.hp >= p.maxHp) return ui.toast('血是滿的。');
    give(id, -1); p.hp = Math.min(p.maxHp, p.hp + it.heal); ctx.audio.play('drink');
    if (id === 'bolida') bark('eat');
    ui.toast(`${it.icon} +${it.heal} 血`);
  }
}
export function onPickup(pk) {
  const p = ctx.player;
  if (pk.kind === 'slipper') { give('slipper', 1); ctx.audio.play('pickup'); }
  else if (pk.kind === 'cash') { addMoney(pk.amount, '撿到錢'); ctx.audio.play('cash'); }
  else if (pk.kind === 'cardboard') { give('cardboard', 1); ctx.audio.play('pickup'); ui.toast('📦 撿到紙箱（回收場 NT$12）'); if (!G.flags.recycleTip) { G.flags.recycleTip = 1; bark('recycle'); } }
  else if (pk.kind === 'stick') { give('stick'); equip('weapon', 'stick'); ctx.audio.play('pickup'); ui.toast('🦯 撿起竹扁擔（已裝備）'); }
  else if (pk.kind === 'passbook') { ctx.audio.play('pickup'); }
  else if (pk.kind === 'cashbag') { addMoney(pk.amount || 500, '搶回的錢'); ctx.audio.play('cash'); }
}
