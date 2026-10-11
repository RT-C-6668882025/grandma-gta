// Pure perception and tactics. The world supplies line of sight, heard events and routes.
export function createGuardBrain(id, role = 'cover') {
  return { id, role, mode:'patrol', suspicion:0, clock:0, lastKnown:null,
    searchLeft:0, cooldown:1.5, windup:null, shots:0 };
}
export function stepGuard(previous, observation, dt) {
  const b={...previous,lastKnown:previous.lastKnown?{...previous.lastKnown}:null,windup:previous.windup?{...previous.windup}:null};
  const delta=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
  const events=[];b.clock+=delta;
  if(observation.dead){b.mode='down';b.windup=null;return {brain:b,events,destination:null};}
  const sees=observation.visible&&observation.distance<(observation.crouched?14:27)&&observation.facing>.35;
  if(sees){
    b.suspicion=Math.min(1,b.suspicion+delta*(observation.crouched?.65:1.7));
    b.lastKnown={...observation.player};b.searchLeft=9;
  }else b.suspicion=Math.max(0,b.suspicion-delta*.12);
  if(observation.hit||observation.alarm){b.suspicion=1;b.lastKnown={...observation.alarm||observation.player};b.searchLeft=9;}
  if(observation.noise&&observation.distance<=observation.noise.radius){
    b.lastKnown={x:observation.noise.x,z:observation.noise.z};b.searchLeft=9;
    b.suspicion=Math.max(b.suspicion,observation.noise.loud?1:.4);
  }
  const before=b.mode;
  if(b.suspicion>=.999||(before==='combat'&&b.searchLeft>6))b.mode='combat';
  else if(b.lastKnown&&b.searchLeft>0&&(!sees||b.mode==='combat'||b.mode==='search'))b.mode='search';
  else if(b.suspicion>.2)b.mode='suspicious';
  else b.mode='patrol';
  if(!sees&&b.lastKnown){b.searchLeft-=delta;if(b.searchLeft<=0){b.lastKnown=null;b.suspicion=0;b.mode='patrol';}}
  if(before!==b.mode)events.push({type:'mode',from:before,to:b.mode});
  let destination=observation.patrol;
  if(b.mode==='search'||b.mode==='suspicious')destination=b.lastKnown||observation.patrol;
  if(b.mode==='combat'){
    destination=(b.role==='flank'&&observation.flank)||observation.cover||b.lastKnown;
    // A defender alternates hiding and peeking; no shot from behind cover.
    if(b.role!=='flank'&&observation.atCover&&b.clock%3>1.2)destination=observation.peek||destination;
  }
  if(observation.disabled){b.windup=null;return {brain:b,events,destination};}
  b.cooldown=Math.max(0,b.cooldown-delta);
  if(b.windup){
    b.windup.remaining-=delta;
    if(b.windup.remaining<=1e-9){events.push({type:'fire',at:{x:b.windup.x,z:b.windup.z},shot:++b.shots});b.windup=null;b.cooldown=1.8;}
  }else if(b.mode==='combat'&&observation.visible&&b.cooldown===0){
    b.windup={...observation.player,remaining:.55};events.push({type:'windup',at:{...observation.player}});
  }
  return {brain:b,events,destination};
}

// Small bounded A* grid for a single encounter; blockers stay in the world adapter.
export function encounterRoute(start,end,bounds,blocked,spacing=2) {
  const nx=Math.floor((bounds.maxX-bounds.minX)/spacing),nz=Math.floor((bounds.maxZ-bounds.minZ)/spacing);
  const cell=p=>({x:Math.max(0,Math.min(nx,Math.round((p.x-bounds.minX)/spacing))),z:Math.max(0,Math.min(nz,Math.round((p.z-bounds.minZ)/spacing)))});
  const point=c=>({x:bounds.minX+c.x*spacing,z:bounds.minZ+c.z*spacing}),key=c=>c.z*(nx+1)+c.x;
  const a=cell(start),goal=cell(end),open=[a],parents=new Map(),cost=new Map([[key(a),0]]),visited=new Set();
  while(open.length){
    open.sort((p,q)=>(cost.get(key(p))+Math.abs(p.x-goal.x)+Math.abs(p.z-goal.z))-(cost.get(key(q))+Math.abs(q.x-goal.x)+Math.abs(q.z-goal.z)));
    const c=open.shift(),id=key(c);if(visited.has(id))continue;visited.add(id);
    if(id===key(goal)){
      const path=[];let cur=c;while(cur){path.unshift(point(cur));cur=parents.get(key(cur));}
      // Include the exact end only when the final connection is traversable.
      if(!blocked(path.at(-1),end))path.push({...end});return path;
    }
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const n={x:c.x+dx,z:c.z+dz},ni=key(n);
      if(n.x<0||n.x>nx||n.z<0||n.z>nz||visited.has(ni)||blocked(point(c),point(n)))continue;
      const g=cost.get(id)+1;if(g<(cost.get(ni)??Infinity)){cost.set(ni,g);parents.set(ni,c);open.push(n);}
    }
  }
  return [];
}
