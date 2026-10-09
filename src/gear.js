// Items: every hat / glasses / chain / top / weapon 阿嬤 can wear, plus
// consumables, sellables and quest items. Wearables build an Object3D in a
// canonical frame the actor attaches to a bone:
//   weapon: grip at origin, tip +Z, flat side vertical     (right fist)
//   glasses: bridge at origin, lenses facing +Z, width X     (head, at the eyes)
//   hat: crown centre at origin, up +Y, front +Z             (head)
//   chain: neck ring centre at origin, hangs down +Z front  (chest)
// "swag" (痞度) adds up across what she wears; it changes prices and how
// people react to her.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SLOTS = ['hat', 'glasses', 'chain', 'top', 'bag', 'weapon'];
export const SLOT_NAME = { hat: '帽子', glasses: '眼鏡', chain: '項鍊', top: '衣服', bag: '提袋', weapon: '武器' };

export const ITEMS = {
  // ---- hats
  straw:    { name: '斗笠', slot: 'hat', price: 0, swag: 0, desc: '陪阿嬤曬了四十年太陽的斗笠。土，但是透氣。', icon: '👒', base: true },
  towel:    { name: '毛巾頭巾', slot: 'hat', price: 30, swag: 2, desc: '農會送的白毛巾，綁在頭上擦汗兼造型。', icon: '🧣' },
  cap:      { name: '農會紅帽', slot: 'hat', price: 80, swag: 5, desc: '「番薯寮農會 · 豐收」鴨舌帽。選舉贈品等級的潮。', icon: '🧢' },
  helmet:   { name: '工地安全帽', slot: 'hat', price: 180, swag: 4, armor: 0.2, desc: '黃色安全帽。被打頭少痛兩成。', icon: '⛑️' },
  perm:     { name: '阿姨大捲髮', slot: 'hat', price: 450, swag: 12, desc: '美美髮廊招牌燙，一燙管半年。廣場舞氣勢 +1。', icon: '💇' },
  cowboy:   { name: '白色牛仔帽', slot: 'hat', price: 600, swag: 15, desc: '那卡西歌手最愛。戴上要走台步。', icon: '🤠' },
  crown:    { name: '塑膠皇冠', slot: 'hat', price: 1200, swag: 25, desc: '婚紗店退役道具。番薯寮女王駕到。', icon: '👑' },
  // ---- glasses
  reading:  { name: '老花眼鏡', slot: 'glasses', price: 50, swag: 1, desc: '看刮刮樂的時候很好用。', icon: '👓' },
  toad:     { name: '蛤蟆鏡', slot: 'glasses', price: 350, swag: 12, desc: '阿水伯送的生日禮物。「妳戴起來很像林青霞」。', icon: '🕶️', glb: 'sunglasses' },
  star:     { name: '星星派對眼鏡', slot: 'glasses', price: 220, swag: 8, desc: '夜市套圈圈贏來的。晚上會發光。', icon: '🤩' },
  goldshade:{ name: '金框雷朋', slot: 'glasses', price: 900, swag: 18, desc: '金框、茶色鏡片。戴上之後講話會自動變慢。', icon: '😎', glb: 'sunglasses', tint: 0x1a1008 },
  // ---- chains
  plastic:  { name: '塑膠金鍊', slot: 'chain', price: 60, swag: 3, desc: '夜市十元一條，陽光下金光閃閃（遠看）。', icon: '📿' },
  beads:    { name: '佛珠', slot: 'chain', price: 180, swag: 5, desc: '廟口求來的。佩戴時慢慢回血。', icon: '📿', regen: 1 },
  gold:     { name: '足金項鍊', slot: 'chain', price: 2500, swag: 15, desc: '鴻福銀樓的真金。流氓看到會先客氣三分。', icon: '🥇' },
  medal:    { name: '「財」字大金牌', slot: 'chain', price: 6800, swag: 30, desc: '比拳頭還大的金牌。整個台一線都知道妳發了。', icon: '💰' },
  // ---- tops (recolour the shirt on 阿嬤's texture)
  floral:   { name: '粉紅花衫', slot: 'top', price: 0, swag: 0, desc: '菜市場三件一百。最原始的阿嬤魂。', icon: '👚', base: true },
  purple:   { name: '紫色花衫', slot: 'top', price: 150, swag: 3, desc: '同一款，換個顏色就是新衣服。', icon: '👚', recolor: { hue: 280 } },
  neon:     { name: '螢光綠運動衫', slot: 'top', price: 260, swag: 9, desc: '晚上騎三輪車很安全，因為大家都看得到。', icon: '🟩', recolor: { hue: 95, sat: 1.3, light: 1.25 } },
  camo:     { name: '迷彩衫', slot: 'top', price: 350, swag: 8, desc: '當兵的兒子留下來的。在稻田裡隱身（自以為）。', icon: '🪖', recolor: { pattern: 'camo' } },
  leopard:  { name: '豹紋衫', slot: 'top', price: 480, swag: 12, desc: '大姐頭標配。穿上去連狗都不敢叫。', icon: '🐆', recolor: { pattern: 'leopard' } },
  sequin:   { name: '金亮片演出服', slot: 'top', price: 1600, swag: 22, desc: '卡拉 OK 比賽冠軍戰袍。在路燈下閃瞎全場。', icon: '✨', recolor: { pattern: 'sequin' } },
  // ---- bags (left hand)
  bag:      { name: '茄芷袋', slot: 'bag', price: 40, swag: 4, desc: '紅白藍條紋的茄芷袋，裝得下菜、裝得下錢、裝得下整個番薯寮。', icon: '👜', glb: 'bag' },
  // ---- weapons
  fist:     { name: '拳頭', slot: 'weapon', price: 0, dmg: 8, reach: 1.25, speed: 1.15, desc: '吃過飯的人都知道阿嬤的拳頭。', icon: '✊', base: true },
  spatula:  { name: '鍋鏟', slot: 'weapon', price: 60, dmg: 12, reach: 1.5, speed: 1.1, swag: 1, desc: '炒菜用的，打人也順手。', icon: '🍳', len: 0.42 },
  umbrella: { name: '黑雨傘', slot: 'weapon', price: 120, dmg: 14, reach: 1.9, speed: 1.0, swag: 2, desc: '下雨擋雨，不下雨擋流氓。', icon: '☂️', len: 0.9 },
  stick:    { name: '竹棍', slot: 'weapon', price: 150, dmg: 18, reach: 1.9, speed: 1.0, swag: 5, desc: '金興五金行的竹扁擔，挑菜打架兩相宜。', icon: '🦯', glb: 'stick', axis: 'z', tip: -1, grip: -0.38, len: 1.05 },
  cane:     { name: '阿水伯的拐杖', slot: 'weapon', price: 0, dmg: 16, reach: 1.7, speed: 1.05, swag: 3, desc: '老伴的拐杖，打人時他在旁邊喊加油。', icon: '🦯', len: 0.9, noSell: true },
  golf:     { name: '金牙伯的金球桿', slot: 'weapon', price: 0, dmg: 24, reach: 2.0, speed: 0.95, swag: 14, desc: '從詐騙窩搶來的戰利品。純金桿頭，打一下等於罰他一次。', icon: '🏌️', glb: 'golfclub', rotX: -Math.PI / 2, grip: -0.42, len: 1.0, noSell: true },
  bat:      { name: '球棒', slot: 'weapon', price: 520, dmg: 26, reach: 1.8, speed: 0.9, swag: 10, desc: '少棒冠軍紀念球棒。一棒一個流氓。', icon: '🏏', glb: 'bat', axis: 'z', tip: -1, grip: -0.36, len: 0.86 },
  // ---- throwables / consumables
  slipper:  { name: '藍白拖', price: 20, stack: true, desc: '按 G 丟出去。台灣阿嬤的遠程武器，百發百中。', icon: '🩴', glb: 'slipper', dmg: 14 },
  cig:      { name: '長壽菸', price: 90, stack: true, desc: '一包。按 X 點一支：痞度 +8、體力恢復加快（不要學）。', icon: '🚬' },
  bolida:   { name: '寶力大補', price: 60, stack: true, desc: '按 H 喝。「喝了打架不會累」，回 45 血。', icon: '🍶', heal: 45 },
  betel:    { name: '檳榔', price: 50, stack: true, desc: '按 B 嚼。體力回滿，嘴巴變紅。', icon: '🌰' },
  soda:     { name: '彈珠汽水', price: 25, stack: true, desc: '按 H 喝（沒有寶力大補時），回 15 血。', icon: '🥤', heal: 15 },
  bread:    { name: '菠蘿麵包', price: 30, stack: true, desc: '按 H 吃，回 25 血。', icon: '🍞', heal: 25 },
  lottery:  { name: '刮刮樂', price: 100, stack: true, desc: '在背包裡使用。可能中 5000，也可能刮心酸。', icon: '🎫', use: true },
  // ---- sellables
  cardboard:{ name: '紙箱', price: 0, sell: 12, stack: true, desc: '回收場一個 12 塊，柑仔店只收 8 塊。', icon: '📦', junk: true },
  bottle:   { name: '寶特瓶', price: 0, sell: 3, stack: true, desc: '回收場收。', icon: '🧴', junk: true },
  cabbage:  { name: '高麗菜', price: 0, sell: 35, stack: true, desc: '自己菜園種的。賣給菜市場或柑仔店。', icon: '🥬', produce: true },
  spinach:  { name: '空心菜', price: 0, sell: 20, stack: true, desc: '菜攤阿伯送的。', icon: '🥬', produce: true },
  paper:    { name: '報紙', price: 0, stack: true, desc: '要送的報紙。騎腳踏車時按左鍵丟進信箱。', icon: '📰', quest: true },
  trophy:   { name: '廣場舞冠軍獎盃', slot: 'weapon', price: 0, dmg: 22, reach: 1.5, speed: 0.95, swag: 20, desc: '第一屆番薯寮廣場舞大賽冠軍。也可以拿來打人（很重）。', icon: '🏆', glb: 'trophy', noSell: true },
  passbook: { name: '阿水伯的存摺', price: 0, desc: '從詐騙仔手上搶回來的。', icon: '📘', quest: true },
};
export const SHOP_STOCK = {
  shop: ['cig', 'bolida', 'betel', 'soda', 'bread', 'lottery', 'slipper', 'reading', 'plastic', 'towel'],
  hardware: ['spatula', 'umbrella', 'stick', 'bat', 'helmet', 'slipper'],
  cloth: ['bag', 'purple', 'neon', 'camo', 'leopard', 'sequin', 'cap', 'perm', 'cowboy', 'crown', 'star', 'goldshade', 'toad', 'beads'],
  jewel: ['gold', 'medal', 'beads'],
  betel: ['betel', 'cig', 'bolida', 'soda'],
  mart: ['bread', 'soda', 'bolida', 'cig', 'lottery', 'slipper', 'betel', 'umbrella'],
};
export const BUYS = {
  shop: ['cardboard', 'cabbage', 'spinach'],
  recycle: ['cardboard', 'bottle'],
  cloth: [],
  market: ['cabbage', 'spinach'],
};

