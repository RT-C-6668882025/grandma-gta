#!/usr/bin/env python3
"""本机接收器：Chrome 拦了 Tripo 站点的连续下载时，让页面把导出的 GLB 直接 POST 过来
用法：python3 tools/recv.py [端口=8999]，文件落在 assets/raw/tripo-in/"""
import os, sys, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'raw', 'tripo-in')
os.makedirs(OUT, exist_ok=True)

class H(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', 'https://studio.tripo3d.ai')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def do_POST(self):
        name = parse_qs(urlparse(self.path).query).get('name', ['upload.bin'])[0]
        name = re.sub(r'[^\w.\-]', '_', os.path.basename(name))
        n = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(n)
        with open(os.path.join(OUT, name), 'wb') as f: f.write(data)
        self.send_response(200); self.cors(); self.end_headers()
        self.wfile.write(f'{name} {len(data)}'.encode())
        print('saved', name, len(data), flush=True)

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8999), H).serve_forever()
