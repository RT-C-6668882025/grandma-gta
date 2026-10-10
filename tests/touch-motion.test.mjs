import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const moduleUrl = async path => 'data:text/javascript;base64,'+(await readFile(new URL(path,import.meta.url))).toString('base64');
const motionUrl=await moduleUrl('../src/touch-motion.js');
const {stickVector,mixMovement,createTouchMotion,touchMove}=await import(motionUrl);
test('analog stick has a deadzone, proportional speed and circular diagonal limit',()=>{
  assert.deepEqual(stickVector(3,4,100),{x:0,y:0});
  assert.deepEqual(stickVector(10,10,0),{x:0,y:0});
  const light=stickVector(0,-40,100),full=stickVector(0,-100,100),diagonal=stickVector(100,100,100);
  assert.ok(light.y<0 && light.y>full.y);assert.equal(full.y,-1);
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-10);
});
test('movement and camera fingers release independently and ignore other fingers',()=>{
  const state=createTouchMotion();assert.equal(state.beginStick(1),true);assert.equal(state.beginStick(2),false);
  assert.equal(state.beginLook(2,10,10),true);assert.equal(state.beginLook(3,10,10),false);
  state.updateStick(1,0,-100,100);assert.deepEqual(state.lookDelta(2,30,5),{x:20,y:-5});
  assert.equal(state.endStick(3),false);state.endLook(2);assert.equal(state.move.y,-1);
  state.endStick(1);assert.deepEqual(state.move,{x:0,y:0});
});
test('keyboard and analog movement combine and pause blocks motion',()=>{
  assert.deepEqual(mixMovement(0,0,{x:.4,y:-.6},true),{fw:.6,rt:.4});
  assert.deepEqual(mixMovement(1,1,{x:.4,y:-.6},true),{fw:1,rt:1});
  assert.deepEqual(mixMovement(1,1,{x:.4,y:-.6},false),{fw:0,rt:0});
});
const inputUrl=await moduleUrl('../src/input.js'),input=await import(inputUrl);
let source=await readFile(new URL('../src/touch.js',import.meta.url),'utf8');
source=source.replace("'./input.js'",JSON.stringify(inputUrl)).replace("'./touch-motion.js'",JSON.stringify(motionUrl));
const {initTouch}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function element(key) {
  const handlers=new Map(), classes=new Set();
  return {dataset:{key},style:{},hidden:false,handlers,attributes:{},
    classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v),contains:v=>classes.has(v)},
    addEventListener:(type,fn)=>handlers.set(type,fn),setPointerCapture(){},setAttribute(name,v){this.attributes[name]=v;},
    closest:()=>key && !['Escape','Tab','KeyT','KeyM'].includes(key),getBoundingClientRect:()=>({left:0,top:0,width:100}),
    fire(type,id,x=50,y=50){handlers.get(type)?.({pointerId:id,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});}};
}
test('wired controls support three fingers and reset across background, resize and pause',()=>{
  const globals=new Map(), buttons=['KeyJ','KeyF','Space'].map(element),pad=element(),knob=element(),more=element(),drawer=element(),toggle=element(),canvas=element(),root=element();
  drawer.hidden=true;pad.querySelector=()=>knob;root.querySelector=s=>({'#touchStick':pad,'#touchMore':more,'#touchMorePanel':drawer,'#touchToggle':toggle}[s]||buttons.find(b=>s.includes(b.dataset.key)));
  root.querySelectorAll=s=>s==='[data-key]'?buttons:buttons.filter(b=>b.classList.contains('held'));
  globalThis.document={hidden:false,body:{append(){},classList:element().classList},createElement:()=>root,addEventListener:(t,fn)=>globals.set(t,fn)};
  Object.defineProperty(globalThis,'navigator',{value:{maxTouchPoints:5},configurable:true});globalThis.addEventListener=(t,fn)=>globals.set(t,fn);
  const state={active:true,playing:true,dancing:false,driving:false},update=initTouch(canvas,()=>state);update();input.resetInput();
  const start=()=>{pad.fire('pointerdown',1,50,0);canvas.fire('pointerdown',2);buttons[0].fire('pointerdown',3);};
  start();canvas.fire('pointermove',2,80,40);assert.equal(touchMove.y,-1);assert.equal(input.down('KeyJ'),true);assert.equal(input.mouse.dx,30);
  canvas.fire('pointerup',2);assert.equal(touchMove.y,-1);buttons[0].fire('pointerup',3);assert.equal(input.down('KeyJ'),false);pad.fire('pointerup',1);assert.equal(touchMove.y,0);
  more.onclick();assert.equal(drawer.hidden,false);assert.equal(more.attributes['aria-expanded'],'true');
  for(const event of ['blur','resize','visibilitychange']){start();document.hidden=true;globals.get(event)();assert.equal(touchMove.y,0);assert.equal(input.down('KeyJ'),false);assert.equal(drawer.hidden,true);}
  document.hidden=false;start();state.playing=false;update();assert.equal(touchMove.y,0);assert.equal(input.down('KeyJ'),false);
  state.playing=true;update();buttons[0].fire('pointerdown',4);buttons[0].fire('pointerup',4);assert.equal(buttons[0].classList.contains('held'),false);
  state.driving=true;update();assert.equal(buttons[1].textContent,'下車');assert.equal(buttons[2].textContent,'剎車 / 喇叭');
});
