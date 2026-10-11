export function createEncounterMission() {
  return {phase:'infiltrate',elapsed:0,alarm:false,shots:0,takedowns:0,hacks:0,route:null};
}
export function stepEncounterMission(previous,action,context={},dt=0) {
  const m={...previous};m.elapsed+=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
  if(m.phase==='complete'||m.phase==='failed')return m;
  if(context.dead){m.phase='failed';return m;}
  if(context.alert)m.alarm=true;
  if(action==='shot')m.shots++;
  if(action==='takedown')m.takedowns++;
  if(action==='hack')m.hacks++;
  if(action==='retrieve'&&context.authorized){m.phase='extract';}
  if(action==='extract'&&m.phase==='extract'&&context.atExit){
    m.phase='complete';m.route=m.shots?'强攻':m.hacks?'入侵':m.takedowns?'潜行处置':m.alarm?'避战撤离':'无声潜入';
  }
  return m;
}
export function normalizeCombatProgress(value) {
  const integer=n=>Number.isSafeInteger(n)&&n>=0?n:0;
  return {version:1,xp:integer(value?.xp),clears:integer(value?.clears),
    perks:[...new Set(Array.isArray(value?.perks)?value.perks.filter(p=>['marksman','efficientHack','nimble'].includes(p)):[])]};
}
export const skillPoints=p=>Math.max(0,Math.floor(p.xp/100)-p.perks.length);
export function installCombatPerk(previous,id) {
  const p=normalizeCombatProgress(previous);
  if(!['marksman','efficientHack','nimble'].includes(id)||p.perks.includes(id)||skillPoints(p)<1)return {progress:p,installed:false};
  p.perks.push(id);return {progress:p,installed:true};
}
