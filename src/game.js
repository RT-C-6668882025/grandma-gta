import {transfer} from './economy-ledger.js';
import { createEconomy, restoreEconomy, price as marketPrice } from './economy.js';
import { MOD, MONEY_FLOOR } from './mods.js';
// Game state: money (NT$), backpack, what 阿嬤 wears, wanted level (八卦值),
// story progress. Saved to localStorage. Tiny event bus for the UI and story.

import { ITEMS, SLOTS, swagOf } from './gear.js';

const KEY = 'ama-gta-save-v1';
function fresh() {
  return {
    money: 150,
    economy: createEconomy(),
    inv: { slipper: 2, soda: 1 },
    owned: { straw: 1, floral: 1, fist: 1, bag: 1 },   // wearables owned (not consumed)
    eq: { hat: 'straw', glasses: null, chain: null, top: 'floral', bag: 'bag', weapon: 'fist' },
    hp: 100, maxHp: 100,
    wanted: 0,
    story: 0,           // main mission index
    flags: {},
    stats: { hits: 0, papers: 0, fares: 0, stolen: 0, recycled: 0, lottery: 0, earned: 0 },
    hour: 6.2, weather: 'clear', day: 1,
    radio: 1,
  };
}
export let G = fresh();
const listeners = {};
export const on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
export const emit = (ev, ...a) => (listeners[ev] || []).forEach((f) => f(...a));

export function newGame() { G = fresh(); try { localStorage.removeItem(KEY); } catch (e) {} emit('changed'); return G; }
export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) { G = Object.assign(fresh(), s); G.eq = Object.assign(fresh().eq, s.eq); G.economy = restoreEconomy(s.economy); }
  } catch (e) {}
  emit('changed');
  return G;
}
export function save(extra = {}) {
  Object.assign(G, extra);
  try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {}
}
export const hasSave = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };

export function addMoney(n, why = '') {
  if(G.economy.world?.enabled){const amount=Math.max(0,Math.min(Math.round(n),G.economy.bank));if(amount)transfer(G.economy,'bank','player',amount,why||'任务收益');if(amount<n){G.economy.world.unpaidRewards=(G.economy.world.unpaidRewards||0)+n-amount;emit('toast','公库余额不足，尚欠奖励 NT$'+(n-amount),true);}G.money=G.economy.player;G.stats.earned+=amount;emit('money',amount,why);return amount;}
  G.money += n;
  if (n > 0) G.stats.earned += n;
  emit('money', n, why);
}
export function spend(n) {
  if(G.economy.world?.enabled){const ok=transfer(G.economy,'player','bank',n,'玩家服务 / 任务支出');G.money=G.economy.player;if(ok)emit('money',-n);return ok;}
  if (MOD.money) { G.money = Math.max(G.money, MONEY_FLOOR); return true; }
  if (G.money < n) return false;
  G.money -= n;
  emit('money', -n);
  return true;
}
export const swag = () => swagOf(G.eq) + (G.flags.smoking ? 8 : 0);
// the cooler she looks, the better the deals (and the thugs back off)
export function priceOf(id) {
  const it = ITEMS[id];
  if(G.economy.coinMode&&marketPrice(G.economy,id)!==null)return marketPrice(G.economy,id);
  const disc = Math.min(0.25, swag() * 0.004);
  return Math.max(1, Math.round((marketPrice(G.economy,id) ?? it.price) * (1 - disc)));
}
export function sellPrice(id, where) {
  const it = ITEMS[id];
  if (it.sell) return where === 'shop' && id === 'cardboard' ? 8 : it.sell;
  return Math.max(1, Math.floor(it.price * 0.4));
}
export function give(id, n = 1) {
  const it = ITEMS[id];
  if (it.slot && n > 0) { G.owned[id] = 1; emit('item', id, n); return; }
  G.inv[id] = Math.max(0, (G.inv[id] || 0) + n);
  if (!G.inv[id]) delete G.inv[id];
  emit('item', id, n);
}
export const count = (id) => (ITEMS[id]?.slot ? (G.owned[id] ? 1 : 0) : G.inv[id] || 0);
export function equip(slot, id) {
  const it = ITEMS[id];
  if (id && (!it || it.slot !== slot || !G.owned[id])) return false;
  if (!id) id = { hat: 'straw', top: 'floral', weapon: 'fist' }[slot] || null;
  G.eq[slot] = id;
  emit('equip', slot, id);
  return true;
}
export function addWanted(n, why) {
  const before = G.wanted;
  G.wanted = Math.max(0, Math.min(5, G.wanted + n));
  if (G.wanted !== before) emit('wanted', G.wanted, before, why);
}
export { SLOTS };
