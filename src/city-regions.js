// Area shares refer to the existing 680 x 680 m playable planning boundary.
export const CITY_REGIONS=[
 {id:'chengwan',name:'澄湾区',share:.30,minX:-340,maxX:-136,minZ:-340,maxZ:340,x:-205,z:0,color:'#8acbbd',style:'campus',description:'研发园区 · 玻璃建筑 · 绿地与开放空间'},
 {id:'yuting',name:'榆庭区',share:.45,minX:-136,maxX:170,minZ:-340,maxZ:340,x:15,z:0,color:'#d8c9a4',style:'europe',description:'成熟街区 · 石材立面 · 拱廊与广场'},
 {id:'dongbu',name:'东埠区',share:.25,minX:170,maxX:340,minZ:-340,maxZ:340,x:214,z:0,color:'#b581b2',style:'neon',description:'密集旧街 · 廉价霓虹 · 外露设施'}
];
export const regionAt=(x,z=0)=>CITY_REGIONS.find(r=>x>=r.minX&&x<r.maxX)||CITY_REGIONS[x< -340?0:2];
export const regionLabel=(place)=>regionAt(place.x,place.z).name;
export const regionMarkers=()=>CITY_REGIONS.map(r=>({...r,label:r.name,category:'region',detail:r.description+' · 规划面积 '+Math.round(r.share*100)+'%'}));