const loader = new GLTFLoader();
const glbs = {};
export async function loadGear() {
  const need = new Set(['sunglasses', 'stick', 'bat', 'slipper', 'newspaper', 'bag', 'trophy', 'golfclub']);
  await Promise.all([...need].map(async (n) => {
    try {
      const g = await loader.loadAsync(`assets/gear/${n}.glb`);
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
      glbs[n] = g.scene;
    } catch (e) { console.warn('gear missing', n); }
  }));
}

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.6, metalness: o.m ?? 0, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1 });
const box = () => new THREE.Box3();
// fit a GLB into a canonical frame. opts: rotY, axis/tip/grip/len (weapons), width (glasses)
function fromGlb(name, fit) {
  const src = glbs[name];
  if (!src) return null;
  const obj = src.clone(true);
  const inner = new THREE.Group();
  inner.add(obj);
  if (fit.rotY) obj.rotation.y = fit.rotY;
  if (fit.rotX) obj.rotation.x = fit.rotX;
  obj.updateMatrixWorld(true);
  const b = box().setFromObject(obj), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  let k = 1;
  if (fit.len) k = fit.len / s.z;
  if (fit.width) k = fit.width / s.x;
  obj.scale.multiplyScalar(k);
  const pos = c.clone().multiplyScalar(-k);
  if (fit.frontAt0) pos.z = -b.max.z * k;           // front face at z = 0
  if (fit.gripAt !== undefined) pos.z = -(c.z + fit.gripAt * s.z) * k;
  obj.position.copy(pos);
  const g = new THREE.Group();
  g.add(inner);
  return g;
}

