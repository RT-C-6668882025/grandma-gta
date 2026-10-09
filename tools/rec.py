#!/usr/bin/env python3
"""逐帧录游戏镜头（假时钟，画面稳定不掉帧）：python3 tools/rec.py URL shots.json 输出目录 [--fps 30] [--size 1920x1080]
shots.json: [{"name": "ride", "setup": ["js 表达式", ...], "frames": 240, "each": "每帧前执行的 js（可用变量 f）"}, ...]
每个镜头先跑 setup（可 await），再每帧：each → __ama.pump(1, 1/fps) → 截图 → 送进 ffmpeg，得到 <name>.mp4"""
import glob, json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

url, shots, out = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3]
fps = int(sys.argv[sys.argv.index('--fps') + 1]) if '--fps' in sys.argv else 30
W, H = map(int, (sys.argv[sys.argv.index('--size') + 1] if '--size' in sys.argv else '1920x1080').split('x'))
only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
opt = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
READY = opt('--ready', "!!window.__ama && document.getElementById('loadmsg').textContent===''")
STEP = opt('--step', '__ama.pump(1, DT)')  # DT = 1/fps
os.makedirs(out, exist_ok=True)
exe = (glob.glob(os.path.expanduser('~/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell')) or [None])[0]  # None → Playwright's default Chromium
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=['--use-gl=angle', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    pg.on('pageerror', lambda e: print('[pageerror]', str(e)[:300]))
    pg.goto(url)
    t0 = time.time()
    while not pg.evaluate(READY):
        if time.time() - t0 > 150: sys.exit('boot timeout')
        time.sleep(0.3)
    for s in shots:
        if only and s['name'] not in only: continue
        for js in s.get('setup', []):
            if isinstance(js, (int, float)): time.sleep(js); continue
            r = pg.evaluate(f"(async () => {{ {js} }})()")
            if r is not None: print(s['name'], 'setup>', json.dumps(r, ensure_ascii=False)[:300])
        dst = os.path.join(out, s['name'] + '.mp4')
        ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', str(fps), '-i', '-',
                               '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', dst], stdin=subprocess.PIPE)
        each = s.get('each', '')
        for f in range(s['frames']):
            pg.evaluate(f"(async () => {{ const f = {f}; {each}; {STEP.replace('DT', str(1 / fps))}; }})()")
            if s.get('realtime'): time.sleep(1 / fps)  # let voice/audio promises settle in real time when a shot needs it
            ff.stdin.write(pg.screenshot(type='jpeg', quality=93))
        ff.stdin.close(); ff.wait()
        print('shot', dst, s['frames'], 'frames')
    b.close()
