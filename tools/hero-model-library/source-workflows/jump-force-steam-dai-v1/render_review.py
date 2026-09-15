#!/usr/bin/env python3
"""Render a review GLB with the repository's Babylon WebGL proof bundle."""

from __future__ import annotations

import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import subprocess
import tempfile
import threading


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--prebuilt-bundle", type=Path, required=True,
                        help="A locally preserved bundle built from render_static_glb.mjs.")
    args = parser.parse_args()
    source = args.source.resolve()
    bundle = args.prebuilt_bundle.resolve()
    output = args.output.resolve()
    if output.exists():
        raise ValueError(f"output must be new: {output}")
    if not source.is_file() or not bundle.is_file():
        raise ValueError("source GLB and prebuilt renderer bundle must exist")
    output.mkdir(parents=True)
    (output / "bundle.js").write_bytes(bundle.read_bytes())
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args) -> None:
            pass

        def do_GET(self) -> None:
            if self.path == "/":
                data = b'<canvas width="800" height="800"></canvas><script type="module" src="/bundle.js"></script>'
                mime = "text/html"
            elif self.path == "/body.glb":
                data = source.read_bytes()
                mime = "model/gltf-binary"
            elif self.path == "/bundle.js":
                data = (output / "bundle.js").read_bytes()
                mime = "text/javascript"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self) -> None:
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
            obj = json.loads(self.rfile.read(length))
            data = base64.b64decode(obj["png"], validate=True) if name.endswith(".png") else (json.dumps(obj, indent=2) + "\n").encode()
            with (output / name).open("xb") as stream:
                stream.write(data)
            self.send_response(200)
            self.end_headers()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    profile = Path(tempfile.mkdtemp(prefix="ggd-jump-force-dai-chrome-"))
    command = [
        "/usr/bin/arch", "-arm64", chrome, "--headless=new", "--no-first-run",
        "--disable-extensions", "--disable-background-networking", "--disable-component-update",
        "--disable-sync", "--no-default-browser-check", "--use-gl=angle", "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader", "--user-data-dir=" + str(profile),
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
    receipt = {
        "source": str(source),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "rendererBundle": str(bundle),
        "rendererBundleSha256": hashlib.sha256(bundle.read_bytes()).hexdigest(),
        "complete": complete,
        "proofExists": (output / "proof.json").is_file(),
        "errorExists": (output / "error.json").is_file(),
        "images": len(list(output.glob("*.png"))),
    }
    (output / "run.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
    return 0 if complete and receipt["proofExists"] and not receipt["errorExists"] else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}")
        raise SystemExit(1)
