#!/usr/bin/env python3
"""Local dev server: like `python3 -m http.server`, but tells the browser never
to cache, so edited ES modules and assets are always picked up on reload.

usage: python3 tools/serve.py [port]   (serves the project root, default 8965)"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8965


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.glb': 'model/gltf-binary',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    handler = functools.partial(NoCache, directory=ROOT)
    with http.server.ThreadingHTTPServer(('', PORT), handler) as httpd:
        print(f'serving {ROOT} on http://localhost:{PORT} (no-cache)')
        httpd.serve_forever()
