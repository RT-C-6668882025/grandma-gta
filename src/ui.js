import {event} from './economy-ledger.js';
import {itemQuote} from './world-economy.js';
import {canPay,shopCurrency,fiatPrice,coinPrice} from './town-currency.js';
import {mountMap} from './map-panel.js';
import { GOODS } from './economy.js';
// HUD and panels: GTA-style radar (rotates with the camera), money, wanted
// megaphones, weapon box, subtitles, objective line, mission banners, radio
// popup, backpack, shops, the old-person phone, dialog choices, big map.

import { G, priceOf, sellPrice, count, swag } from './game.js';
import { ITEMS, SLOTS, SLOT_NAME } from './gear.js';
import { WORLD, ROADS, PADDIES, LOTS, ROWS, SIDE_ROWS, P } from './world/layout.js';
import { STATIONS } from './audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const HALF = WORLD / 2;

export const blips = []; // {x, z, icon, color, label, route}
export const ui = {
  open: null, camYaw: 0, blocking: false,
  init() {
    this.el = {
      money: $('money'), wanted: $('wanted'), clock: $('clockline'), weapon: $('weaponBox'), swag: $('swagLine'),
      hp: $('hpBar').firstElementChild, st: $('stBar').firstElementChild, veh: $('vehBar'), vehI: $('vehBar').firstElementChild, vehName: $('vehName'),
      help: $('help'), prompt: $('prompt'), obj: $('objective'), subs: $('subs'), banner: $('banner'), radio: $('radioPop'),
      toasts: $('toasts'), timer: $('timer'), counter: $('counter'), panel: $('panel'), phone: $('phone'), dlg: $('dlg'), bigmap: $('bigmap'),
    };
    this.map = $('minimap');
    this.mctx = this.map.getContext('2d');
    this.base = drawBase(3);
    this.lastMoney = G.money;
  },
  show(on) { $('hud').classList.toggle('hidden', !on); },
  hud(player, sky, wx) {
    const e = this.el;
    if (G.money !== this.lastMoney) { e.money.classList.remove('flash'); void e.money.offsetWidth; e.money.classList.add('flash'); this.lastMoney = G.money; }
    e.money.textContent = 'NT$ ' + G.money.toLocaleString();
    let w = '<span class="wl">八卦值</span>';
    for (let i = 0; i < 5; i++) w += `<span class="${i < G.wanted ? 'on' : ''}">📢</span>`;
    if (e.wanted._v !== G.wanted) { e.wanted.innerHTML = w; e.wanted._v = G.wanted; }
    const it = ITEMS[G.eq.weapon] || ITEMS.fist;
    const wh = `<span class="wi">${it.icon}</span><span class="wn">${it.name}<small>🩴 藍白拖 × ${count('slipper')}${count('cig') ? ` · 🚬 × ${count('cig')}` : ''}</small></span>`;
    if (e.weapon._h !== wh) { e.weapon.innerHTML = wh; e.weapon._h = wh; }
    e.clock.textContent = `第 ${G.day} 天 · ${sky.clockText()} · ${wx}`;
    const sw = swag();
    e.swag.textContent = `痞度 ${sw}${G.flags.smoking ? ' 🚬' : ''}`;
    e.hp.style.transform = `scaleX(${Math.max(0, player.hp / player.maxHp)})`;
    e.st.style.transform = `scaleX(${player.stamina / 100})`;
    const v = player.veh;
    e.veh.classList.toggle('hidden', !v); e.vehName.classList.toggle('hidden', !v);
    if (v) { e.vehI.style.transform = `scaleX(${v.hp / v.def.hp})`; e.vehName.textContent = `${v.def.name} · ${Math.round(Math.abs(v.speed) * 3.6)} km/h${v.def.radio ? ' · 📻 ' + STATIONS[G.radio].name.split(' · ')[0] : ''}`; }
    this.drawRadar(player);
  },
  drawRadar(player) {
    const c = this.mctx, W = this.map.width, H = this.map.height;
    const zoom = player.veh ? 1.3 : 2.1; // px per metre
    const k = 3; // base px per metre
    c.save();
    c.fillStyle = '#2d3a2a'; c.fillRect(0, 0, W, H);
    c.translate(W / 2, H * 0.62);
    c.rotate(this.camYaw);
    c.scale(zoom / k, zoom / k);
    c.drawImage(this.base, -(player.pos.x + HALF) * k, -(player.pos.z + HALF) * k);
    c.restore();
    // blips
    const toScreen = (x, z) => {
      const dx = (x - player.pos.x) * zoom, dz = (z - player.pos.z) * zoom;
      const a = this.camYaw, ca = Math.cos(a), sa = Math.sin(a);
      return [W / 2 + dx * ca - dz * sa, H * 0.62 + dx * sa + dz * ca];
    };
    c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    if(this.navigation?.path?.length){c.strokeStyle='#f2c230';c.lineWidth=2;c.beginPath();this.navigation.path.forEach((p,i)=>{const [x,y]=toScreen(p.x,p.z);i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();}
    for (const b of [...blips,...(this.navigation?[{...this.navigation,route:true,color:'#ffdd44',icon:'◎'}]:[])]) {
      let [x, y] = toScreen(b.x, b.z);
      const out = x < 8 || x > W - 8 || y < 8 || y > H - 8;
      if (out && !b.route) continue;
      x = Math.max(9, Math.min(W - 9, x)); y = Math.max(9, Math.min(H - 9, y));
      if (b.color) { c.fillStyle = b.color; c.beginPath(); c.arc(x, y, out ? 5 : 7, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.5; c.stroke(); }
      if (b.icon && !out) { c.fillText(b.icon, x, y + 1); }
    }
    // cops flash red/blue
    // player arrow (points where she faces, relative to the camera)
    c.save();
    c.translate(W / 2, H * 0.62);
    c.rotate(Math.PI - (player.heading - this.camYaw));
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // wanted: flashing border
    if (G.wanted > 0) { c.strokeStyle = (performance.now() / 300) % 2 < 1 ? '#e0402e' : '#2a6ae0'; c.lineWidth = 6; c.strokeRect(0, 0, W, H); }
  },
  toast(msg, kind = '') {
    event(G.economy,'游戏',String(msg).replace(/<[^>]*>/g,''));
    const d = document.createElement('div');
    d.className = 'toast ' + (kind === true ? 'bad' : kind || '');
    d.innerHTML = msg;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 5) this.el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 4200);
  },
  help(html, dur = 6) {
    const e = this.el.help;
    e.innerHTML = html; e.style.display = 'block';
    clearTimeout(this._help);
    if (dur) this._help = setTimeout(() => (e.style.display = 'none'), dur * 1000);
  },
  prompt(html) {
    const e = this.el.prompt;
    if (!html) { e.style.display = 'none'; return; }
    if (e._h !== html) { e.innerHTML = html; e._h = html; }
    e.style.display = 'block';
  },
  objective(html) { this.el.obj.innerHTML = html || ''; this.el.obj.classList.toggle('stroke', !!html); },
  subs(who, text, color = '#f2c230', dur = 4) {
    const e = this.el.subs;
    e.innerHTML = who ? `<span class="who" style="color:${color}">${esc(who)}：</span>${esc(text)}` : esc(text);
    e.classList.add('stroke');
    clearTimeout(this._subs);
    this._subs = setTimeout(() => (e.innerHTML = ''), dur * 1000);
  },
  banner(title, sub = '', reward = '', fail = false, dur = 4) {
    event(G.economy,'任务',[title,sub,reward].join(' · ').replace(/<[^>]*>/g,''));
    const e = this.el.banner;
    e.innerHTML = `<div class="big stroke ${fail ? 'fail' : ''}">${title}</div>${sub ? `<div class="sub stroke">${sub}</div>` : ''}${reward ? `<div class="reward stroke">${reward}</div>` : ''}`;
    e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
    clearTimeout(this._ban);
    this._ban = setTimeout(() => e.classList.remove('show'), dur * 1000);
  },
  radioPop(i) {
    const s = STATIONS[i], e = this.el.radio;
    e.innerHTML = `<div class="fq stroke">${s.freq || '📻'}</div><div class="st stroke">${s.name}</div>`;
    e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
    clearTimeout(this._rp);
    this._rp = setTimeout(() => e.classList.remove('show'), 2600);
  },
  timer(sec) {
    const e = this.el.timer;
    if (sec == null) { e.style.display = 'none'; return; }
    e.style.display = 'block';
    const s = Math.max(0, Math.ceil(sec));
    e.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    e.classList.toggle('low', s <= 15);
    e.classList.add('stroke');
  },
  counter(html) { const e = this.el.counter; if (!html) { e.style.display = 'none'; return; } e.style.display = 'block'; e.innerHTML = html; e.classList.add('stroke'); },
  fade(on, text = '') { $('fade').classList.toggle('on', on); const t = $('fadeText'); t.textContent = text; t.classList.toggle('on', on && !!text); },

  // ---------------------------------------------------------------- panels
  panel(title, html, bind, cls = '') {
    this.developmentLive=false;this.developmentRefresh=null;
    const p = this.el.panel;
    p.innerHTML = `<div class="phead"><div class="ptitle">${title}</div><div class="pmoney">NT$ ${G.money.toLocaleString()}</div><div class="pclose" data-x>✕</div></div><div class="pbody">${html}</div>`;
    p.className = cls;
    p.querySelector('[data-x]').onclick = () => this.close();
    this.open = 'panel'; this.blocking = true;
    bind && bind(p.querySelector('.pbody'), p);
  },
  close() {
    this.developmentLive=false;this.developmentRefresh=null;
    this.mapDispose?.();this.mapDispose=null;
    this.el.panel.classList.add('hidden'); this.el.phone.classList.add('hidden'); this.el.dlg.classList.add('hidden'); this.el.bigmap.classList.add('hidden');
    if (this._dlgResolve) { const r = this._dlgResolve; this._dlgResolve = null; r(-1); }
    this.open = null; this.blocking = false;
    this.onClose && this.onClose();
  },
  // backpack: equip wearables, use consumables
  backpack(act) {
    let tab = this._bpTab || 'wear';
    const render = () => {
      const slots = SLOTS.map((s) => { const it = ITEMS[G.eq[s]]; return `<div class="slot"><div class="sl">${SLOT_NAME[s]}</div><div class="si">${it ? it.icon : '—'}</div><div class="sn">${it ? it.name : '沒戴'}</div></div>`; }).join('');
      let cards = '';
      if (tab === 'wear') {
        for (const [id, it] of Object.entries(ITEMS)) {
          if (!it.slot || !G.owned[id]) continue;
          const on = G.eq[it.slot] === id;
          cards += `<div class="card ${on ? 'eq' : ''}"><div class="ci">${it.icon}</div><div><div class="cn">${it.name}</div><div class="cd">${it.desc}</div>${it.swag ? `<div class="cs">痞度 +${it.swag}</div>` : ''}${it.dmg ? `<div class="cs" style="color:#f2c230">攻擊 ${it.dmg} · 距離 ${it.reach}</div>` : ''}<div class="cb">${on ? (it.base ? '' : `<button data-un="${it.slot}">脫下</button>`) : `<button data-eq="${id}">穿戴</button>`}</div></div></div>`;
        }
      } else {
        for (const [id, n] of Object.entries(G.inv)) {
          const it = ITEMS[id];
          if (!it || !n) continue;
          const usable = ['bolida', 'soda', 'bread', 'betel', 'cig', 'lottery'].includes(id);
          cards += `<div class="card"><div class="ci">${it.icon}</div><div><div class="cn">${it.name}</div><div class="cd">${it.desc}</div>${it.sell ? `<div class="cs" style="color:#8fe07a">回收/收購價 NT$${it.sell}</div>` : ''}<div class="cb">${usable ? `<button data-use="${id}">使用</button>` : ''}</div></div><div class="cq">×${n}</div></div>`;
        }
      }
      return `<div class="slots">${slots}</div><div class="tabs"><button data-tab="wear" class="${tab === 'wear' ? 'on' : ''}">穿搭</button><button data-tab="items" class="${tab === 'items' ? 'on' : ''}">道具</button></div><div class="grid">${cards || '<div class="note">空空的。</div>'}</div>
        <div class="note">痞度越高，買東西越便宜、流氓越不敢惹妳、村裡的狗也不敢叫。痞度 20 以上走路自動變「痞步」。現在痞度：<b style="color:#ff5ab4">${swag()}</b></div>`;
    };
    const bind = (b) => {
      b.querySelectorAll('[data-tab]').forEach((x) => (x.onclick = () => { tab = this._bpTab = x.dataset.tab; this.backpack(act); }));
      b.querySelectorAll('[data-eq]').forEach((x) => (x.onclick = () => { act.equip(ITEMS[x.dataset.eq].slot, x.dataset.eq); this.backpack(act); }));
      b.querySelectorAll('[data-un]').forEach((x) => (x.onclick = () => { act.equip(x.dataset.un, null); this.backpack(act); }));
      b.querySelectorAll('[data-use]').forEach((x) => (x.onclick = () => { act.use(x.dataset.use); if (this.open) this.backpack(act); }));
    };
    this.panel('背包 · 阿嬤的菜籃', render(), bind);
  },
  // shop: buy list + sell list
  shop(title, stock, buys, act, where) {
    let tab = this._shopTab && buys.length ? this._shopTab : 'buy';
    const render = () => {
      let cards = '';
      if (tab === 'buy') for (const id of stock) {
        const it = ITEMS[id];
        const owned = it.slot && G.owned[id];
        const world=G.economy.world?.enabled,quote=world?itemQuote(G.economy,where,id,it.price):null;
        const p = world?quote.amount:priceOf(id), available = world?quote.stock>0&&G.economy.industries[where==='mart'?'shop':where]?.open!==false&&canPay(G.economy,'player',quote.currency,p): !GOODS[id] || G.economy.stock[id]>0 && (G.economy.coinMode?G.economy.industries?.shop?.open!==false&&canPay(G.economy,'player',shopCurrency(G.economy),p):G.economy.player>=p);
        cards += `<div class="card"><div class="ci">${it.icon}</div><div style="flex:1"><div class="cn">${it.name}${id === 'cig' ? '（一包 10 支）' : ''}</div><div class="cd">${it.desc}</div>${it.swag ? `<div class="cs">痞度 +${it.swag}</div>` : ''}${it.dmg && it.slot ? `<div class="cs" style="color:#f2c230">攻擊 ${it.dmg}</div>` : ''}<div class="cb"><span class="price">${(world?quote.currency==='beta':GOODS[id]&&shopCurrency(G.economy)==='beta')?'GOD ':'NT$'}${p}${world ? ` · 库存 ${quote.stock}` : GOODS[id] ? ` · 庫存 ${G.economy.stock[id]}${G.economy.coinMode?' · NT$'+fiatPrice(G.economy,id)+' / '+coinPrice(G.economy,id)+' GOD':''}` : ''}</span>${owned ? '<button disabled>已擁有</button>' : `<button data-buy="${id}" ${!world&&!GOODS[id] && G.money < p || !available ? 'disabled' : ''}>買</button>`}</div></div>${it.stack && count(id) ? `<div class="cq">×${count(id)}</div>` : ''}</div>`;
      } else for (const id of buys) {
        const it = ITEMS[id], n = count(id), quote=G.economy.world?.enabled?itemQuote(G.economy,where,id,sellPrice(id,where)):null,p=quote?.amount??sellPrice(id,where);
        cards += `<div class="card"><div class="ci">${it.icon}</div><div style="flex:1"><div class="cn">${it.name}</div><div class="cd">${it.desc}</div><div class="cb"><span class="price">${quote?.currency==='beta'?'GOD ':'NT$'}${p}</span><button data-sell="${id}" ${n ? '' : 'disabled'}>賣一個</button><button data-sellall="${id}" ${n ? '' : 'disabled'}>全賣</button></div></div><div class="cq">×${n}</div></div>`;
      }
      return `${buys.length ? `<div class="tabs"><button data-tab="buy" class="${tab === 'buy' ? 'on' : ''}">買東西</button><button data-tab="sell" class="${tab === 'sell' ? 'on' : ''}">賣東西</button></div>` : ''}<div class="grid">${cards}</div><div class="note">小鎮錢包 NT$${G.economy.player} / ${G.economy.crypto.holders.player} GOD（全商品接入产业库存与钱包；双币兑换受公库储备限制） · 痞度 ${swag()}：打 ${Math.round(Math.min(0.25, swag() * 0.004) * 100)} 折扣。</div>`;
    };
    const bind = (b) => {
      b.querySelectorAll('[data-tab]').forEach((x) => (x.onclick = () => { tab = this._shopTab = x.dataset.tab; this.shop(title, stock, buys, act, where); }));
      b.querySelectorAll('[data-buy]').forEach((x) => (x.onclick = () => { act.buy(x.dataset.buy); this.shop(title, stock, buys, act, where); }));
      b.querySelectorAll('[data-sell]').forEach((x) => (x.onclick = () => { act.sell(x.dataset.sell, 1); this.shop(title, stock, buys, act, where); }));
      b.querySelectorAll('[data-sellall]').forEach((x) => (x.onclick = () => { act.sell(x.dataset.sellall, count(x.dataset.sellall)); this.shop(title, stock, buys, act, where); }));
    };
    this.panel(title, render(), bind);
  },
  // the phone: a list of entries {label, fn}
  phone(items) {
    const p = this.el.phone;
    let sel = 0;
    const render = () => {
      p.innerHTML = `<div class="brand">NOKIO · 老人機</div><div class="scr"><div class="hd"><span>📶 中華電信</span><span>🔋</span></div>${items.map((it, i) => `<div class="it ${i === sel ? 'sel' : ''}" data-i="${i}">${i + 1}. ${it.label}</div>`).join('')}</div>
        <div class="keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => `<div>${k}</div>`).join('')}</div>`;
      p.querySelectorAll('[data-i]').forEach((x) => (x.onclick = () => { const it = items[+x.dataset.i]; this.close(); it.fn(); }));
    };
    render();
    p.classList.remove('hidden');
    this.open = 'phone'; this.blocking = true;
    this._phoneKey = (n) => { if (items[n - 1]) { const it = items[n - 1]; this.close(); it.fn(); } };
  },
  // dialog with choices; resolves to the chosen index
  dialog(who, text, options) {
    const d = this.el.dlg;
    d.innerHTML = `<div class="who">${esc(who)}</div><div class="text">${esc(text)}</div><div class="opts">${options.map((o, i) => `<button data-o="${i}">${i + 1}. ${esc(o)}</button>`).join('')}</div>`;
    d.classList.remove('hidden');
    this.open = 'dialog'; this.blocking = true;
    return new Promise((res) => {
      this._dlgResolve = res;
      d.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => this.dialogKey(+b.dataset.o + 1)));
    });
  },
  dialogKey(n) {
    if (this.open === 'phone') return this._phoneKey(n);
    if (this.open !== 'dialog') return;
    const r = this._dlgResolve;
    if (!r || n < 1 || n > this.el.dlg.querySelectorAll('[data-o]').length) return;
    this._dlgResolve = null;
    this.el.dlg.classList.add('hidden');
    this.open = null; this.blocking = false;
    r(n - 1);
  },
  bigmap(player) {
    this.mapDispose?.();const b=this.el.bigmap;b.classList.remove('hidden');this.open='map';this.blocking=true;
    this.mapDispose=mountMap(b,{base:this.base,world:WORLD,player,...this.mapData(),onClose:()=>this.close()});
  },
};

