// 番薯寮 — the town plan. x = east, z = south (the minimap draws -z up).
// Everything that places things in the world reads from here.

export const WORLD = 720;          // terrain square side, metres
export const BOUND = 340;          // playable half-extent

// named spots
export const P = {
  home:     { x: -112, z: 92 },    // 三合院 (courtyard opens north onto the field road)
  shop:     { x: -24, z: -13 },    // 阿桃柑仔店 door (north side of main street)
  hardware: { x: 18, z: -13 },     // 金興五金行
  police:   { x: 104, z: -13 },    // 派出所
  clinic:   { x: -128, z: 13 },    // 仁愛診所
  market:   { x: -60, z: -55 },    // 菜市場 street centre
  cloth:    { x: -62.6, z: -86 },  // 夜市衣攤 (in front of the west arcade)
  temple:   { x: 50, z: -108 },    // 番薯寮 媽祖廟 (front door)
  square:   { x: 50, z: -80 },     // 廟口廣場
  station:  { x: -205, z: -26 },   // 番薯寮車站
  taxiStand:{ x: -196, z: -8 },
  recycle:  { x: 140, z: 36 },     // 回收場
  betel:    { x: 214, z: 44 },     // 檳榔攤 by the provincial road
  banyan:   { x: -160, z: 40 },    // 大榕樹 — old men and chess
  shrine:   { x: 60, z: 70 },      // 土地公廟 at the field corner
  school:   { x: 150, z: -70 },    // 國小
  court:    { x: -124, z: -78 },   // 活動中心籃球場 (廣場舞大賽)
  hideout:  { x: -206, z: -156 },  // 舊鐵皮倉庫 — 阿凱幫的詐騙窩 (chapter 2)
  ktv:      { x: 70, z: 44 },      // 歡樂卡拉OK on 民生路
};

// roads: polyline + width. kind: main / street / lane / highway / field
export const ROADS = [
  { name: '中正路', kind: 'main', w: 12, pts: [[-230, 0], [230, 0]] },
  { name: '市場街', kind: 'street', w: 8, pts: [[-60, 0], [-60, -118]] },
  { name: '廟前路', kind: 'street', w: 9, pts: [[50, 0], [50, -64]] },
  { name: '台一線', kind: 'highway', w: 14, pts: [[200, -340], [200, 340]] },
  { name: '田中路', kind: 'field', w: 7, pts: [[-190, 62], [200, 62]] },
  { name: '竹圍巷', kind: 'lane', w: 7, pts: [[-150, 0], [-150, 62]] },
  { name: '學校路', kind: 'lane', w: 7, pts: [[120, 0], [120, -90], [200, -90]] },
  { name: '車站前', kind: 'lane', w: 8, pts: [[-230, 0], [-230, -40]] },
  { name: '活動中心路', kind: 'lane', w: 7, pts: [[-152, 0], [-152, -96]] },
  { name: '民生路', kind: 'street', w: 8, pts: [[-150, 38], [118, 38]] },
  { name: '和平街', kind: 'lane', w: 7, pts: [[-14, 0], [-14, 62]] },
  { name: '倉庫產業道路', kind: 'field', w: 6, pts: [[-152, -96], [-170, -128], [-188, -150]] },
  { name: '田邊路', kind: 'field', w: 5, pts: [[-40, 62], [-40, 230]] },
  { name: '溪邊路', kind: 'field', w: 5, pts: [[100, 62], [100, 230], [200, 230]] },
];

// traffic loops (right-hand traffic): list of points, driven in order and closed
export const LOOPS = [
  [[-150, 0], [200, 0], [200, 62], [-150, 62]],                   // town ring
  [[200, -330], [200, 330]],                                      // highway (bounce)
  [[-230, 0], [120, 0], [120, -90], [200, -90], [200, 0]],        // school loop
  [[-150, 38], [112, 38]],                                        // 民生路 (bounce)
];

