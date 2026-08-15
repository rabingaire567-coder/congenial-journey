import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
PORT = 8080

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            path = "/index.html"
        fpath = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
        if not fpath.startswith(ROOT) or not os.path.isfile(fpath):
            self.send_error(404)
            return
        ext = os.path.splitext(fpath)[1]
        ctype = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json"}.get(ext, "application/octet-stream")
        with open(fpath, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/chat":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length) or b"{}")
            key = data.get("key", "")
            model = data.get("model", "meta/llama-3.3-70b-instruct")
            messages = data.get("messages", [])
            if not key:
                self._json(400, {"error": "missing api key"})
                return
            body = json.dumps({"model": model, "messages": messages, "max_tokens": 1024, "temperature": 0.7}).encode()
            req = urllib.request.Request(NVIDIA_URL, data=body, headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
            with urllib.request.urlopen(req, timeout=90) as resp:
                out = json.loads(resp.read())
            self._json(200, out)
        except Exception as e:
            self._json(502, {"error": str(e)})

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == "__main__":
    print("AI Business Suite running at http://127.0.0.1:" + str(PORT))
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