// weapons ----------------------------------------------------------------
function weaponMesh(id) {
  const it = ITEMS[id];
  if (it.glb) {
    // glb long axis is z with the tip at -z: flip so the tip is +z, grip at origin
    // tip at -z in the file: turn it round so the tip is +z, then put the grip at the origin
    const g = fromGlb(it.glb, { rotY: it.rotX ? 0 : it.tip < 0 ? Math.PI : 0, rotX: it.rotX, len: it.len, gripAt: -Math.abs(it.grip) });
    if (g) return g;
  }
  const g = new THREE.Group();
  if (id === 'spatula') {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.3, 8).rotateX(Math.PI / 2).translate(0, 0, 0.05), M(0x3a2414));
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.006, 0.12).translate(0, 0, 0.26), M(0xb8bcc0, { m: 0.8, r: 0.3 }));
    b.rotation.x = 0.3; g.add(h, b);
  } else if (id === 'umbrella') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6).rotateX(Math.PI / 2).translate(0, 0, 0.35), M(0x222222, { m: 0.5 })));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.62, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.45), M(0x151515, { r: 0.8 })));
    const hk = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI).rotateY(Math.PI / 2).translate(0, -0.05, -0.1), M(0x5a3a1a));
    g.add(hk);
  } else if (id === 'cane') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.9, 8).rotateX(Math.PI / 2).translate(0, 0, 0.36), M(0x5a3418)));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.017, 6, 12, Math.PI).rotateY(Math.PI / 2).translate(0, 0.06, -0.09), M(0x5a3418)));
  }
  return g;
}

