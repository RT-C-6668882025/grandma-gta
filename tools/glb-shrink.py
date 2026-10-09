#!/usr/bin/env python3
"""把 GLB 里的贴图缩到指定边长并重新打包（Tripo 默认 2048² × 3 张，对 1 米以内的小角色太大）
用法：python3 tools/glb-shrink.py in.glb out.glb [1024]"""
import io, json, struct, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
b = open(src, 'rb').read()
clen = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + clen])
bin_off = 20 + clen + 8
bin_len = struct.unpack('<I', b[20 + clen:24 + clen])[0]
binary = b[bin_off:bin_off + bin_len]
views = j['bufferViews']
img_views = {img['bufferView']: i for i, img in enumerate(j.get('images', []))}
out, new_views = bytearray(), []
for vi, bv in enumerate(views):
    off = bv.get('byteOffset', 0)
    data = binary[off:off + bv['byteLength']]
    if vi in img_views:
        img = j['images'][img_views[vi]]
        im = Image.open(io.BytesIO(data))
        if max(im.size) > size:
            im = im.resize((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        # 不透明贴图一律存 JPEG；带透明通道的保留 PNG
        if im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 255:
            im.save(buf, 'PNG', optimize=True); img['mimeType'] = 'image/png'
        else:
            im.convert('RGB').save(buf, 'JPEG', quality=88, optimize=True); img['mimeType'] = 'image/jpeg'
        data = buf.getvalue()
    while len(out) % 4: out.append(0)
    nbv = dict(bv); nbv['byteOffset'] = len(out); nbv['byteLength'] = len(data)
    new_views.append(nbv); out += data
while len(out) % 4: out.append(0)
j['bufferViews'] = new_views
j['buffers'][0]['byteLength'] = len(out)
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + out
open(dst, 'wb').write(glb)
print(f'{src}: {len(b)/1e6:.2f}MB → {dst}: {len(glb)/1e6:.2f}MB')
