// Camera selects an aim point; the physical muzzle must still have a clear shot.
export function shotSolution(cameraOrigin,cameraDirection,muzzle,targets,rayTarget,block,range=35){
 const cameraEnd={x:cameraOrigin.x+cameraDirection.x*range,y:cameraOrigin.y+cameraDirection.y*range,z:cameraOrigin.z+cameraDirection.z*range};
 const cameraLimit=range*block(cameraOrigin,cameraEnd),picked=rayTarget(cameraOrigin,cameraDirection,targets,range,cameraLimit);
 const distance=picked?.distance??cameraLimit,point={x:cameraOrigin.x+cameraDirection.x*distance,y:cameraOrigin.y+cameraDirection.y*distance,z:cameraOrigin.z+cameraDirection.z*distance};
 const dx=point.x-muzzle.x,dy=point.y-muzzle.y,dz=point.z-muzzle.z,len=Math.hypot(dx,dy,dz),direction=len>1e-6?{x:dx/len,y:dy/len,z:dz/len}:{...cameraDirection};
 const fraction=block(muzzle,point),muzzleLimit=Math.min(range,fraction<1?len*fraction:len+.1),hit=rayTarget(muzzle,direction,targets,Math.min(range,len+.1),muzzleLimit);
 const impact={x:muzzle.x+direction.x*muzzleLimit,y:muzzle.y+direction.y*muzzleLimit,z:muzzle.z+direction.z*muzzleLimit};
 return {point,impact,direction,hit,blocked:!hit&&muzzleLimit+ .05<len};
}