// glasses ----------------------------------------------------------------
function glassesMesh(id, width) {
  const it = ITEMS[id];
  if (it.glb) {
    const g = fromGlb(it.glb, { rotY: -Math.PI / 2, width, frontAt0: true });
    if (g && it.tint) g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (o.material.color && o.material.color.getHSL({}).l < 0.3) o.material.color.set(it.tint); } });
    return g;
  }
  const g = new THREE.Group();
  const w = width;
  if (id === 'reading') {
    const mat = M(0x8a6a3a, { m: 0.4 });
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(w * 0.2, w * 0.018, 6, 16), mat); rim.position.set(s * w * 0.24, 0, 0.005); g.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(w * 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xddeeff, transparent: true, opacity: 0.25, roughness: 0.05 })); lens.position.copy(rim.position); g.add(lens);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(w * 0.02, w * 0.02, w * 0.9), mat); arm.position.set(s * w * 0.46, 0, -w * 0.45); g.add(arm);
    }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.1, w * 0.02, w * 0.02), mat));
  } else if (id === 'star') {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? w * 0.11 : w * 0.26, a = (i / 10) * Math.PI * 2 + Math.PI / 2; i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w * 0.04, bevelEnabled: false });
    for (const [s, c] of [[-1, 0xff3aa0], [1, 0x3ad8ff]]) { const m = new THREE.Mesh(geo, M(c, { e: c, ei: 0.8 })); m.position.set(s * w * 0.27, 0, 0); g.add(m); }
    const arm = M(0xff3aa0);
    for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.BoxGeometry(w * 0.03, w * 0.03, w * 0.9), arm); a.position.set(s * w * 0.48, 0, -w * 0.45); g.add(a); }
    g.userData.glow = true;
  }
  return g;
}

