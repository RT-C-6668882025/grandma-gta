export const CAMERA_MODES = ['third', 'first', 'god'];
export const CAMERA_LABELS = { third: '第三人稱', first: '第一人稱', god: '上帝視角' };
export function savedCameraMode() {
  try { const value = localStorage.getItem('ama-camera-mode-v1'); return CAMERA_MODES.includes(value) ? value : 'third'; } catch { return 'third'; }
}
export function cameraPreset(mode) {
  if (mode === 'first') return { distance: 0, pitch: 0, minPitch: -1.55, maxPitch: 1.55 };
  if (mode === 'god') return { distance: 28, pitch: 1.16, minPitch: .25, maxPitch: 1.55 };
  return { distance: 3.5, pitch: .12, minPitch: -1.45, maxPitch: 1.45 };
}
