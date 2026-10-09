// Chapter 2 — 「金牙伯的挑戰」. 金牙伯, rich and flashy, is back in 番薯寮 and
// courting 阿嬤; 阿水伯 sulks. It turns out he runs the 阿凱幫 phone-scam ring.
//   7  金牙伯登場     meet him at the 好鄰居超商 on 民生路
//   8  番薯寮大賽車   her electric tricycle vs his luxury car, checkpoint race
//   9  卡拉OK對唱     duet with 阿水伯 (rhythm game) to out-sing him
//  10  跟蹤金牙伯     tail his car without being seen, to the tin warehouse
//  11  直搗詐騙窩     storm the scam call centre, beat the gang and the boss
//  12  颱風夜         typhoon: catch the escaped roosters, fetch 阿水伯 from
//                     the temple on the tricycle — and his proposal

import * as THREE from 'three';
import { ents, Animal, animals, spawnPickup, pickups } from './entities.js';
import { Vehicle, vehicles, VTYPES } from './vehicles.js';
import { heightAt } from './world/terrain.js';
import { P } from './world/layout.js';
import { doors, hideout } from './world/town.js';
import { G, give, addMoney, equip, addWanted, count } from './game.js';
import { setWeather, WX } from './weather.js';
import { ui, blips } from './ui.js';
import { hasKind } from './actor.js';
import { makeWear } from './gear.js';

