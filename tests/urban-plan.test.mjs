import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const layoutURL=url(await readFile(new URL('../src/world/layout.js',import.meta.url),'utf8'));
const regionURL=url(await readFile(new URL('../src/city-regions.js',import.meta.url),'utf8'));
const L=await import(layoutURL),R=await import(regionURL);
const source=(await readFile(new URL('../src/world/urban-plan.js',import.meta.url),'utf8')).replace("'./layout.js'",JSON.stringify(layoutURL)).replace("'../city-regions.js'",JSON.stringify(regionURL));
const U=await import(url(source));
test('urban redevelopment preserves plot identities and the source-core combat yard',()=>{
 const blocks=U.urbanBlocks();assert.ok(blocks.length>100);
 for(const p of L.PADDIES){if(p.x0<18&&p.x1>-18&&p.z0<208&&p.z1>158)assert.equal(p.urban,false);}
 for(const id of ['chengwan','yuting','dongbu'])assert.ok(blocks.some(p=>p.region===id));
 assert.equal(blocks.length,L.PADDIES.filter(p=>p.urban).length);
});
test('district footprints stay inside their region and leave the central lane and entrance clear',()=>{
 for(const p of U.urbanBlocks())for(const b of p.buildings){
  const region=R.CITY_REGIONS.find(r=>r.id===p.region);
  assert.ok(b.x-b.w/2>=region.minX&&b.x+b.w/2<=region.maxX);
  assert.ok(b.z-b.d/2>=p.z0&&b.z+b.d/2<=p.z1);
  assert.ok(Math.abs(b.x-p.x)-b.w/2>=2.5-1e-9);
  assert.ok(p.entry.z>b.z+b.d/2);
 }
});
test('every urban plot has a central lane and perimeter connection without changing original traffic loops',()=>{
 for(const p of U.urbanBlocks()){
  assert.ok(L.ROADS.some(r=>r.urban&&r.pts[0][0]===p.x&&r.pts[1][0]===p.x&&r.pts[0][1]<p.z0&&r.pts[1][1]>p.z1));
  assert.ok(L.ROADS.some(r=>r.urban&&r.pts[0][0]<p.x0&&r.pts[1][0]>p.x1&&r.pts[0][1]>p.z1));
 }
 assert.equal(L.LOOPS.length,4);
});
const N=await import(url(await readFile(new URL('../src/map-navigation.js',import.meta.url),'utf8')));
test('each district has one distinct public hub with an unobstructed mapped entrance',()=>{
 const hubs=U.districtDestinations();assert.equal(hubs.length,3);assert.equal(new Set(hubs.map(h=>h.region)).size,3);
 for(const h of hubs){const p=U.urbanBlocks().find(p=>p.hub===h.id);assert.equal(p.buildings.length,0);assert.deepEqual({x:h.x,z:h.z},p.entry);assert.equal(h.category,'place');assert.equal(R.regionAt(h.x).id,h.region);}
});
test('district hub navigation follows the joined road graph rather than falling back to a straight line',()=>{
 const start={x:-190,z:62};
 for(const end of U.districtDestinations()){
  const path=N.roadRoute(L.ROADS,start,end);assert.ok(path.length>3,end.label);assert.deepEqual(path[0],start);assert.equal(path.at(-1).x,end.x);assert.equal(path.at(-1).z,end.z);
  const buildings=U.urbanBlocks().flatMap(p=>p.buildings);
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],steps=Math.ceil(N.distance(a,b)/.5);
   for(let n=0;n<=steps;n++){const t=steps?n/steps:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    assert.ok(!buildings.some(q=>Math.abs(x-q.x)<q.w/2+.3&&Math.abs(z-q.z)<q.d/2+.3),end.label+' route intersects a building');
   }
  }
 }
});

test('teleport destination uses the closest road point even when route simplification removes the final duplicate',()=>{
 for(const h of U.districtDestinations()){const p=N.nearestRoadPoint(L.ROADS,h);assert.ok(N.distance(p,h)<1e-6);}
 const road=[{pts:[[0,0],[100,0]]}];assert.deepEqual(N.nearestRoadPoint(road,{x:90,z:3}),{x:90,z:0});
 assert.equal(N.nearestRoadPoint(road,{x:NaN,z:0}),null);assert.equal(N.nearestRoadPoint([],{x:0,z:0}),null);
});
const assetSource=(await readFile(new URL('../src/world/urban-props.js',import.meta.url),'utf8')).replace("'./urban-plan.js'",JSON.stringify(url(source)));
const Props=await import(url(assetSource));
test('public center dressing uses existing authored GLB assets and leaves the central navigation lane free',async()=>{
 const placements=Props.districtPropPlacements();assert.ok(placements.length>10);
 for(const p of placements){const h=U.districtDestinations().find(h=>h.id===p.hub);assert.ok(Math.abs(p.x-h.center.x)>=8);assert.ok(p.height>0&&Number.isFinite(p.rotation));const folder=p.name==='radio'?'gear':'props';const data=await readFile(new URL('../assets/'+folder+'/'+p.name+'.glb',import.meta.url));assert.equal(data.readUInt32LE(0),0x46546c67);}
});
