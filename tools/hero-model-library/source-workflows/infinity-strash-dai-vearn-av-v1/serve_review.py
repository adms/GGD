#!/usr/bin/env python3
"""Serve only SHA-pinned Dai/old-Vearn WAV candidates with HTTP Range."""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[4]
QUEUE = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vearn-av-v1/audio-review-queue.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def allowlist() -> dict[str, dict]:
    document = json.loads(QUEUE.read_text(encoding="utf-8"))
    if document.get("schema") != "ggd.infinity-strash-dai-vearn-audio-review@1":
        raise ValueError("unexpected review queue")
    result = {}
    for part in document["parts"]:
        path = ROOT / part["gitPath"]
        payload = path.read_bytes()
        if len(payload) != part["bytes"] or hashlib.sha256(payload).hexdigest() != part["sha256"]:
            raise ValueError(f"review queue part changed: {path}")
        for row in json.loads(payload)["candidates"]:
            file = row["decodedWav"]
            media = Path(file["absolutePath"])
            if not media.is_file() or media.stat().st_size != file["bytes"] or sha256(media) != file["sha256"]:
                raise ValueError(f"review candidate changed: {media}")
            result[row["candidateId"]] = file
    return result


class Handler(BaseHTTPRequestHandler):
    files: dict[str, dict] = {}

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        prefix = "/media/"
        if not parsed.path.startswith(prefix):
            self.send_error(404)
            return
        candidate_id = unquote(parsed.path[len(prefix):])
        row = self.files.get(candidate_id)
        if row is None:
            self.send_error(404)
            return
        path = Path(row["absolutePath"])
        total = path.stat().st_size
        start, end, status = 0, total - 1, 200
        header = self.headers.get("Range")
        if header:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", header)
            if not match:
                self.send_error(416)
                return
            left, right = match.groups()
            if left:
                start = int(left)
                end = min(int(right), total - 1) if right else total - 1
            elif right:
                start = max(0, total - int(right))
            if start > end or start >= total:
                self.send_error(416)
                return
            status = 206
        self.send_response(status)
        self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{total}")
        self.end_headers()
        with path.open("rb") as stream:
            stream.seek(start)
            remaining = end - start + 1
            while remaining:
                block = stream.read(min(1 << 16, remaining))
                if not block:
                    break
                self.wfile.write(block)
                remaining -= len(block)

    def log_message(self, format: str, *args: object) -> None:
        print(format % args)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8768)
    args = parser.parse_args()
    Handler.files = allowlist()
    print(f"serving {len(Handler.files)} SHA-pinned files at http://{args.host}:{args.port}/media/<candidateId>")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
