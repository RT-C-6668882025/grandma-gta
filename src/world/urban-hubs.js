import {drawSign} from './kit.js';
import {DISTRICT_HUBS} from './urban-plan.js';
import {heightAt} from './terrain.js';

export function buildDistrictHub(k,p,{spawnSpots,seats,lamps}){
 const hub=DISTRICT_HUBS.find(h=>h.id===p.hub),y=heightAt(p.x,p.z),east=p.region==='dongbu',west=p.region==='chengwan';
 const stone=west?0xd6e1dc:east?0x606870:0xe0d2bb,metal=west?0x57716c:east?0x3e464d:0x4c5148;
 const box=(x,h,z,w,t,d,c,o={})=>k.box(p.x+x,y+h,p.z+z,w,t,d,c,0,o);
 // Paving joints are geometry, not luminous strips or additional light sources.
 for(let z=-p.d/2+2;z<p.d/2;z+=2)box(0,.015,z,p.w-2,.025,.055,west?0xa8bbb4:east?0x888b8d:0xbca98d);
 for(const side of [-1,1]){
  const x=side*Math.min(7,p.w/2-3);
  box(x,0,0,1.6,.4,2.4,stone,{collide:true});
  k.sphere(p.x+x,y+.7,p.z,.8,west?0x709277:0x657a55,{sy:.5});
  box(x,.42,4,2,.12,.7,metal,{collide:true});
  box(x,.54,4.3,2,.65,.12,metal);
  seats.push([p.x+x,p.z+3.1,0]);
 }
 if(east){
  for(const side of [-1,1])for(const z of [-p.d*.26,p.d*.26]){
   const x=side*(p.w/2-4);
   box(x,0,z,3,.8,1.6,0x60666a,{collide:true});
   for(const dx of [-1.5,1.5])box(x+dx,0,z+.7,.07,2.5,.07,metal,{collide:true});
   k.tin(p.x+x,y+2.55,p.z+z,3.5,2.2,side>0?0x947087:0x5d8989,0,.05);
   box(x-.65,.8,z,.65,.55,.55,0x8dafac);box(x+.55,.8,z,.9,.13,.8,0x826b93);
   for(const dx of [-.8,.8])k.cyl(p.x+x+dx,y+.8,p.z+z,.1,.15,.6,0xb3c2bb,7);
   k.sign(p.x+x,y+1.8,p.z+z+.8,2.8,.5,drawSign('今日样机',{bg:'#41444e',fg:'#d2b4ca',sub:'测试中 · 欢迎试用'}));
  }
  // Parts racks and inexpensive exposed conduits emphasize adaptation and density.
  box(-p.w/2+1.5,0,-3,1.4,2.5,4,metal,{collide:true});
  for(let h=.4;h<2.5;h+=.7)for(const z of [-4,-2])box(-p.w/2+1.5,h,z,1,.4,.7,0x89947e);
 }else if(west){
  for(const x of [-6,6])for(const z of [-5,-1])box(x,0,z,.1,3.2,.1,metal,{collide:true});
  box(0,3.2,-3,13,.15,5,0xc4d8d0);
  for(let x=-5.5;x<6;x+=1.5)box(x,3.36,-3,1.3,.05,4,0x3c6472);
  // The display occupies one side; its ring leaves the walking route clear.
  const x=-5,z=7;
  box(x,0,z,2.8,.4,2.8,stone,{collide:true});
  for(let i=0;i<16;i++){const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
   k.beam(p.x+x+Math.cos(a),y+1.9+Math.sin(a),p.z+z,p.x+x+Math.cos(b),y+1.9+Math.sin(b),p.z+z,.1,0x779f94);}
  box(5,0,7,1,.95,1,metal,{collide:true});box(5,.95,7,.85,.06,.75,0x88bdb0,{glow:true});
 }else{
  // A side fountain avoids forcing navigation through a central obstacle.
  const x=-5,z=-4;
  k.cyl(p.x+x,y,p.z+z,1.9,2.1,.45,stone,16,{collide:true});
  k.cyl(p.x+x,y+.46,p.z+z,1.65,1.65,.035,0x749a9c,16);
  k.cyl(p.x+x,y+.5,p.z+z,.25,.4,1.6,0xb9ab92,10);
  k.cyl(p.x+x,y+1.9,p.z+z,.8,.7,.15,stone,12);
  for(const z of [-5,6]){
   const x=6;box(x,0,z,2.3,.7,1.6,stone,{collide:true});
   k.cyl(p.x+x,y+.71,p.z+z,.65,.65,.08,0xa3937d,12);
   for(const dx of [-1,1]){box(x+dx,.35,z+1.6,.55,.1,.55,0x776958,{collide:true});seats.push([p.x+x+dx,p.z+z+1.6,Math.PI]);}
   box(x,2.6,z,3.3,.1,2.7,0xc9b596);
   box(x,0,z,.07,2.6,.07,metal,{collide:true});
  }
 }
 const ez=p.entry.z-p.z;
 for(const x of [-4,4])box(x,0,ez,.16,3.4,.16,metal,{collide:true});
 box(0,3.25,ez,8.3,.12,.2,metal);
 k.sign(p.x,y+2.55,p.entry.z+.15,5.5,.65,drawSign(hub.label,{bg:east?'#373d46':'#dedfd2',fg:east?'#d5b3cc':'#3b4c44',sub:'全球最发达的城市'}));
 for(const x of [-4,4]){box(x,3.3,ez,.5,.08,.5,0xffe4b7,{glow:true});lamps.push({x:p.x+x,y:y+3.3,z:p.entry.z,small:true});}
 for(const x of [-1.2,0,1.2])for(const z of [-6,-3,0,3,6])spawnSpots.push([p.x+x,p.z+z]);
}
