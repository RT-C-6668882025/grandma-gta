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
