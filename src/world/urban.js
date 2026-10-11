import {buildDistrictHub} from './urban-hubs.js';
import {Kit,drawSign} from './kit.js';
import {urbanBlocks,URBAN_NAMES} from './urban-plan.js';
import {heightAt} from './terrain.js';

export function buildUrbanDistricts(scene,{spawnSpots,seats,lamps,buildFacade}){
 const blocks=urbanBlocks(),batches=new Map();
 for(const p of blocks){
  const key=p.region+':'+Math.floor(p.x/64)+':'+Math.floor(p.z/64);
  if(!batches.has(key))batches.set(key,new Kit(9000+Number(p.id.split(':')[1])));
  const k=batches.get(key),east=p.region==='dongbu',west=p.region==='chengwan';
  if(p.hub){buildDistrictHub(k,p,{spawnSpots,seats,lamps});continue;}
  const stone=west?0xd9e2df:east?0x777e83:0xd9cbb8,metal=west?0x536b69:east?0x353b42:0x4a514b;
  const box=(x,y,z,w,h,d,c,o={})=>k.box(x,y,z,w,h,d,c,0,o);
  for(const b of p.buildings){
   const hub=blocks.find(q=>q.hub&&q.region===p.region),left=b.x<p.x;
   let frontX=b.x+(left?b.w/2:-b.w/2),frontZ=b.z,ry=left?Math.PI/2:-Math.PI/2,width=b.d,depth=b.w;
   if(hub&&Math.hypot(b.x-hub.x,b.z-hub.z)<45&&Math.abs(b.z-hub.z)>Math.abs(b.x-hub.x)){
    const south=hub.z>b.z;frontX=b.x;frontZ=b.z+(south?b.d/2:-b.d/2);ry=south?0:Math.PI;width=b.w;depth=b.d;
   }
   buildFacade(k,frontX,frontZ,ry,width,{depth,floors:Math.max(2,Math.round(b.h/3.25)),open:false,register:false,name:URBAN_NAMES[p.region],sub:'街坊 · 培育设施',y:heightAt(frontX,frontZ)});
  }
  // A navigable, populated court remains between the solid buildings.
  spawnSpots.push([p.x,p.z-3],[p.x,p.z+3], [p.entry.x,p.entry.z]);
  const benchX=p.x+2.6,benchZ=p.z+(east?0:p.d*.28),y=heightAt(benchX,benchZ);
  box(benchX,y+.4,benchZ,.6,.15,2,west?0x879d93:0x6f5946,{collide:true});
  box(benchX+.25,y+.5,benchZ,.1,.55,2,metal);
  seats.push([benchX-.8,benchZ,Math.PI/2]);
  const treeX=p.x-2.6,treeZ=p.z+(east?0:-p.d*.28),ty=heightAt(treeX,treeZ);
  box(treeX,ty,treeZ,1.8,.4,1.8,stone,{collide:true});
  k.cyl(treeX,ty+.4,treeZ,.1,.15,2.2,0x776149,7);
  k.sphere(treeX,ty+2.9,treeZ,west?1.4:1.1,west?0x65866b:0x647453);
  if(p.landmark){
   const lx=p.x+2.5,lz=p.entry.z,ly=heightAt(lx,lz);
   box(lx,ly,lz,.16,3.2,.16,metal,{collide:true});
   box(lx,ly+3.1,lz,.6,.1,.6,metal);
   box(lx,ly+3.05,lz,.45,.04,.45,east?0xd7bad0:0xffdfad,{glow:true});
   lamps.push({x:lx,y:ly+3,z:lz,small:true});
   k.sign(lx,ly+1.5,lz+.1,2.4,.65,drawSign(URBAN_NAMES[p.region],{bg:east?'#353d45':'#dfdfd3',fg:east?'#cbc5c8':'#3d5048'}));
  }

 }
 for(const [key,k] of batches){const g=k.build('urban:'+key);g.userData.urbanRegion=key.split(':')[0];scene.add(g);}
 return blocks;
}
