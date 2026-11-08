"""Lokaler Entwicklungsserver ohne Browser-Cache.
Aufruf: python3 tools/serve.py [port]"""
import functools, http.server, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
handler = functools.partial(NoCache, directory=str(ROOT))
http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
