#!/usr/bin/env python3
"""Render one local GLB with Babylon WebGL in isolated headless Chrome."""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--model", type=Path, help="Optional uploaded-model.json whose six-state clipMap drives the review")
args = parser.parse_args()
source, output = args.source.resolve(), args.output.resolve()
if not source.is_file():
    raise SystemExit("missing GLB: " + str(source))
output.mkdir(parents=True, exist_ok=False)
model_path = args.model.resolve() if args.model else None
if model_path is not None and not model_path.is_file():
    raise SystemExit("missing uploaded model document: " + str(model_path))
repo = Path(__file__).resolve().parents[4]
done = threading.Event()
environment = dict(os.environ, NODE_PATH=str(repo / "node_modules/.pnpm/node_modules"))
esbuild = repo / "node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild"
subprocess.run([str(esbuild), str(Path(__file__).with_suffix(".mjs")), "--bundle", "--format=esm", "--outfile=" + str(output / "bundle.js")], check=True, env=environment)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == "/":
            data, mime = b'<canvas width="800" height="800"></canvas><script type="module" src="/bundle.js"></script>', "text/html"
        elif self.path == "/body.glb":
            data, mime = source.read_bytes(), "model/gltf-binary"
        elif self.path == "/bundle.js":
            data, mime = (output / "bundle.js").read_bytes(), "text/javascript"
        elif self.path == "/model.json" and model_path is not None:
            data, mime = model_path.read_bytes(), "application/json"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path == "/done":
            self.send_response(200)
            self.end_headers()
            done.set()
            return
        name = self.path.removeprefix("/save/")
        length = int(self.headers.get("Content-Length", "0"))
        if not self.path.startswith("/save/") or not re.fullmatch(r"[a-z0-9-]+\.(png|json)", name) or length > 16_000_000:
            self.send_error(400)
            return
        value = json.loads(self.rfile.read(length))
        data = base64.b64decode(value["png"], validate=True) if name.endswith(".png") else (json.dumps(value, indent=2) + "\n").encode()
        with (output / name).open("xb") as stream:
            stream.write(data)
        self.send_response(200)
        self.end_headers()


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
profile = Path(tempfile.mkdtemp(prefix="ggd-strash-chrome-"))
command = [
    chrome, "--headless=new", "--no-first-run", "--disable-extensions", "--disable-background-networking",
    "--disable-component-update", "--disable-sync", "--no-default-browser-check", "--use-gl=angle",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--user-data-dir=" + str(profile),
    f"http://127.0.0.1:{server.server_address[1]}/",
]
with (output / "chrome.log").open("w") as log:
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        complete = done.wait(55)
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        server.shutdown()
        server.server_close()
        shutil.rmtree(profile)
receipt = {
    "source": str(source),
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "complete": complete,
    "proofExists": (output / "proof.json").is_file(),
    "errorExists": (output / "error.json").is_file(),
    "images": len(list(output.glob("*.png"))),
    "model": None if model_path is None else {"path": str(model_path), "sha256": hashlib.sha256(model_path.read_bytes()).hexdigest()},
}
(output / "run.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt))
if not complete or not receipt["proofExists"] or receipt["errorExists"] or receipt["images"] != 18:
    raise SystemExit(1)
