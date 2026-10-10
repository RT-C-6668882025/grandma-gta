// True fullscreen only; report platform restrictions rather than simulating it.
export async function toggleFullscreen(doc = document) {
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
    if (!exit) throw new Error('此瀏覽器無法退出全螢幕');
    await exit.call(doc); return false;
  }
  if (doc.fullscreenEnabled === false) throw new Error('此頁面的全螢幕權限被瀏覽器或內嵌頁面限制');
  const element = doc.documentElement;
  const enter = element.requestFullscreen || element.webkitRequestFullscreen;
  if (!enter) throw new Error('此瀏覽器沒有提供全螢幕功能');
  await enter.call(element, { navigationUI: 'hide' });
  try { await globalThis.screen?.orientation?.lock('landscape'); } catch {}
  return true;
}
