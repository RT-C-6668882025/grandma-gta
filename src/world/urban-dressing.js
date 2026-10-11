import {districtPropPlacements} from './urban-props.js';
import {loadPropModels,placeInstanced,hasModel} from './props.js';
import {heightAt} from './terrain.js';
export async function dressDistrictCenters(scene){
 const placements=districtPropPlacements();
 await loadPropModels([...new Set(placements.filter(p=>p.name!=='radio').map(p=>p.name))]);
 await loadPropModels(['radio'],'gear');
 const grouped=new Map();
 for(const p of placements){
  if(!hasModel(p.name))continue;
  const list=grouped.get(p.name)||[];
  // Radios sit on the authored desk instead of floating or penetrating the pavement.
  list.push([p.x,p.z,p.rotation,p.height,p.name==='radio'?heightAt(p.x,p.z)+.82:undefined]);grouped.set(p.name,list);
 }
 for(const [name,items] of grouped)placeInstanced(scene,name,items,{collide:name==='radio'?undefined:'box'});
}
