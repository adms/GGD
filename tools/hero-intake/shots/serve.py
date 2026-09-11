#!/usr/bin/env python3
"""一次性的**實拍台**伺服器 —— 靜態檔 ＋ 一個 `POST /save?name=` 把 PNG 寫回磁碟。

⭐ 為什麼要 POST：26 張圖的 data URL 加起來 ~5 MB，⛔ 從瀏覽器「讀出來」會把
context 燒光。讓瀏覽器**自己寫檔**，我只讀一行「好了幾張」。
"""
import http.server, os, pathlib, socketserver, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent      # scratchpad/
SHOTS = ROOT / "review34" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(ROOT), **kw)
    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/save":
            self.send_error(404); return
        name = urllib.parse.parse_qs(u.query).get("name", [""])[0]
        if not name or "/" in name or ".." in name:
            self.send_error(400, "bad name"); return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        (SHOTS / name).write_bytes(body)
        self.send_response(200); self.send_header("Content-Length", "2")
        self.end_headers(); self.wfile.write(b"ok")
    def guess_type(self, path):
        # ⚠️ 本機預覽用：⛔ 不送 charset 的話瀏覽器會把 UTF-8 猜成 latin-1（滿畫面亂碼）
        t = super().guess_type(path)
        return t + "; charset=utf-8" if str(t).startswith("text/") and "charset" not in str(t) else t
    def log_message(self, fmt, *args):
        if "save" in (args[0] if args else ""): super().log_message(fmt, *args)

socketserver.TCPServer.allow_reuse_address = True
PORT = int(os.environ.get("PORT", "8791"))          # ⭐ 讓 preview 指派埠，⛔ 不要寫死
with socketserver.TCPServer(("127.0.0.1", PORT), H) as s:
    print(f"[shot34] serving {ROOT} on http://127.0.0.1:{PORT}  → shots: {SHOTS}", flush=True)
    s.serve_forever()
