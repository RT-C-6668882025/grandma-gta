// Pure combat intent/state layer. World adapters resolve hits, cover and movement.
export const COMBAT_RULES = Object.freeze({
  magazine: 12, shotInterval: .18, reloadTime: 1.4,
  meleeWindup: .18, meleeRecovery: .32, heavyWindup: .4, heavyRecovery: .6,
  meleeCost: 8, heavyCost: 22, dodgeCost: 25, dodgeTime: .3,
  hackCost: 3, hackTime: .6, hackCooldown: 3, maxRAM: 10,
});
export function createCombatState() {
  return { mode: 'ready', weapon: 'gun', aiming: false, scanning: false,
    ammo: 12, reserve: 48, stamina: 100, ram: 10, clock: 0,
    nextShot: 0, nextHack: 0, action: null, sequence: 0 };
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const event = (s, events, type, extra = {}) => events.push({ id: ++s.sequence, type, ...extra });
const clear = s => { s.mode = 'ready'; s.action = null; };
const resetTransient = s => { clear(s); s.aiming = false; s.scanning = false; };

// intents contains frame edges (fire/reload/melee/heavy/dodge/hack) and held
// levels (aim/scan/block). dt is simulation time; paused time is not advanced.
// context.hackTarget is validated by the world both at start and completion.
export function stepCombat(previous, intents = {}, context = {}, dt = 0) {
  const s = { ...previous, action: previous.action ? { ...previous.action } : null };
  const events = [];
  if (context.dead) { resetTransient(s); s.mode = 'dead'; return { state: s, events }; }
  if (context.mounted || context.blocked || context.reset || s.mode === 'dead') {
    resetTransient(s); return { state: s, events };
  }
  const delta = Number.isFinite(dt) ? clamp(dt, 0, .1) : 0;
  s.clock += delta;
  if (context.stunned) {
    resetTransient(s); s.mode = 'stunned'; return { state: s, events };
  }
  if (s.mode === 'stunned') clear(s);
  s.stamina = clamp(s.stamina + delta * (context.sprinting ? -14 : 9), 0, 100);
  s.ram = clamp(s.ram + delta * .5, 0, COMBAT_RULES.maxRAM);
  if (intents.weapon && ['gun', 'melee'].includes(intents.weapon) && intents.weapon !== s.weapon) {
    resetTransient(s); s.weapon = intents.weapon;
    event(s, events, 'weaponChanged', { weapon: s.weapon });
  }
  // Dodge cancels reload/casting/windup BEFORE their completion this frame.
  const dodgeCost = context.perks?.includes('nimble') ? 18 : COMBAT_RULES.dodgeCost;
  const hackCost = context.perks?.includes('efficientHack') ? 2 : COMBAT_RULES.hackCost;
  if (intents.dodge && s.mode !== 'dodging' && s.stamina >= dodgeCost) {
    resetTransient(s); s.stamina -= dodgeCost; s.mode = 'dodging';
    s.action = { remaining: COMBAT_RULES.dodgeTime };
    event(s, events, 'dodge');
    return { state: s, events };
  }
  if (s.action) {
    s.action.remaining -= delta;
    if (s.mode === 'hacking' && (!context.hackTarget?.valid || context.hackTarget.id !== s.action.target)) {
      event(s, events, 'hackCancelled', { target: s.action.target }); clear(s);
    } else if (s.action.remaining <= 1e-9) {
      if (s.mode === 'reloading') {
        const count = Math.min(COMBAT_RULES.magazine - s.ammo, s.reserve);
        s.ammo += count; s.reserve -= count; event(s, events, 'reloaded', { count }); clear(s);
      } else if (s.mode === 'meleeWindup') {
        const heavy = s.action.heavy;
        event(s, events, 'meleeContact', { heavy });
        s.mode = 'meleeRecovery'; s.action = { remaining: heavy ? COMBAT_RULES.heavyRecovery : COMBAT_RULES.meleeRecovery };
      } else if (s.mode === 'hacking') {
        event(s, events, 'hackApply', { target: s.action.target }); clear(s);
      } else clear(s);
    }
  }
  if (s.mode === 'blocking' && !intents.block) clear(s);
  if (s.mode !== 'ready') return { state: s, events };
  s.scanning = !!intents.scan;
  s.aiming = s.weapon === 'gun' && !!intents.aim && !s.scanning;
  // One frame initiates at most one action: hack > reload > block > attack.
  if (intents.hack && s.scanning && context.hackTarget?.valid && s.clock >= s.nextHack && s.ram >= hackCost) {
    s.ram -= hackCost; s.nextHack = s.clock + COMBAT_RULES.hackCooldown;
    s.mode = 'hacking'; s.aiming = false;
    s.action = { target: context.hackTarget.id, remaining: COMBAT_RULES.hackTime };
    event(s, events, 'hackStarted', { target: s.action.target });
  } else if (intents.reload && s.weapon === 'gun' && s.ammo < COMBAT_RULES.magazine && s.reserve > 0) {
    s.mode = 'reloading'; s.aiming = false; s.scanning = false;
    s.action = { remaining: COMBAT_RULES.reloadTime }; event(s, events, 'reloadStarted');
  } else if (intents.block && s.weapon === 'melee' && !s.scanning) {
    s.mode = 'blocking'; s.blockSince = s.clock;
  } else if (!s.scanning && s.weapon === 'gun' && intents.fire && s.clock + 1e-9 >= s.nextShot) {
    if (s.ammo > 0) {
      s.ammo--; s.nextShot = s.clock + COMBAT_RULES.shotInterval;
      event(s, events, 'shot', { aiming: s.aiming });
    } else event(s, events, 'empty');
  } else if (!s.scanning && s.weapon === 'melee' && (intents.melee || intents.heavy)) {
    const heavy = !!intents.heavy, cost = heavy ? COMBAT_RULES.heavyCost : COMBAT_RULES.meleeCost;
    if (s.stamina >= cost) {
      s.stamina -= cost; s.mode = 'meleeWindup';
      s.action = { heavy, remaining: heavy ? COMBAT_RULES.heavyWindup : COMBAT_RULES.meleeWindup };
      event(s, events, 'meleeStarted', { heavy });
    }
  }
  return { state: s, events };
}

export function guardDamage(previous, damage, frontal) {
  const state={...previous};
  if(state.mode!=='blocking'||!frontal||state.stamina<10)return {state,damage,blocked:false};
  state.stamina-=10;
  const perfect=state.clock-(state.blockSince??-Infinity)<=.22;
  return {state,damage:perfect?0:Math.ceil(damage*.3),blocked:true,perfect};
}
