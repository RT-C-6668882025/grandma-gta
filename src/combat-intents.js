export function createCombatInput(){return {scan:false,crouch:false,held:0,wasHeld:false,heavySent:false};}
export function combatIntents(previous,input,weapon,dt){
  const s={...previous};if(input.reset)return {state:createCombatInput(),intents:{}};
  if(input.scanPressed)s.scan=!s.scan;if(input.crouchPressed)s.crouch=!s.crouch;
  const held=!!input.attackHeld,delta=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
  if(held&&!s.wasHeld){s.held=0;s.heavySent=false;}if(held)s.held+=delta;
  const heavy=weapon==='melee'&&held&&s.held>=.32&&!s.heavySent;
  if(heavy)s.heavySent=true;
  const melee=weapon==='melee'&&!held&&s.wasHeld&&!s.heavySent;
  s.wasHeld=held;
  return {state:s,intents:{fire:weapon==='gun'&&(held||input.attackPressed),melee,heavy:heavy||!!input.heavyPressed,
    aim:!!input.aimHeld,block:!!input.aimHeld,scan:s.scan,hack:!!input.interactPressed,
    reload:!!input.reloadPressed,dodge:!!input.dodgePressed,weapon:input.weapon}};
}
