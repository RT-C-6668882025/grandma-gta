import json, base64, os, sys, urllib.request, time, subprocess
from concurrent.futures import ThreadPoolExecutor
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.config/ai-teardown/mimo.env')) if '=' in l)
KEY = env['MIMO_API_KEY'].strip('"\''); BASE = env.get('MIMO_BASE_URL', 'https://api.xiaomimimo.com/v1').strip('"\'')
D = json.load(open('lines.json')); os.makedirs('l', exist_ok=True)
only = set(sys.argv[1:])
def say(item):
    lid, (who, text, style) = item
    out = f'l/{lid}.mp3'
    if (only and lid not in only) or (not only and os.path.exists(out)): return
    body = {'model': 'mimo-v2.5-tts-voicedesign', 'messages': [
        {'role': 'user', 'content': D['voices'][who] + '；' + style},
        {'role': 'assistant', 'content': text}], 'audio': {'format': 'wav'}}
    for i in range(6):
        try:
            req = urllib.request.Request(BASE + '/chat/completions', data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
            r = json.load(urllib.request.urlopen(req, timeout=120))
            open(f'l/{lid}.wav', 'wb').write(base64.b64decode(r['choices'][0]['message']['audio']['data']))
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'l/{lid}.wav', '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '44100', '-ac', '1', '-b:a', '64k', out], check=True)
            os.remove(f'l/{lid}.wav'); print('ok', lid, flush=True); return
        except Exception as e:
            print('retry', lid, e, flush=True); time.sleep(2 + i * 2)
    print('FAIL', lid, flush=True)
with ThreadPoolExecutor(4) as ex: list(ex.map(say, D['lines'].items()))
print('ALL DONE')