export function chapter2(A) {
  const C = () => A.ctx;
  const P_ = () => A.ctx.player;
  // 金牙伯 and his car persist across the chapter (re-created after a reload)
  function jin(x, z, o = {}) {
    let j = A.npcs.jinya;
    if (!j || !ents.includes(j)) {
      j = A.npc(hasKind('jinya') ? 'jinya' : 'thug', x, z, { id: 'jinya', name: '金牙伯', role: 'contest', hp: 220, dmg: 10, brave: true, weapon: o.weapon });
    }
    if (!j.veh) { j.pos.set(x, heightAt(x, z), z); j.vel.set(0, 0, 0); }
    return j;
  }
  function jinCar(x, z, h) {
    let c = A.npcs.jinCar;
    if (!c || !vehicles.includes(c)) {
      c = new Vehicle(VTYPES.luxcar ? 'luxcar' : 'sedan', x, z, h, { tint: VTYPES.luxcar ? null : 0xfff6dc, parked: true });
      A.npcs.jinCar = c;
    }
    c.pos.set(x, heightAt(x, z), z); c.heading = h; c.speed = 0; c.ai = null; c.broken = false; c.hp = c.def.hp;
    c.sync();
    return c;
  }
  // put 阿嬤's own tricycle next to her when a mission needs it
  function fetchTricycle(dx = 3) {
    const t = C().tricycle, p = P_();
    if (p.veh === t) return t;
    if (Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) > 25) {
      const b = C().orbit.basis();
      t.pos.set(p.pos.x - b.r.x * dx, 0, p.pos.z - b.r.z * dx); t.heading = p.heading; t.speed = 0; t.broken = false; t.hp = t.def.hp; t.sync();
      ui.toast('阿明把電動三輪車騎過來了。');
    }
    return t;
  }
  const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

  return [
    // 7 金牙伯登場 ---------------------------------------------------------------
    async () => {
      const p = P_(), ctx = C();
      G.day = Math.max(G.day, 2);
      ctx.fade(true); await A.sleep(1.2);
      ctx.sky.hour = 8.3; setWeather('clear', true);
      if (p.veh) p.unride();
      p.pos.set(P.home.x - 1, 0, P.home.z + 2);
      const ag = A.npcs.agong, son = A.npcs.son;
      A.face(p, son); A.face(son, p);
      ctx.fade(false);
      A.lock(1);
      ui.banner('第二章', '金牙伯的挑戰', '', false, 4);
      A.camG(P.home.x - 8, 3.2, P.home.z - 5, P.home.x, 1.2, P.home.z + 3);
      await A.sleep(3);
      A.twoShot(p, son, -1, 3.4);
      await A.say('c2_son1');
      p.actor.play('complain', { dur: 2.4 });
      await A.say('c2_ama1');
      A.twoShot(p, ag, 1, 3);
      await A.say('c2_agong1');
      A.lock(-1); A.camFree();
      // he waits at the convenience store, next to his car
      const m = doors.mart;
      const car = jinCar(m.x + 5, m.z + 7.5, Math.PI / 2);
      const j = jin(m.x + 2, m.z + 5);
      A.face(j, { pos: new THREE.Vector3(m.x, 0, m.z + 20) });
      await A.goTo(m.x, m.z + 5, 5, '去民生路的<b>好鄰居超商</b>，金牙伯在那裡等妳', { label: '好鄰居' });
      if (p.veh) p.unride();
      A.lock(1);
      A.face(j, p); A.face(p, j);
      A.twoShot(p, j, 1, 3.4);
      j.actor.play('brag');
      await A.say('c2_jin1');
      await A.say('c2_ama2');
      A.camG(car.pos.x - 4, 2, car.pos.z + 5, car.pos.x, 1, car.pos.z);
      j.actor.play('laugh');
      await A.say('c2_jin2');
      A.twoShot(p, j, -1, 3);
      p.actor.play('angry', { dur: 2 });
      await A.say('c2_ama3');
      A.lock(-1); A.camFree();
      A.passed('金牙伯登場');
    },

    // 8 番薯寮大賽車 -------------------------------------------------------------
    async () => {
      const p = P_(), ctx = C();
      // start line on 民生路; route: 和平街 → 中正路 → 台一線 → 田中路 → 竹圍巷 → back to 民生路
      const START = [-100, 36.2];
      const CPS = [[-14, 36], [-15.8, 3], [60, 2], [150, 2], [198, 10], [198, 58], [120, 60.2], [20, 60.2], [-90, 60.2], [-148.2, 56], [-148.2, 40], [-100, 36.2]];
      const OPP = CPS.map(([x, z]) => [x, z]);
      const car = jinCar(START[0] + 2, START[1] - 3.4, Math.PI / 2);
      const j = jin(car.pos.x, car.pos.z);
      if (!j.veh) j.ride(car);
      const t = fetchTricycle();
      A.setObj('騎上<b>電動三輪車</b>到民生路的起跑線（別的車也行）');
      await A.goTo(START[0], START[1], 6, '到民生路的<b>起跑線</b>', { label: '起點', inVeh: true });
      const v = p.veh;
      v.pos.set(START[0] + 2, 0, START[1] + 0.2); v.heading = Math.PI / 2; v.speed = 0; v.sync();
      car.pos.set(START[0] + 2, 0, START[1] - 3.2); car.heading = Math.PI / 2; car.sync();
      // countdown
      A.lock(1);
      A.camG(START[0] - 6, 2.4, START[1] + 3, START[0] + 6, 1.2, START[1] - 1.5);
      A.bark('race_go');
      for (const n of ['3', '2', '1']) { ui.banner(n, '', '', false, 0.9); ctx.audio.play('beep'); await A.sleep(1); v.speed = 0; }
      ui.banner('GO!', '番薯寮大賽車', '', false, 1.2); ctx.audio.play('honk');
      A.lock(-1); A.camFree();
      car.ai = { path: OPP, pi: 0, cruise: 9, ignoreLights: true, reach: 8 };
      let cp = 0, time = 0, taunted = false;
      const ring = { m: null, b: null };
      const showCp = () => {
        ring.m && ring.m.removeFromParent(); if (ring.b) blips.splice(blips.indexOf(ring.b), 1);
        const [x, z] = CPS[cp];
        ring.m = A.marker(x, z, 9, cp === CPS.length - 1 ? 0xff4040 : 0x3fd8e8);
        ring.b = A.addBlip({ x, z, color: '#3fd8e8', icon: cp === CPS.length - 1 ? '🏁' : '', route: true });
      };
      showCp();
      let result = 0;
      try {
        await A.until(() => {
          time += ctx.dt;
          const [x, z] = CPS[cp];
          if (Math.hypot(p.pos.x - x, p.pos.z - z) < 9) { cp++; ctx.audio.play('coin'); if (cp >= CPS.length) { result = 1; return true; } showCp(); }
          if (car.ai?.done) { result = -1; return true; }
          // rubber band: he eases off when far ahead, floors it when behind
          const lead = car.ai.pi - cp;
          car.ai.cruise = lead >= 2 ? 6.5 : lead <= -1 ? 11.5 : 8.8;
          if (!taunted && lead >= 1 && time > 8) { taunted = true; A.bark('race_jin'); }
          ui.timer(time);
          ui.counter(`🏁 檢查點 <b>${cp}</b> / ${CPS.length} · ${lead > 0 ? '金牙伯領先！' : lead < 0 ? '阿嬤領先！' : '並駕齊驅'}`);
          A.setObj('過<b>檢查點</b>，比金牙伯先回到民生路！');
          return false;
        });
      } finally { ring.m && ring.m.removeFromParent(); ui.timer(null); ui.counter(null); car.ai = null; }
      if (result < 0) { await A.say('race_lose'); A.failed('金牙伯先到了'); await A.sleep(3); throw new A.Abort(); }
      if (p.veh) p.unride();
      p.actor.play('cheer');
      await A.say('race_win');
      A.passed('番薯寮大賽車', 600);
    },

    // 9 卡拉OK對唱 --------------------------------------------------------------
    async () => {
      const p = P_(), ctx = C();
      A.bark('k_agong1');
      if (ctx.sky.hour < 19 && ctx.sky.hour > 6) { ui.toast('時間快轉到晚上……'); ctx.fade(true); await A.sleep(1.2); ctx.sky.hour = 20; ctx.fade(false); }
      const k = doors.ktv;
      await A.goTo(k.x, k.z - 3.5, 4, '晚上去民生路的<b>歡樂卡拉OK</b>，跟阿水伯對唱', { label: '卡拉OK' });
      if (p.veh) p.unride();
      const ag = A.npcs.agong;
      ag.sit = false; ag.actor.sit = 0; ag.role = 'contest'; ag.talk = null;
      // inside the karaoke room: they face the screen at the back
      const inX = k.x, inZ = k.z + 0.6;
      p.pos.set(inX - 0.6, 0, inZ); ag.pos.set(inX + 0.6, 0, inZ);
      const j = jin(inX - 1.8, inZ + 1.5);
      const screen = { pos: new THREE.Vector3(k.x, 0, k.z + 3) };
      A.face(p, screen); A.face(ag, screen); A.face(j, p);
      A.lock(1);
      A.twoShot(p, ag, 1, 2.6, 1.4);
      await A.say('k_agong1');
      A.twoShot(p, j, -1, 2.8, 1.4);
      j.actor.play('fold');
      await A.say('k_jin1');
      j.actor.play('sing');
      A.camG(inX + 1.0, 1.7, inZ - 2.2, j.pos.x, 1.3, j.pos.z);
      A.lock(-1);
      ui.banner('金牙伯 88 分', '《酒店小姐》· 自己唱自己拍手', '', false, 3);
      await A.sleep(3);
      j.actor.stopMove(); j.actor.play('fold');
      ag.dance = true; ag.danceSpeed = 1.4;
      const acc = await A.danceOff({ x: inX - 0.6, z: inZ, face: p.heading, station: 4, clip: 'sing', bpm: 100, count: 32, cam: [inX + 0.3, 1.7, inZ - 3.2], lookX: inX, lookZ: inZ + 0.5, help: '對唱時間！跟著節拍按方向鍵（或 WASD）。' });
      ag.dance = false;
      const score = Math.round(60 + 40 * acc);
      ui.banner(`阿嬤 & 阿水伯 ${score} 分`, score > 88 ? '全場起立鼓掌！' : '差一點點……', '', score <= 88, 3);
      await A.sleep(3);
      if (score <= 88) { A.failed(`${score} 分，沒贏過金牙伯的 88 分`); ag.role = 'family'; ag.talk = A.talkAgong; await A.sleep(3); throw new A.Abort(); }
      A.lock(1);
      p.actor.play('cheer');
      await A.say('k_win');
      A.twoShot(p, ag, 1, 2.4, 1.4);
      await A.say('k_ama1');
      await A.say('k_agong2');
      A.lock(-1); A.camFree();
      ctx.audio.setRadio(false);
      ag.role = 'family'; ag.talk = A.talkAgong; ag.pos.set(P.home.x - 3.5, 0, P.home.z + 4.4); ag.sit = true; ag.heading = Math.PI;
      A.passed('卡拉OK對唱', 300);
    },

    // 10 跟蹤金牙伯 -------------------------------------------------------------
    async () => {
      const p = P_(), ctx = C();
      ctx.fade(true); await A.sleep(1.2); ctx.sky.hour = 10.5; G.day = Math.max(G.day, 3); ctx.fade(false);
      ctx.audio.play('phone');
      await A.say('t_son1');
      await A.say('t_ama1');
      fetchTricycle();
      // his car leaves the betel stand and heads for the warehouse
      const ROUTE = [[201.9, 30], [201.9, 6], [160, -1.9], [60, -1.9], [-40, -1.9], [-148, -1.9], [-150.2, -12], [-150.2, -90], [-163, -118], [-180, -142], [-186, -152]];
      const car = jinCar(P.betel.x - 12, P.betel.z + 4, Math.PI);
      const j = jin(car.pos.x, car.pos.z);
      if (!j.veh) j.ride(car);
      await A.goTo(P.betel.x - 20, P.betel.z - 20, 30, '騎車去<b>檳榔攤</b>附近，別太靠近', { label: '檳榔攤', inVeh: true });
      car.ai = { path: ROUTE, pi: 0, cruise: 8, reach: 6 };
      const bl = A.addBlip({ x: car.pos.x, z: car.pos.z, color: '#ff4040', icon: '🚗', route: true, label: '金牙伯' });
      let closeT = 0, farT = 0, warnC = 0, warnF = 0;
      await A.until(() => {
        bl.x = car.pos.x; bl.z = car.pos.z;
        const d = dist(p, car);
        if (d < 14) { closeT += ctx.dt; if (!warnC) { warnC = 1; A.bark('t_close'); } } else { closeT = Math.max(0, closeT - ctx.dt); warnC = 0; }
        if (d > 85) { farT += ctx.dt; if (!warnF) { warnF = 1; A.bark('t_far'); } } else { farT = Math.max(0, farT - ctx.dt); warnF = 0; }
        // he slows down if she falls far behind (so it stays a tail, not a chase)
        car.ai.cruise = d > 70 ? 5 : 8.5;
        const pct = Math.max(0, Math.min(100, (d / 100) * 100));
        ui.counter(`🚗 跟蹤距離 <b>${Math.round(d)} m</b><div style="position:relative;width:220px;height:8px;margin-top:4px;background:linear-gradient(90deg,#e0402e 0 14%,#3fd8a0 14% 85%,#e0402e 85%)"><i style="position:absolute;left:${pct}%;top:-4px;width:3px;height:16px;background:#fff"></i></div>`);
        A.setObj('跟蹤<b>金牙伯</b>的車（保持 15–85 公尺）');
        if (closeT > 3) { A.bark('t_spotted'); A.failed('被金牙伯發現了'); throw new A.Abort(); }
        if (farT > 6) { A.failed('跟丟了'); throw new A.Abort(); }
        return car.ai.done;
      });
      ui.counter(null);
      A.lock(1);
      A.camG(P.hideout.x + 22, 3, P.hideout.z + 10, P.hideout.x + 8, 2, P.hideout.z);
      await A.say('t_found');
      A.lock(-1); A.camFree();
      A.passed('跟蹤金牙伯', 200);
    },

    // 11 直搗詐騙窩 -------------------------------------------------------------
    async () => {
      const p = P_(), ctx = C();
      const H = P.hideout;
      const car = jinCar(H.x + 20, H.z - 6, 0);
      const j = jin(H.x - 8, H.z + 5.5, { weapon: 'golf' });
      if (!j.weapon) { j.weapon = 'golf'; j.actor.wear('weapon', makeWear('golf', j.actor.t.attach.weapon)); }
      if (j.veh) j.unride();
      j.pos.set(H.x - 8, 0, H.z + 5.5);
      await A.goTo(hideout.door.x, hideout.door.z, 5, '闖進<b>舊鐵皮倉庫</b>的詐騙窩', { label: '詐騙窩' });
      if (p.veh) p.unride();
      const gang = [];
      const spots = [[-4, -4], [0, -1], [3, 2.5], [-6, 2], [5, -5], [-2, 5]];
      for (const [dx, dz] of spots) gang.push(A.npc('thug2', H.x + dx, H.z + dz, { name: '阿凱幫', role: 'thug', hp: 34, dmg: 7, weapon: Math.random() < 0.4 ? 'stick' : null }));
      A.lock(1);
      p.pos.set(hideout.door.x - 3, 0, hideout.door.z); A.face(p, j); A.face(j, p);
      A.camG(H.x + 6, 2.6, H.z + 6, H.x - 6, 1.3, H.z + 2);
      j.actor.play('brag');
      await A.say('r_jin1');
      A.twoShot(p, gang[0], 1, 3.6);
      p.actor.play('angry', { dur: 2 });
      await A.say('r_ama1');
      A.bark('r_thug');
      A.lock(-1); A.camFree();
      for (const g of gang) { g.hostile = true; g.aggro = 40; }
      ui.help('打倒阿凱幫的小弟！<kbd>左鍵</kbd> 打 · <kbd>G</kbd> 丟藍白拖 · <kbd>H</kbd> 喝寶力大補', 7);
      await A.until(() => {
        for (const g of gang) if (g.down) g.stayDown = true;
        const k = gang.filter((g) => g.down).length;
        ui.counter(`👊 阿凱幫 <b>${k}</b> / ${gang.length}`);
        A.setObj('打倒<b>阿凱幫</b>的小弟');
        if (p.down) throw new A.Abort();
        return k >= gang.length;
      });
      // the boss
      j.hostile = true; j.aggro = 60; j.maxHp = j.hp = 200; j.dmg = 11; j.state = 'fight'; j.target = p;
      ui.banner('BOSS', '金牙伯 · 詐騙集團老大', '', false, 2.5);
      const bossBar = () => ui.counter(`💰 金牙伯 <div style="width:220px;height:10px;margin-top:4px;background:#300"><i style="display:block;height:100%;width:${Math.max(0, j.hp / j.maxHp) * 100}%;background:linear-gradient(90deg,#f0c020,#e0402e)"></i></div>`);
      let hurtSaid = false;
      await A.until(() => {
        bossBar();
        A.setObj('把<b>金牙伯</b>的金牙打下來！');
        if (!hurtSaid && j.hp < j.maxHp * 0.5) { hurtSaid = true; A.bark('r_boss_hurt'); }
        if (j.down) j.stayDown = true;
        if (p.down) throw new A.Abort();
        return j.down;
      });
      ui.counter(null);
      // the loot: sacks of the villagers' savings
      const bags = [[-11.8, -4.5], [-9, 5.5], [2, -6], [8, 4]].map(([dx, dz]) => spawnPickup('cashbag', H.x + dx, H.z + dz, { amount: 600 }));
      await A.until(() => {
        const left = bags.filter((b) => pickups.includes(b)).length;
        ui.counter(`💰 搶回的錢袋 <b>${4 - left}</b> / 4`);
        A.setObj('把被騙的<b>錢袋</b>都拿回來');
        return left === 0;
      });
      ui.counter(null);
      j.actor.play('beaten'); j.actor.wear('weapon', null);
      give('golf'); ui.toast('搶到 🏌️ 金牙伯的金球桿（Tab 背包裝備）');
      A.lock(1);
      p.actor.play('laugh');
      await A.say('r_win');
      const cop = A.npcs.cop;
      cop.pos.set(p.pos.x + 3, 0, p.pos.z + 1); A.face(cop, p); A.face(p, cop);
      A.twoShot(p, cop, 1, 3.4);
      await A.say('r_cop');
      A.lock(-1); A.camFree();
      // 金牙伯 is taken away
      j.stayDown = false; j.hostile = false; j.remove(); A.npcs.jinya = null;
      if (car) { car.dispose(); A.npcs.jinCar = null; }
      cop.pos.set(P.police.x - 1, 0, 8.5);
      if (G.wanted) addWanted(-5, 'hero');
      A.passed('直搗詐騙窩', 1000, '');
    },

    // 12 颱風夜 -----------------------------------------------------------------
    async () => {
      const p = P_(), ctx = C();
      ctx.fade(true); await A.sleep(1.2);
      ctx.sky.hour = 20.4; setWeather('storm', true); ctx.sky.freeze = true;
      ctx.fade(false);
      ctx.audio.setRadio(true, 3);
      await A.say('ty_radio');
      ctx.audio.setRadio(false);
      ctx.audio.play('phone');
      await A.say('ty_son');
      await A.say('ty_ama1');
      // the escaped roosters scatter around the yard and the fields
      const coop = { x: P.home.x + 14, z: P.home.z - 5 };
      const loose = [];
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 14;
        const x = P.home.x + Math.cos(a) * r, z = P.home.z - 12 + Math.sin(a) * r;
        const ro = new Animal('rooster', x, z, { r: 10 });
        ro.skittish = true; loose.push(ro);
      }
      const blipsR = loose.map((r) => A.addBlip({ x: r.pos.x, z: r.pos.z, color: '#ffa030', icon: '🐓' }));
      let carried = 0, home = 0;
      const coopRing = A.marker(coop.x, coop.z, 3.5, 0xffa030);
      ui.help('公雞跑出來了！<kbd>Shift</kbd> 跑過去抓，抓到後帶回<b>雞籠</b>。', 7);
      try {
        await A.until(() => {
          loose.forEach((r, i) => {
            if (r.caught) return;
            blipsR[i].x = r.pos.x; blipsR[i].z = r.pos.z;
            const d = Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z);
            if (d < 4 && r.state !== 'flee') r.scare(2.5);
            if (d < 1.3 && !p.veh) {
              r.caught = true; r.root.visible = false; carried++;
              const bi = blips.indexOf(blipsR[i]); if (bi >= 0) blips.splice(bi, 1);
              ctx.audio.play('cluck'); if (Math.random() < 0.5) A.bark('ty_catch');
            }
          });
          if (carried && Math.hypot(p.pos.x - coop.x, p.pos.z - coop.z) < 3.5) { home += carried; carried = 0; ctx.audio.play('pickup'); }
          ui.counter(`🐓 抓回雞籠 <b>${home}</b> / 5${carried ? ` · 手上 ${carried} 隻` : ''}`);
          A.setObj(carried ? '把公雞帶回<b>雞籠</b>' : '颱風天，把跑掉的<b>公雞</b>抓回來');
          return home >= 5;
        });
      } finally { coopRing.removeFromParent(); for (const r of loose) { r.root.removeFromParent(); const i = animals.indexOf(r); if (i >= 0) animals.splice(i, 1); } }
      ui.counter(null);
      // fetch 阿水伯 from the temple
      const ag = A.npcs.agong;
      ag.sit = false; ag.actor.sit = 0; ag.role = 'contest'; ag.talk = null;
      ag.pos.set(P.temple.x + 3, 0, P.temple.z + 5); ag.heading = 0;
      fetchTricycle();
      await A.goTo(P.temple.x, P.temple.z + 8, 7, '騎三輪車去<b>媽祖廟</b>載阿水伯', { label: '媽祖廟', inVeh: true });
      const v = p.veh;
      A.lock(1);
      A.face(ag, p);
      A.twoShot(p, ag, 1, 4, 1.6);
      await A.say('ty_agong1');
      await A.say('ty_ama2');
      ag.ride(v, true);
      A.lock(-1); A.camFree();
      await A.goTo(P.home.x, P.home.z - 10, 7, '載阿水伯<b>回家</b>（颱風很大，小心騎）', { label: '阿嬤家', inVeh: true });
      if (ag.veh) ag.unride();
      if (p.veh) p.unride();
      setWeather('rain', true);
      // the proposal under the eaves
      p.pos.set(P.home.x, 0, P.home.z + 3); ag.pos.set(P.home.x + 1.3, 0, P.home.z + 3.6);
      A.face(p, ag); A.face(ag, p);
      A.lock(1);
      A.twoShot(p, ag, 1, 2.6, 1.4);
      await A.say('e_agong1');
      p.actor.play('complain', { dur: 2.4 });
      await A.say('e_ama1');
      p.actor.play('clap');
      A.camG(P.home.x - 8, 5, P.home.z - 6, P.home.x, 1.5, P.home.z + 3);
      await A.sleep(1.5);
      await A.say('ch2_end');
      A.lock(-1); A.camFree();
      ctx.sky.freeze = false;
      ag.role = 'family'; ag.talk = A.talkAgong; ag.pos.set(P.home.x - 3.5, 0, P.home.z + 4.4); ag.sit = true; ag.heading = Math.PI;
      A.passed('颱風夜', 500, '💍 夜市戒指');
      await A.sleep(3);
      ui.banner('第二章 完', '金牙伯的挑戰 · 下一章：番薯寮的婚禮', '', false, 6);
    },
  ];
}
