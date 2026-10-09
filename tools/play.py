#!/usr/bin/env python3
"""无头验证：python3 tools/play.py URL steps.json [out_dir]
steps: [["wait", 秒], ["js", "表达式"], ["shot", "name.png"], ["waitjs", "条件", 超时秒]]"""
import glob, json, os, sys, time
from playwright.sync_api import sync_playwright

url, steps = sys.argv[1], json.load(open(sys.argv[2]))
out = sys.argv[3] if len(sys.argv) > 3 else '.'
exe = (glob.glob(os.path.expanduser('~/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell')) or [None])[0]  # None → Playwright's default Chromium
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=['--use-gl=angle', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('console', lambda m: m.type in ('error', 'warning') and print('[console]', m.type, m.text[:300]))
    pg.on('pageerror', lambda e: print('[pageerror]', str(e)[:300]))
    pg.goto(url)
    for s in steps:
        k = s[0]
        if k == 'wait': time.sleep(s[1])
        elif k == 'js': print('js>', json.dumps(pg.evaluate(s[1]), ensure_ascii=False)[:2000])
        elif k == 'waitjs':
            t0 = time.time()
            while not pg.evaluate(s[1]):
                if time.time() - t0 > (s[2] if len(s) > 2 else 60): print('timeout', s[1]); break
                time.sleep(0.3)
        elif k == 'shot': pg.screenshot(path=os.path.join(out, s[1])); print('shot', s[1])
    b.close()
