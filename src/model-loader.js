// Lossless gzip transfer + versioned, on-demand model cache.
import { MODEL_ASSETS } from './model-manifest.js';
const pending = new Map();
let bytes = 0, completed = 0, requested = 0;
function report() { dispatchEvent(new CustomEvent('model-progress', { detail: { bytes, completed, requested } })); }
async function getBytes(url, expectedSize) {
  let cache = null;
  try { cache = await caches.open('ama-models-v1'); } catch {}
  let response = await cache?.match(url).catch(() => null);
  const cached = !!response;
  if (!response) response = await fetch(url);
  if (!response.ok) throw new Error(`模型下載失敗 (${response.status})`);
  const copy = response.clone();
  const data = new Uint8Array(await response.arrayBuffer());
  bytes += data.byteLength; report();
  // A truncated transfer must never be persisted.
  return { data, persist: () => { if (!cached && cache && data.byteLength === expectedSize) cache.put(url, copy).catch(() => {}); } };
}
export function loadModel(loader, path) {
  if (pending.has(path)) return pending.get(path);
  requested++; report();
  const promise = (async () => {
    const packed = MODEL_ASSETS[path];
    let result;
    if (packed && typeof DecompressionStream !== 'undefined') {
      try {
        const { data, persist } = await getBytes(packed.url, packed.size);
        const decoded = data[0] === 0x1f && data[1] === 0x8b
          ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
          : data.buffer;
        result = await loader.parseAsync(decoded, new URL(path.slice(0, path.lastIndexOf('/') + 1), location.href).href);
        persist();
      } catch (error) {
        console.warn('Compressed model unavailable; using original', path, error);
        result = await loader.loadAsync(path);
      }
    } else result = await loader.loadAsync(path);
    completed++; report(); return result;
  })();
  pending.set(path, promise);
  promise.catch(() => pending.delete(path));
  return promise;
}