// flattened lots (courtyards, squares): x,z centre, half sizes
export const LOTS = [
  { x: 50, z: -94, hw: 30, hd: 34, kind: 'square' },
  { x: -112, z: 90, hw: 18, hd: 16, kind: 'yard' },
  { x: -205, z: -24, hw: 22, hd: 14, kind: 'plaza' },
  { x: 140, z: 36, hw: 20, hd: 16, kind: 'gravel' },
  { x: 150, z: -64, hw: 26, hd: 20, kind: 'school' },
  { x: 104, z: -28, hw: 10, hd: 12, kind: 'concrete' },
  { x: -124, z: -78, hw: 22, hd: 17, kind: 'redbrick' },
  { x: -206, z: -156, hw: 22, hd: 16, kind: 'gravel' },
];

// flooded rice paddies: rect x0,z0,x1,z1 (split by ridges every ~30 m)
export const PADDIES = [];
for (let [x0, z0, x1, z1] of [[-30, 70, 92, 226], [108, 70, 192, 222], [-180, 118, -48, 226], [-86, 70, -48, 110], [210, -300, 320, -120], [210, 80, 320, 300], [-330, 70, -200, 300], [-330, -300, -240, -60], [70, -300, 190, -140]]) {
  x0 = Math.max(x0, -292); x1 = Math.min(x1, 292); z0 = Math.max(z0, -292); z1 = Math.min(z1, 292);
  const nx = Math.max(1, Math.round((x1 - x0) / 32)), nz = Math.max(1, Math.round((z1 - z0) / 30));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const a = x0 + ((x1 - x0) * i) / nx + 0.7, b = z0 + ((z1 - z0) * j) / nz + 0.7;
    const c = x0 + ((x1 - x0) * (i + 1)) / nx - 0.7, d = z0 + ((z1 - z0) * (j + 1)) / nz - 0.7;
    PADDIES.push({ x0: a, z0: b, x1: c, z1: d, dry: (i * 7 + j * 3) % 9 === 0 });
  }
}
export const PADDY_Y = -0.42, WATER_Y = -0.16;

// vegetable garden next to home (harvestable cabbages)
export const GARDEN = { x0: -140, z0: 76, x1: -128, z1: 104 };

// newspaper route: mailbox targets (door fronts)
export const PAPER_ROUTE = [
  [-132, -9], [-92, -9], [-8, 9], [34, 9], [76, -9], [132, 9], [-150, 34], [-122, 66], [-70, 66], [30, 66],
];

// taxi destinations
export const FARES = [
  { name: '媽祖廟', ...P.square },
  { name: '活動中心', x: -146, z: -70 },
  { name: '民生路', x: 40, z: 38 },
  { name: '菜市場', x: -60, z: -30 },
  { name: '車站', x: -212, z: -8 },
  { name: '檳榔攤', x: 206, z: 44 },
  { name: '國小', x: 120, z: -60 },
  { name: '土地公廟', x: 60, z: 66 },
  { name: '派出所', x: 104, z: -8 },
  { name: '回收場', x: 132, z: 8 },
  { name: '阿嬤家', x: -112, z: 66 },
];

// shophouse rows along main street: [x0, x1, side] side -1 = north, +1 = south
export const ROWS = [
  [-222, -158, -1], [-146, -66, -1], [-54, 44, -1], [56, 114, -1], [126, 190, -1],
  [-222, -158, 1], [-142, -20, 1], [-8, 116, 1], [164, 190, 1],
];

// shophouse rows along the side streets: [ax, az, bx, bz, side, frontOffset, depth?]
// side: which side of the travel direction a->b (+1 = right of travel)
export const SIDE_ROWS = [
  [-60, -14, -60, -114, 1, 7.0], [-60, -14, -60, -114, -1, 7.0],   // 市場街 both sides
  [50, -13, 50, -58, 1, 4.9], [50, -13, 50, -58, -1, 4.9],         // 廟前路
  [120, -13, 120, -44, -1, 3.9],                                    // 學校路 (west side)
  [-150, 13, -150, 31, 1, 3.9],                                     // 竹圍巷 east side
  [-128, 38, -19, 38, 1, 6.0, 12], [-128, 38, -19, 38, -1, 6.0, 12], // 民生路 (the suburban shopping street): 2 m pavement + 12 m deep houses
  [-9, 38, 112, 38, 1, 6.0, 12], [-9, 38, 112, 38, -1, 6.0, 12],
];
