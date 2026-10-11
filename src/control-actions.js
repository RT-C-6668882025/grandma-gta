// One place for mouse / keyboard / touch combat semantics.
export function combatActions({ playing, mounted, busy, attackPressed, attackHeld, throwPressed }) {
  if (!playing || mounted) return { attack: false, throw: false };
  return { attack: !throwPressed && (attackPressed || (attackHeld && !busy)), throw: !!throwPressed };
}
export function contextAction({ mounted, interaction, vehicle }) {
  return mounted ? 'exit' : interaction ? 'interact' : vehicle ? 'enter' : null;
}