// the static radar picture: 3 px per metre
function drawBase(k) {
  const S = WORLD * k;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const X = (x) => (x + HALF) * k;
  c.fillStyle = '#3d4d36'; c.fillRect(0, 0, S, S);
  c.fillStyle = '#45603c';
  for (const p of PADDIES) c.fillRect(X(p.x0), X(p.z0), (p.x1 - p.x0) * k, (p.z1 - p.z0) * k);
  c.fillStyle = '#5a5a52';
  for (const l of LOTS) c.fillRect(X(l.x - l.hw), X(l.z - l.hd), l.hw * 2 * k, l.hd * 2 * k);
  c.fillStyle = '#6e6a62';
  for (const [x0, x1, side] of ROWS) { const z0 = side < 0 ? -20.3 : 6.3; c.fillRect(X(x0), X(z0), (x1 - x0) * k, 14 * k); }
  for (const [ax, az, bx, bz, side, off, depth = 14] of SIDE_ROWS) {
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz * side, nz = dx * side;
    const p = [[0, off], [L, off], [L, off + depth], [0, off + depth]].map(([t, o]) => [X(ax + dx * t + nx * o), X(az + dz * t + nz * o)]);
    c.beginPath(); p.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
  }
  c.fillRect(X(-144), X(-36), 234 * k, 12 * k);
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const r of ROADS) {
    c.strokeStyle = r.kind === 'field' ? '#8a8270' : '#d8d6cf'; c.lineWidth = Math.max(3, r.w * k * 0.7);
    c.beginPath(); r.pts.forEach(([x, z], i) => (i ? c.lineTo(X(x), X(z)) : c.moveTo(X(x), X(z)))); c.stroke();
  }
  c.fillStyle = '#a0402a'; c.fillRect(X(P.temple.x - 12), X(P.temple.z - 16), 24 * k, 13 * k);
  c.fillStyle = '#9a4a30'; c.fillRect(X(P.home.x - 11), X(P.home.z - 8), 22 * k, 20 * k);
  return cv;
}