// hats -------------------------------------------------------------------
function hatMesh(id, width) {
  const g = new THREE.Group();
  const r = width / 2;
  if (id === 'towel') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.06, r * 0.5, 16, 1, true), M(0xf4f2ea, { r: 0.95 }));
    band.position.y = -r * 0.15; band.material.side = THREE.DoubleSide; g.add(band);
    const top = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0xf4f2ea, { r: 0.95 })); top.scale.y = 0.75; top.position.y = r * 0.05; g.add(top);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(r * 0.25, 8, 6), M(0xf4f2ea)); knot.position.set(0, r * 0.1, r * 0.95); g.add(knot);
  } else if (id === 'cap') {
    const red = M(0xc8201a, { r: 0.8 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), red); dome.scale.y = 0.8; dome.position.y = -r * 0.25; g.add(dome);
    const bill = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, r * 0.05, 16, 1, false, -Math.PI / 2, Math.PI), red); bill.position.set(0, -r * 0.24, r * 0.7); bill.scale.z = 0.9; g.add(bill);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(r * 0.28, 12), M(0xfff4c0)); logo.position.set(0, r * 0.22, r * 0.93); logo.rotation.x = -0.45; g.add(logo);
  } else if (id === 'helmet') {
    const y = M(0xf2c21a, { r: 0.35 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), y); dome.scale.y = 0.85; dome.position.y = -r * 0.2; g.add(dome);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.32, r * 1.32, r * 0.05, 20), y); brim.position.y = -r * 0.2; brim.scale.z = 1.12; g.add(brim);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(r * 0.18, r * 0.15, r * 2.0), y); ridge.position.y = r * 0.72; g.add(ridge);
  } else if (id === 'perm') {
    const hair = M(0x6a2a1e, { r: 0.9 });
    for (let i = 0; i < 38; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      const c = new THREE.Mesh(new THREE.SphereGeometry(r * (0.32 + Math.random() * 0.12), 8, 6), hair);
      c.position.set(Math.cos(a) * Math.cos(e) * r * 1.05, Math.sin(e) * r * 1.0 - r * 0.1, Math.sin(a) * Math.cos(e) * r * 1.05 - r * 0.1);
      if (c.position.z > r * 0.5 && c.position.y < r * 0.35) continue; // keep the face clear
      g.add(c);
    }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair); cap.position.y = -r * 0.1; g.add(cap);
  } else if (id === 'cowboy') {
    const w = M(0xf4f0e6, { r: 0.7 });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 1.05, r * 1.1, 16), w); crown.position.y = r * 0.25; g.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.1, r * 2.1, r * 0.06, 24), w); brim.position.y = -r * 0.28; g.add(brim);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.0, r * 1.04, r * 0.2, 16, 1, true), M(0x2a1a10)); band.position.y = -r * 0.12; g.add(band);
    for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, r * 0.06, r * 2.4), w); f.position.set(s * r * 1.5, -r * 0.1, 0); f.rotation.z = s * 0.5; g.add(f); }
  } else if (id === 'crown') {
    const cloth = new THREE.Mesh(new THREE.SphereGeometry(r * 1.04, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0xa0101a, { r: 0.85 })); cloth.scale.y = 0.7; cloth.position.y = -r * 0.2; g.add(cloth);
    const gold = M(0xf4c430, { m: 0.9, r: 0.25 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 1.1, r * 0.4, 20, 1, true), gold); ring.position.y = -r * 0.05; ring.material.side = THREE.DoubleSide; g.add(ring);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const p = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, r * 0.6, 6), gold); p.position.set(Math.cos(a) * r * 1.08, r * 0.43, Math.sin(a) * r * 1.08); g.add(p); const j = new THREE.Mesh(new THREE.SphereGeometry(r * 0.1, 8, 6), M([0xe0102a, 0x10a0e0, 0x20c040][i % 3], { r: 0.1, m: 0.2 })); j.position.set(Math.cos(a) * r * 1.13, 0, Math.sin(a) * r * 1.13); g.add(j); }
  }
  return g;
}

