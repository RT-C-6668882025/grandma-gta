import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/input.js', import.meta.url));
const input = await import('data:text/javascript;base64,' + source.toString('base64'));
test('releasing touch does not release a held physical key', () => {
  input.resetInput(); input.keys.add('KeyW'); input.holdKey('KeyW', 1, true); input.holdKey('KeyW', 1, false);
  assert.equal(input.down('KeyW'), true);
});
test('multiple pointers can own the same action independently', () => {
  input.resetInput(); input.holdKey('ShiftLeft', 1, true); input.holdKey('ShiftLeft', 2, true);
  input.holdKey('ShiftLeft', 1, false); assert.equal(input.down('ShiftLeft'), true);
  input.holdKey('ShiftLeft', 2, false); assert.equal(input.down('ShiftLeft'), false);
});
test('touch actions have one-frame edges and reset clears held input', () => {
  input.resetInput(); input.holdKey('KeyE', 1, true); assert.equal(input.hit('KeyE'), true);
  input.endFrame(); assert.equal(input.hit('KeyE'), false); assert.equal(input.down('KeyE'), true);
  input.mouse.dx = 10; input.mouse.clickL = true; input.resetInput();
  assert.equal(input.down('KeyE'), false); assert.equal(input.mouse.dx, 0); assert.equal(input.mouse.clickL, false);
});

test('unsupported pointer lock immediately falls back to left attack and right drag', () => {
  input.resetInput();
  const listeners = new Map(), canvasListeners = new Map();
  globalThis.addEventListener = (type, fn) => listeners.set(type, fn);
  globalThis.document = { hidden: false, pointerLockElement: null, addEventListener: (type, fn) => listeners.set(type, fn) };
  const canvas = { addEventListener: (type, fn) => canvasListeners.set(type, fn) };
  input.initInput(canvas);
  canvasListeners.get('mousedown')({button:0});
  assert.equal(input.mouse.clickL, true);
  listeners.get('mouseup')({button:0});
  canvasListeners.get('mousedown')({button:2});
  listeners.get('mousemove')({movementX:12,movementY:-4});
  assert.equal(input.mouse.dx,12); assert.equal(input.mouse.dy,-4);
  listeners.get('mouseup')({button:2}); input.endFrame();
  listeners.get('mousemove')({movementX:12,movementY:-4});
  assert.equal(input.mouse.dx,0);
  input.setUiBlocking(() => true);
  canvasListeners.get('mousedown')({button:0}); assert.equal(input.mouse.clickL,false);
  input.setUiBlocking(() => false);
  canvasListeners.get('mousedown')({button:0,sourceCapabilities:{firesTouchEvents:true}});
  assert.equal(input.mouse.clickL,false);
  input.keys.add('KeyW'); input.holdKey('KeyE',1,true);
  listeners.get('blur')(); assert.equal(input.down('KeyW','KeyE'),false);
});

test('visible cursor mode never asks for pointer lock and right drag uses client coordinates', () => {
  input.resetInput(); input.setMouseMode('drag');
  const listeners = new Map(), canvasListeners = new Map(); let requests = 0;
  globalThis.addEventListener = (type, fn) => listeners.set(type, fn);
  globalThis.document = {pointerLockElement:null, addEventListener:(type,fn)=>listeners.set(type,fn)};
  input.initInput({requestPointerLock:()=>{requests++},addEventListener:(type,fn)=>canvasListeners.set(type,fn)});
  canvasListeners.get('mousedown')({button:0,clientX:20,clientY:30});
  assert.equal(requests,0); assert.equal(input.mouse.clickL,true);
  listeners.get('mouseup')({button:0});
  canvasListeners.get('mousedown')({button:2,clientX:20,clientY:30});
  listeners.get('mousemove')({clientX:32,clientY:25,movementX:0,movementY:0});
  assert.equal(input.mouse.dx,12);assert.equal(input.mouse.dy,-5);
  listeners.get('mouseup')({button:2}); input.endFrame();
  listeners.get('mousemove')({clientX:40,clientY:35}); assert.equal(input.mouse.dx,0);
});

test('Android pointer-only mouse movement turns the camera without holding a button', () => {
  input.setMouseMode('free'); input.setUiBlocking(()=>false);
  globalThis.PointerEvent = class {};
  const listeners=new Map(), handlers=new Map();
  globalThis.addEventListener=(name,fn)=>listeners.set(name,fn);
  globalThis.document={pointerLockElement:null,addEventListener:(name,fn)=>listeners.set(name,fn)};
  const canvas={addEventListener:(name,fn)=>handlers.set(name,fn)};
  input.initInput(canvas);
  listeners.get('pointermove')({pointerType:'mouse',target:canvas,clientX:20,clientY:30,movementX:0,movementY:0});
  listeners.get('pointermove')({pointerType:'mouse',target:canvas,clientX:32,clientY:25,movementX:0,movementY:0});
  assert.equal(input.mouse.dx,12);assert.equal(input.mouse.dy,-5);
  listeners.get('mousemove')({target:canvas,clientX:32,clientY:25,movementX:12,movementY:-5});
  assert.equal(input.mouse.dx,12); // compatibility events must not double camera input
  input.endFrame();
  listeners.get('pointermove')({pointerType:'touch',target:canvas,clientX:50,clientY:50});
  assert.equal(input.mouse.dx,0);
  input.setUiBlocking(()=>true);
  listeners.get('pointermove')({pointerType:'mouse',target:canvas,clientX:60,clientY:60});
  assert.equal(input.mouse.dx,0);
  input.setUiBlocking(()=>false);delete globalThis.PointerEvent;
});
