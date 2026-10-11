import {PADDIES} from './layout.js';
import {regionAt} from '../city-regions.js';
// Reuse plot IDs and agricultural output: these are now urban growing facilities.
// Each plot keeps a connected perimeter and a central pedestrian lane.
export function urbanBlocks(){return PADDIES.filter(p=>p.urban).map((p,i)=>{
 const x=(p.x0+p.x1)/2,z=(p.z0+p.z1)/2,r=regionAt(x,z),w=p.x1-p.x0,d=p.z1-p.z0;
 const bw=Math.min(9,(w-11)/2),bd=Math.min(r.id==='dongbu'?10:18,d-8);
 const buildings=[];
 for(const side of [-1,1]){
  const zs=r.id==='dongbu'?[-d/4,d/4]:[0];
  for(const offset of zs)buildings.push({x:x+side*(w/2-3-bw/2),z:z+offset,w:bw,d:bd,h:r.id==='dongbu'?15+(i%4)*3:r.id==='yuting'?10+(i%2)*3:7+(i%2)*2});
 }
 const fitted=buildings.filter(b=>b.x-b.w/2>=r.minX&&b.x+b.w/2<=r.maxX);
 return {...p,id:'urban:'+i,x,z,w,d,region:r.id,buildings:fitted,entry:{x,z:p.z1-1.5},landmark:i%5===0};
});}
export const URBAN_NAMES={chengwan:'澄湾科创园',yuting:'榆庭生活院',dongbu:'东埠试造坊'};