// chains -----------------------------------------------------------------
function chainMesh(id, width) {
  const g = new THREE.Group();
  const R = width / 2;
  const mat = id === 'beads' ? M(0x5a2a14, { r: 0.4 }) : id === 'plastic' ? M(0xe8c040, { r: 0.35, m: 0.3 }) : M(0xf6c630, { m: 1, r: 0.18 });
  // a U-shaped loop: back of the neck up high, front hanging onto the chest
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const x = Math.sin(a) * R, z = Math.cos(a) * R * 0.75;
    const y = -Math.max(0, Math.cos(a)) * R * 0.9;
    pts.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  if (id === 'beads') {
    const bead = new THREE.SphereGeometry(R * 0.07, 8, 6);
    for (let i = 0; i < 30; i++) { const b = new THREE.Mesh(bead, mat); b.position.copy(curve.getPoint(i / 30)); g.add(b); }
  } else {
    const thick = id === 'medal' ? 0.045 : id === 'gold' ? 0.035 : 0.025;
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, R * thick, 6, true), mat));
  }
  if (id === 'medal') {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.42, R * 0.42, R * 0.07, 24).rotateX(Math.PI / 2), mat);
    coin.position.set(0, -R * 1.25, R * 0.78); g.add(coin);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d'); c.fillStyle = '#f6c630'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#a0101a'; c.font = 'bold 96px "PingFang TC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('財', 64, 70);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.36, 24), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.7, roughness: 0.25 }));
    face.position.set(0, -R * 1.25, R * 0.82); g.add(face);
  } else if (id === 'gold' || id === 'plastic') {
    const p = new THREE.Mesh(new THREE.OctahedronGeometry(R * 0.12), mat); p.position.set(0, -R * 0.95, R * 0.78); g.add(p);
  } else if (id === 'beads') {
    const tas = new THREE.Mesh(new THREE.ConeGeometry(R * 0.08, R * 0.3, 6), M(0xc8201a)); tas.position.set(0, -R * 1.05, R * 0.76); g.add(tas);
  }
  return g;
}

export function cigMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.07, 6).rotateX(Math.PI / 2), M(0xf4f2ea));
  const filt = new THREE.Mesh(new THREE.CylinderGeometry(0.0047, 0.0047, 0.022, 6).rotateX(Math.PI / 2).translate(0, 0, -0.045), M(0xd8903a));
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4).translate(0, 0, 0.036), new THREE.MeshBasicMaterial({ color: 0xff5a1a }));
  g.add(body, filt, ember);
  g.userData.ember = ember;
  return g;
}
export function paperBundle() { return fromGlb('newspaper', { len: 0.32 }) || new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.4), M(0xe8e4d8)); }
export function slipperMesh() { return fromGlb('slipper', { rotY: Math.PI / 2, len: 0.26 }) || new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.26), M(0x2a5ab8)); }
export function rolledPaper() {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 10).rotateZ(Math.PI / 2), M(0xece8dc, { r: 0.9 }));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.03, 10).rotateZ(Math.PI / 2), M(0xc0201a));
  const grp = new THREE.Group(); grp.add(g, band);
  return grp;
}

// build the wearable for a slot, sized to the wearer (attach carries width)
export function makeWear(id, at) {
  const it = ITEMS[id];
  if (!it || it.base) return null;
  if (it.slot === 'bag') { const b = fromGlb('bag', { len: 0.4 }); if (b) { b.children[0].position.y -= 0.2; } return b; }
  if (id === 'trophy') { const t = fromGlb('trophy', { len: 0.2 }); if (t) { t.rotation.x = -Math.PI / 2; } return t; }
  if (it.slot === 'weapon') return weaponMesh(id);
  if (it.slot === 'glasses') return glassesMesh(id, at?.width || 0.15);
  if (it.slot === 'hat') return hatMesh(id, at?.width || 0.2);
  if (it.slot === 'chain') return chainMesh(id, at?.width || 0.2);
  return null;
}

