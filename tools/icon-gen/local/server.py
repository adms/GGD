#!/usr/bin/env python3
"""Local OpenAI-images-compatible server — the WIRING POINT.

The platform's AI proxy (apps/platform/internal/ai/provider.go) is already
provider-agnostic: for images it POSTs an OpenAI-shaped request

    POST {imageBaseUrl}/images/generations
    { "model": ..., "prompt": ..., "n": 1, "size": "1024x1024" }

and reads back { "data": [ { "b64_json": ... } ] }. So the ENTIRE existing path
— tools/icon-gen -> platform /ai/icon -> provider — works against a LOCAL model
with NO Go change at all: run this server and point the image provider at it in
the admin console (setup notes retired 2026-07-28; see batch.py / daemon.py):

    imageBaseUrl = http://127.0.0.1:8188/v1
    imageModel   = local-sd            (any non-empty string)
    apiKey       = local               (any non-empty string; ignored here)
    enabled      = true

This server speaks exactly that dialect: it accepts the request, splits the
'Negative:' clause into a real SD negative prompt, renders on-device, resizes to
the requested edge, and answers with base64 PNG. It holds no key and reaches no
network at generation time.

    .venv/bin/python local/server.py --port 8188 [--native 512 --steps 24]
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pipeline  # noqa: E402

STEPS = 24
GUIDANCE = 7.0


def parse_size(s: str | int | None) -> int:
    """OpenAI sends 'WxH' (or 'auto'). We render square icons, so take the width."""
    if isinstance(s, int):
        return s
    if not s or s == "auto":
        return 512
    try:
        return int(str(s).lower().split("x")[0])
    except ValueError:
        return 512


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # keep stdout clean; we print our own line
        pass

    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # A trivial health/models probe so an operator can curl-check it's alive.
        if self.path.rstrip("/") in ("/v1/models", "/healthz", "/v1/health"):
            self._json(200, {"object": "list", "data": [{"id": "local-sd", "object": "model"}]})
        else:
            self._json(404, {"error": {"message": "not found"}})

    def do_POST(self):
        if not self.path.rstrip("/").endswith("/images/generations"):
            self._json(404, {"error": {"message": "unknown route"}})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(length) or b"{}")
        except Exception as exc:
            self._json(400, {"error": {"message": f"bad json: {exc}"}})
            return

        full = (req.get("prompt") or "").strip()
        if not full:
            self._json(400, {"error": {"message": "prompt is required"}})
            return
        size = parse_size(req.get("size"))
        n = int(req.get("n") or 1)
        pos, neg = pipeline.split_prompt(full)

        try:
            t0 = time.time()
            data = []
            for i in range(max(1, n)):
                img = pipeline.generate(
                    pos, neg, size=size, steps=self.server.steps,
                    guidance=GUIDANCE, seed=req.get("seed"),
                )
                buf = io.BytesIO()
                img.save(buf, "PNG", optimize=True)
                data.append({"b64_json": base64.b64encode(buf.getvalue()).decode("ascii")})
            dt = time.time() - t0
            print(f"[server] {n} image(s) {size}px in {dt:.1f}s  ::  {pos[:70]}...", flush=True)
            self._json(200, {"created": int(time.time()), "data": data})
        except Exception as exc:
            print(f"[server] ERROR {exc}", flush=True)
            self._json(500, {"error": {"message": f"generation failed: {exc}"}})


def main() -> None:
    ap = argparse.ArgumentParser(description="local OpenAI-images-compatible SD server")
    ap.add_argument("--port", type=int, default=8188)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--native", type=int, default=pipeline.NATIVE, help="SD render edge (512 for SD1.5)")
    ap.add_argument("--steps", type=int, default=STEPS)
    ap.add_argument("--warm", action="store_true", help="load the model at startup, not on first request")
    args = ap.parse_args()

    pipeline.NATIVE = args.native
    print(f"[server] model {os.environ.get('ICON_GEN_MODEL', pipeline.DEFAULT_MODEL)}  "
          f"native {args.native}px  steps {args.steps}", flush=True)
    if args.warm:
        print("[server] warming (loading model)...", flush=True)
        pipeline.load_pipeline()
        print("[server] warm.", flush=True)

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.steps = args.steps
    print(f"[server] listening on http://{args.host}:{args.port}/v1/images/generations", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[server] bye", flush=True)


if __name__ == "__main__":
    main()
