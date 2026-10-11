import {buildDistrictHub} from './urban-hubs.js';
import {Kit,drawSign} from './kit.js';
import {urbanBlocks,URBAN_NAMES} from './urban-plan.js';
import {heightAt} from './terrain.js';

export function buildUrbanDistricts(scene,{spawnSpots,seats,lamps}){
 const blocks=urbanBlocks(),batches=new Map();
 for(const p of blocks){
  const key=p.region+':'+Math.floor(p.x/64)+':'+Math.floor(p.z/64);
  if(!batches.has(key))batches.set(key,new Kit(9000+Number(p.id.split(':')[1])));
  const k=batches.get(key),east=p.region==='dongbu',west=p.region==='chengwan';
  if(p.hub){buildDistrictHub(k,p,{spawnSpots,seats,lamps});continue;}
  const stone=west?0xd9e2df:east?0x777e83:0xd9cbb8,metal=west?0x536b69:east?0x353b42:0x4a514b;
  const box=(x,y,z,w,h,d,c,o={})=>k.box(x,y,z,w,h,d,c,0,o);
  for(const [bi,b] of p.buildings.entries()){
   const y=heightAt(b.x,b.z);
   box(b.x,y,b.z,b.w,b.h,b.d,stone,{collide:true});
   box(b.x,y+b.h,b.z,b.w+.6,.3,b.d+.6,west?0xdce6e1:metal);
   // The inner facade faces the shared lane, rather than copying the old shop row.
   const fx=b.x+(b.x<p.x?1:-1)*(b.w/2+.04);
   const ry=b.x<p.x?Math.PI/2:-Math.PI/2;
   for(let f=0;f<b.h-2;f+=west?3:3.1){
    for(let z=b.z-b.d/2+1.7;z<b.z+b.d/2-1;z+=2.7){
     k.box(fx,y+f+1,z,west?.06:.13,west?2.2:1.7,west?2.5:1.4,west?0x739ca3:0x3b555a,0,{win:true});
     if(!west){box(fx,y+f+.8,z,.28,.13,1.8,0xebe0cf);}
    }
   }
   // Actual urban agriculture: roof greenhouses and growing racks retain farm output.
   if(west){
    box(b.x,y+b.h+.3,b.z,b.w*.7,1.8,b.d*.65,0x8baeb0,{win:true});
    for(let z=-3;z<=3;z+=2)box(b.x,y+b.h+.4,b.z+z,b.w*.65,.25,.5,0x587d5d);
    for(const s of [-1,1])box(b.x+s*b.w*.35,y+b.h+.3,b.z,.08,1.9,b.d*.68,metal);
    box(b.x,y+.04,b.z+b.d/2+1.1,b.w+1,.08,1.3,0xb4c5c1);
   }else if(east){
    for(let f=3;f<b.h;f+=3){
     box(fx,y+f-.2,b.z,1.1,.14,b.d-1,metal);
     box(fx+.35*(b.x<p.x?1:-1),y+f,b.z,.05,.65,b.d-1,metal);
     box(b.x,y+f+1,b.z+b.d/2+.25,1,.6,.6,0xa3a8a6);
    }
    box(b.x,y+b.h+.3,b.z,b.w*.7,2,b.d*.6,0x536d5c);
    k.tin(b.x,y+b.h+2.4,b.z,b.w*.85,b.d*.75,0x6d8589,0,.07);
    for(const s of [-1,1])box(fx,y+.5,b.z+s*2,.07,2.3,.07,s<0?0xc26591:0x69aca3,{glow:true});
    box(fx,y+2.8,b.z,2,.13,b.d*.55,0x5b6973);
    k.sign(fx+.08*(b.x<p.x?1:-1),y+2.15,b.z,3,.6,drawSign('开放工坊',{bg:'#343944',fg:'#d9b3b8',sub:'样机 · 维修 · 培育'}),ry);
    box(b.x,y+b.h+.3,b.z-b.d/3,.4,2.8,.4,metal);
   }else{
    k.roof(b.x,y+b.h+.3,b.z,b.w+.8,b.d+.8,1.6,0x60646a);
    for(const z of [b.z-b.d*.35,b.z+b.d*.35]){
     box(fx,y,z,.45,b.h,.4,0xe7ddcc);
     box(fx,y+2.7,z,1.5,.14,1.8,0xe8decb);
    }
    for(let a=0;a<8;a++){const t=a*Math.PI/8,u=(a+1)*Math.PI/8;
     k.beam(fx,y+2.2+Math.sin(t)*.7,b.z+Math.cos(t)*1.4,fx,y+2.2+Math.sin(u)*.7,b.z+Math.cos(u)*1.4,.1,0xe9dfcc);}
    k.sign(fx+.12*(b.x<p.x?1:-1),y+2.6,b.z,2.2,.45,drawSign('榆庭工艺社',{bg:'#ddd0b8',fg:'#4a473d'}),ry);
   }
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
