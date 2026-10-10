import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const nav=url(await readFile(new URL('../src/map-navigation.js',import.meta.url),'utf8'));
const {mountMap}=await import(url((await readFile(new URL('../src/map-panel.js',import.meta.url),'utf8')).replace("'./map-navigation.js'",JSON.stringify(nav))));
test('tapping a map marker starts navigation immediately; dragging does not',()=>{
  const ctx=new Proxy({}, {get:()=>()=>{},set:()=>true});
  const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:580,height:580}),setPointerCapture(){}};
  const search={value:''},filter={value:'all'},results={replaceChildren(){}},label={},go={};
  const nodes={'canvas':canvas,'#mapSearch':search,'#mapFilter':filter,'#mapResults':results,'#mapSelection':label,'[data-map="go"]':go,'[data-map="teleport"]':{}};
  const el={querySelector:s=>nodes[s],querySelectorAll:()=>[]};let calls=[];
  const old={d:globalThis.devicePixelRatio,r:globalThis.ResizeObserver};globalThis.devicePixelRatio=1;globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  try{
    const marker={x:0,z:20,label:'菜市場',category:'shop'};
    const dispose=mountMap(el,{base:{},world:720,player:{pos:{x:0,z:0}},markers:[marker],onNavigate:m=>{calls.push(m);return {path:[{x:0,z:0},m]};}});
    const ev=(x,z)=>({clientX:x,clientY:z,pointerId:1,preventDefault(){}});
    canvas.onpointerdown(ev(290,290));canvas.onpointerup(ev(290,290));assert.equal(calls.length,1);assert.equal(calls[0],marker);assert.match(label.textContent,/導航/);
    canvas.onpointerdown(ev(290,290));canvas.onpointermove(ev(310,310));canvas.onpointerup(ev(310,310));assert.equal(calls.length,1);dispose();
  }finally{globalThis.devicePixelRatio=old.d;globalThis.ResizeObserver=old.r;}
});
