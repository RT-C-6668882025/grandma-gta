"""Generate deterministic lossless model transfers. Keep originals for fallback."""
import gzip, hashlib, json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
packed = root / 'assets/packed'; packed.mkdir(exist_ok=True)
manifest = {}; original = compressed = 0
for path in sorted((root / 'assets').rglob('*.glb')):
    raw = path.read_bytes(); blob = gzip.compress(raw, compresslevel=9, mtime=0)
    assert gzip.decompress(blob) == raw
    key = path.relative_to(root).as_posix()
    name = hashlib.sha256(raw).hexdigest()[:16] + '.glb.gz'
    (packed / name).write_bytes(blob)
    manifest[key] = {'url': 'assets/packed/' + name, 'size': len(blob)}
    original += len(raw); compressed += len(blob)
(root / 'src/model-manifest.js').write_text('export const MODEL_ASSETS = ' + json.dumps(manifest, separators=(',', ':')) + ';\n')
print(json.dumps({'models':len(manifest),'original_bytes':original,'transfer_bytes':compressed,'saved_percent':round(100*(1-compressed/original),1)}))