// ------------------------------------------------------------------ outfits: recolour the shirt
// The shirt region is found in UV space by rasterising the triangles whose
// vertices are skinned to the torso / upper arms; inside it, saturated pinks
// and reds (the floral print) are remapped, keeping the print's lightness.
let shirtMask = null;
const outfitCache = {};
export function buildShirtMask(actor) {
  if (shirtMask) return shirtMask;
  const mesh = actor.skins[0];
  const img = actor.baseMap?.image;
  if (!img) return null;
  const W = img.width, H = img.height;
  const g = mesh.geometry;
  const bones = mesh.skeleton.bones.map((b) => b.name);
  const torso = new Set(bones.map((n, i) => (/Spine|Shoulder|LeftArm$|RightArm$|ForeArm$|Hips/.test(n) ? i : -1)).filter((i) => i >= 0));
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, uv = g.attributes.uv;
  const vt = new Float32Array(si.count);
  for (let i = 0; i < si.count; i++) { let w = 0; for (let c = 0; c < 4; c++) if (torso.has(si.getComponent(i, c))) w += sw.getComponent(i, c); vt[i] = w; }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
  const idx = g.index ? g.index.array : null;
  const tri = idx ? idx.length / 3 : si.count / 3;
  for (let t = 0; t < tri; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, d = idx ? idx[t * 3 + 2] : t * 3 + 2;
    if ((vt[a] + vt[b] + vt[d]) / 3 < 0.5) continue;
    c.beginPath(); c.moveTo(uv.getX(a) * W, uv.getY(a) * H); c.lineTo(uv.getX(b) * W, uv.getY(b) * H); c.lineTo(uv.getX(d) * W, uv.getY(d) * H); c.closePath(); c.fill(); c.stroke();
  }
  shirtMask = c.getImageData(0, 0, W, H).data;
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const sc = src.getContext('2d'); sc.drawImage(img, 0, 0);
  shirtMask.base = sc.getImageData(0, 0, W, H);
  shirtMask.W = W; shirtMask.H = H;
  return shirtMask;
}
function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
function pattern(kind, x, y) {
  if (kind === 'leopard') {
    const cx = Math.floor(x / 22), cy = Math.floor(y / 22);
    const h = (Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453) % 1;
    const ox = (Math.abs(h) * 14) - 7, oy = (Math.abs(h * 7.3) % 1) * 14 - 7;
    const d = Math.hypot((x % 22) - 11 - ox * 0.5, (y % 22) - 11 - oy * 0.5);
    if (d < 4.5) return [0.1, 0.06, 0.03];
    if (d < 7) return [0.45, 0.22, 0.06];
    return [0.86, 0.62, 0.28];
  }
  if (kind === 'camo') {
    const n = Math.sin(x * 0.05) * Math.cos(y * 0.043) + Math.sin((x + y) * 0.021) * 0.8 + Math.sin(x * 0.11 - y * 0.07) * 0.4;
    return n > 0.8 ? [0.18, 0.2, 0.12] : n > 0 ? [0.35, 0.4, 0.22] : n > -0.8 ? [0.5, 0.45, 0.3] : [0.28, 0.24, 0.16];
  }
  if (kind === 'sequin') {
    const cell = ((Math.floor(x / 3) * 7 + Math.floor(y / 3) * 13) % 17) / 17;
    const v = 0.65 + cell * 0.55;
    return [0.95 * v, 0.76 * v, 0.28 * v];
  }
  return [1, 0, 1];
}
export function outfitTexture(actor, id) {
  const it = ITEMS[id];
  if (!it || !it.recolor) return null;
  if (outfitCache[id]) return outfitCache[id];
  const mask = buildShirtMask(actor);
  if (!mask) return null;
  const { W, H } = mask;
  const base = mask.base.data;
  const out = new ImageData(new Uint8ClampedArray(base), W, H);
  const d = out.data;
  const rc = it.recolor;
  for (let i = 0; i < W * H; i++) {
    if (mask[i * 4] < 128) continue;
    const p = i * 4;
    const r = base[p] / 255, g = base[p + 1] / 255, b = base[p + 2] / 255;
    const [h, s, l] = rgb2hsl(r, g, b);
    const pinkish = (h > 300 || h < 25) && s > 0.22 && l > 0.2;
    const pale = s < 0.25 && l > 0.55; // the white/cream parts of the print
    if (!pinkish && !pale) continue;
    let nr, ng, nb;
    if (rc.pattern) {
      const x = i % W, y = Math.floor(i / W);
      const [pr, pg, pb] = pattern(rc.pattern, x, y);
      const shade = 0.55 + l * 0.7;
      nr = pr * shade; ng = pg * shade; nb = pb * shade;
      if (rc.pattern === 'sequin' && ((x * 31 + y * 17) % 53) === 0) { nr = ng = nb = 1; }
    } else {
      if (pale) continue;
      [nr, ng, nb] = hsl2rgb(rc.hue + (h > 300 ? h - 360 : h), Math.min(1, s * (rc.sat || 1)), Math.min(0.95, l * (rc.light || 1)));
    }
    d[p] = nr * 255; d[p + 1] = ng * 255; d[p + 2] = nb * 255;
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  outfitCache[id] = tex;
  return tex;
}
export function swagOf(eq) { let s = 0; for (const k of SLOTS) s += ITEMS[eq[k]]?.swag || 0; return s; }
