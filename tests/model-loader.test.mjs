import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const original = new Uint8Array([103,108,84,70,2,0,0,0]);
const packed = gzipSync(original);
let source = await readFile(new URL('../src/model-loader.js', import.meta.url), 'utf8');
source = source.replace("import { MODEL_ASSETS } from './model-manifest.js';", `const MODEL_ASSETS = {'assets/test.glb': { url: 'assets/packed/test.glb.gz', size: ${packed.length} }};`);
let instance=0;
console.warn = () => {};
async function setup(fetcher, storage) {
  globalThis.fetch=fetcher; globalThis.caches=storage || {open:async()=>{throw new Error('storage unavailable')}};
  globalThis.location={href:'https://example.test/game/'};
  globalThis.dispatchEvent=()=>{};
  return import('data:text/javascript;base64,' + Buffer.from(source + `\n//${instance++}`).toString('base64'));
}
test('gzip yields exact original model and overlapping requests are shared', async()=>{
  let calls=0;
  const m=await setup(async()=>{calls++;return new Response(packed)});
  const loader={parseAsync:async bytes=>{assert.deepEqual(new Uint8Array(bytes),original);return 'model'}};
  assert.deepEqual(await Promise.all([m.loadModel(loader,'assets/test.glb'),m.loadModel(loader,'assets/test.glb')]),['model','model']);
  assert.equal(calls,1);
});
test('cached models avoid network even when offline',async()=>{
  const m=await setup(async()=>{throw new Error('offline')},{open:async()=>({match:async()=>new Response(packed)})});
  assert.equal(await m.loadModel({parseAsync:async()=>42},'assets/test.glb'),42);
});
test('failed packed downloads fall back to original',async()=>{
  const m=await setup(async()=>new Response('not a model',{status:404}));
  assert.equal(await m.loadModel({loadAsync:async path=>path},'assets/test.glb'),'assets/test.glb');
});
test('failed requests can be retried',async()=>{
  const m=await setup(async()=>new Response('',{status:404}));let calls=0;
  const loader={loadAsync:async()=>{if(++calls===1)throw new Error('disconnected');return 7}};
  await assert.rejects(m.loadModel(loader,'assets/test.glb'));assert.equal(await m.loadModel(loader,'assets/test.glb'),7);
});
