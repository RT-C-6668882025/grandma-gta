import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/fullscreen.js',import.meta.url));
const {toggleFullscreen}=await import('data:text/javascript;base64,'+source.toString('base64'));
test('fullscreen uses a direct browser request and hides navigation UI',async()=>{
 let options;
 assert.equal(await toggleFullscreen({fullscreenEnabled:true,documentElement:{requestFullscreen:async o=>{options=o}}}),true);
 assert.deepEqual(options,{navigationUI:'hide'});
});
test('iframe or browser policy failure is reported without pretending to be fullscreen',async()=>{
 await assert.rejects(toggleFullscreen({fullscreenEnabled:false}),/權限/);
 await assert.rejects(toggleFullscreen({documentElement:{}}),/沒有提供/);
 await assert.rejects(toggleFullscreen({documentElement:{requestFullscreen:async()=>{throw new Error('denied')}}}),/denied/);
});
test('fullscreen exits when already active',async()=>{
 let exited=false;assert.equal(await toggleFullscreen({fullscreenElement:{},exitFullscreen:async()=>{exited=true}}),false);assert.equal(exited,true);
});
