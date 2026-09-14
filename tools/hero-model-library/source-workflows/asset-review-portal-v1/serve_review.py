#!/usr/bin/env python3
"""Serve only SHA-pinned media from the generated asset review queue."""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[4]
QUEUE = ROOT / "materials/hero-model-library/review/asset-review-portal-v1/review-queue.json"
RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def media_map(queue_path: Path = QUEUE) -> dict[str, tuple[Path, str]]:
    queue = json.loads(queue_path.read_text(encoding="utf-8"))
    if queue.get("schema") != "ggd.asset-review-portal@1":
        raise ValueError("unexpected asset review queue schema")
    if queue["policy"].get("runtimeMutationAllowed") is not False:
        raise ValueError("review queue cannot have runtime authority")
    result = {}
    for row in queue["audioCandidates"]:
        candidate_id = row["candidateId"]
        path = Path(row["file"]["absolutePath"])
        if not path.is_absolute() or not path.is_file():
            raise ValueError(f"missing allowlisted media: {path}")
        if path.stat().st_size != row["file"]["bytes"] or sha256(path) != row["file"]["sha256"]:
            raise ValueError(f"changed allowlisted media: {path}")
        if candidate_id in result:
            raise ValueError(f"duplicate candidate id: {candidate_id}")
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        result[candidate_id] = (path, content_type)
    for row in queue.get("visualCandidates", []):
        for preview in row["previewFiles"]:
            media_id = preview["mediaId"]
            path = Path(preview["absolutePath"])
            if not path.is_absolute() or not path.is_file():
                raise ValueError(f"missing allowlisted visual media: {path}")
            if path.stat().st_size != preview["bytes"] or sha256(path) != preview["sha256"]:
                raise ValueError(f"changed allowlisted visual media: {path}")
            if media_id in result:
                raise ValueError(f"duplicate media id: {media_id}")
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if not content_type.startswith("image/"):
                raise ValueError(f"visual preview is not an image: {path}")
            result[media_id] = (path, content_type)
    expected_count = queue["summary"]["audioCandidateCount"] + queue["summary"].get("visualPreviewFileCount", 0)
    if len(result) != expected_count:
        raise ValueError("allowlist size does not match queue summary")
    return result


def byte_range(header: str | None, size: int) -> tuple[int, int] | None:
    if size <= 0:
        return None
    if header is None:
        return 0, size - 1
    match = RANGE.fullmatch(header.strip())
    if match is None or not any(match.groups()):
        return None
    first, last = match.groups()
    if first:
        start = int(first)
        end = int(last) if last else size - 1
        if start >= size or end < start:
            return None
        return start, min(end, size - 1)
    suffix = int(last)
    if suffix <= 0:
        return None
    return max(0, size - suffix), size - 1


def handler_class(files: dict[str, tuple[Path, str]], vite_origin: str = "http://127.0.0.1:5173"):
    class Handler(BaseHTTPRequestHandler):
        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Range")
            self.end_headers()

        def do_HEAD(self):
            self._serve(False)

        def do_GET(self):
            self._serve(True)

        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", vite_origin)
            self.send_header("Vary", "Origin")

        def _serve(self, include_body: bool):
            path = urlsplit(self.path).path
            if path == "/healthz":
                payload = json.dumps({"ok": True, "allowlistedMedia": len(files)}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self._cors()
                self.end_headers()
                if include_body:
                    self.wfile.write(payload)
                return
            if path == "/":
                self.send_response(302)
                self.send_header("Location", vite_origin + "/asset-review-portal.html")
                self._cors()
                self.end_headers()
                return
            prefix = "/media/"
            if not path.startswith(prefix):
                self.send_error(404)
                return
            candidate_id = unquote(path[len(prefix):])
            item = files.get(candidate_id)
            if item is None:
                self.send_error(404)
                return
            source, content_type = item
            size = source.stat().st_size
            requested = self.headers.get("Range")
            selected = byte_range(requested, size)
            if selected is None:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self._cors()
                self.end_headers()
                return
            start, end = selected
            length = end - start + 1
            self.send_response(206 if requested is not None else 200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-store")
            if requested is not None:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self._cors()
            self.end_headers()
            if include_body:
                with source.open("rb") as stream:
                    stream.seek(start)
                    remaining = length
                    while remaining:
                        block = stream.read(min(remaining, 1 << 20))
                        if not block:
                            break
                        self.wfile.write(block)
                        remaining -= len(block)

        def log_message(self, message, *args):
            print(f"{self.client_address[0]} {message % args}")

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--vite-origin", default="http://127.0.0.1:5173")
    args = parser.parse_args()
    files = media_map()
    print(f"Verified {len(files)} media files; review page: {args.vite_origin}/asset-review-portal.html")
    print(f"Media server: http://{args.host}:{args.port}/media/<candidateId>")
    ThreadingHTTPServer((args.host, args.port), handler_class(files, args.vite_origin)).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
