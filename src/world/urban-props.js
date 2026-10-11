import {districtDestinations} from './urban-plan.js';
// Only assets already made by the original author. No proxy meshes on failure.
export function districtPropPlacements(){
 const out=[];
 const add=(hub,name,x,z,rotation,height)=>out.push({name,x:hub.center.x+x,z:hub.center.z+z,rotation,height,hub:hub.id});
 for(const hub of districtDestinations()){
  if(hub.region==='dongbu'){
   for(const x of [-8,8])for(const z of [-6,6]){add(hub,'calldesk',x,z,x<0?Math.PI/2:-Math.PI/2,1.1);add(hub,'radio',x,z,0,.35);}
   for(const x of [-9,9])add(hub,'shelf',x,0,x<0?Math.PI/2:-Math.PI/2,1.7);
  }else if(hub.region==='yuting'){
   for(const x of [-8,8]){add(hub,'foodcart',x,-6,x<0?Math.PI/2:-Math.PI/2,2);add(hub,'drumstool',x,7,0,.8);}
   for(const x of [-8,8])for(const z of [4,9])add(hub,'stools',x,z,0,.8);
  }else{
   for(const x of [-8,8]){add(hub,'calldesk',x,7,x<0?Math.PI/2:-Math.PI/2,1.1);add(hub,'radio',x,7,0,.35);}
   for(const x of [-8,8])add(hub,'stools',x,5,0,.8);
  }
 }
 return out;
}
