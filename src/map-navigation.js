// Road graph with intersections and projected endpoints. Shared by map navigation and residents.
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function project(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return {x:a.x+dx*t,z:a.z+dz*t,t};}
function cross(a,b,c,d){const ux=b.x-a.x,uz=b.z-a.z,vx=d.x-c.x,vz=d.z-c.z,det=ux*vz-uz*vx;if(Math.abs(det)<1e-9)return null;const t=((c.x-a.x)*vz-(c.z-a.z)*vx)/det,u=((c.x-a.x)*uz-(c.z-a.z)*ux)/det;return t>=0&&t<=1&&u>=0&&u<=1?{x:a.x+t*ux,z:a.z+t*uz}:null;}
export function roadRoute(roads,start,end){
  if(![start.x,start.z,end.x,end.z].every(Number.isFinite))return [];
  const segments=[];for(const road of roads)for(let i=1;i<road.pts.length;i++){const a={x:road.pts[i-1][0],z:road.pts[i-1][1]},b={x:road.pts[i][0],z:road.pts[i][1]};segments.push({a,b,points:[a,b]});}
  if(!segments.length)return [start,end];
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){const p=cross(segments[i].a,segments[i].b,segments[j].a,segments[j].b);if(p){segments[i].points.push(p);segments[j].points.push(p);}}
  const nearest=p=>segments.reduce((best,s)=>{const q=project(p,s.a,s.b),d=distance(p,q);return !best||d<best.d?{s,q,d}:best;},null);
  const from=nearest(start),to=nearest(end);from.s.points.push(from.q);to.s.points.push(to.q);
  const nodes=[],edges=[],ids=new Map(),key=p=>p.x.toFixed(4)+','+p.z.toFixed(4),node=p=>{const k=key(p);if(!ids.has(k)){ids.set(k,nodes.length);nodes.push({x:p.x,z:p.z});edges.push([]);}return ids.get(k);};
  for(const s of segments){s.points.sort((a,b)=>project(a,s.a,s.b).t-project(b,s.a,s.b).t);for(let i=1;i<s.points.length;i++){const a=node(s.points[i-1]),b=node(s.points[i]);if(a!==b){const cost=distance(nodes[a],nodes[b]);edges[a].push({to:b,cost});edges[b].push({to:a,cost});}}}
  const a=node(from.q),b=node(to.q),cost=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),seen=new Set();cost[a]=0;
  for(let i=0;i<nodes.length;i++){let at=-1;for(let n=0;n<nodes.length;n++)if(!seen.has(n)&&(at<0||cost[n]<cost[at]))at=n;if(at<0||!Number.isFinite(cost[at]))break;if(at===b)break;seen.add(at);for(const e of edges[at])if(cost[at]+e.cost<cost[e.to]){cost[e.to]=cost[at]+e.cost;prev[e.to]=at;}}
  if(!Number.isFinite(cost[b]))return [start,end];
  const path=[];for(let at=b;at!==-1;at=prev[at])path.unshift(nodes[at]);return [start,...path,end].filter((p,i,a)=>i===0||distance(p,a[i-1])>.01);
}
export const routeLength=path=>path.slice(1).reduce((n,p,i)=>n+distance(p,path[i]),0);
export function worldToMap(point,view){return {x:view.width/2+(point.x-view.x)*view.scale,z:view.height/2+(point.z-view.z)*view.scale};}
export function mapToWorld(point,view){return {x:view.x+(point.x-view.width/2)/view.scale,z:view.z+(point.z-view.height/2)/view.scale};}
