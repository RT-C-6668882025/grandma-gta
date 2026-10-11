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
 // Building shells use the author's Kit; props are dressed with original GLBs later.
 if(west){
  for(const x of [-6,6])for(const z of [-5,-1])box(x,0,z,.1,3.2,.1,metal,{collide:true});
  box(0,3.2,-3,13,.15,5,0xc4d8d0);
  for(let x=-5.5;x<6;x+=1.5)box(x,3.36,-3,1.3,.05,4,0x3c6472);
 }
 const ez=p.entry.z-p.z;
 for(const x of [-4,4])box(x,0,ez,.16,3.4,.16,metal,{collide:true});
 box(0,3.25,ez,8.3,.12,.2,metal);
 k.sign(p.x,y+2.55,p.entry.z+.15,5.5,.65,drawSign(hub.label,{bg:east?'#373d46':'#dedfd2',fg:east?'#d5b3cc':'#3b4c44',sub:'全球最发达的城市'}));
 for(const x of [-4,4]){box(x,3.3,ez,.5,.08,.5,0xffe4b7,{glow:true});lamps.push({x:p.x+x,y:y+3.3,z:p.entry.z,small:true});}
 for(const x of [-1.2,0,1.2])for(const z of [-6,-3,0,3,6])spawnSpots.push([p.x+x,p.z+z]);
}
