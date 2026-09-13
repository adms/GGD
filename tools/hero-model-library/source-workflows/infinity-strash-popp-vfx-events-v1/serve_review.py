#!/usr/bin/env python3
"""Serve the generated Popp listening review without exposing arbitrary files."""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


def load_allowlist(queue_path: Path) -> dict[str, Path]:
    document = json.loads(queue_path.read_text())
    result = {}
    for row in document["candidates"]:
        path = Path(row["audio"]["absolutePath"])
        if not path.is_file():
            raise ValueError(f"missing allowlisted audio: {path}")
        result[row["candidateId"]] = path
    return result


def handler(review_html: Path, allowlist: dict[str, Path]):
    class ReviewHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            request = urlparse(self.path)
            if request.path in {"/", "/event-audio-review.html"}:
                payload = review_html.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
            elif request.path.startswith("/audio/"):
                candidate_id = unquote(request.path.removeprefix("/audio/"))
                path = allowlist.get(candidate_id)
                if path is None:
                    self.send_error(404)
                    return
                payload = path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Accept-Ranges", "bytes")
            else:
                self.send_error(404)
                return
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, format, *args):
            print(format % args)

    return ReviewHandler


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-dir", type=Path, required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8788)
    args = parser.parse_args()
    review_dir = args.review_dir.resolve()
    allowlist = load_allowlist(review_dir / "event-audio-review-queue.json")
    server = ThreadingHTTPServer((args.host, args.port), handler(review_dir / "event-audio-review.html", allowlist))
    print(f"Popp review: http://{args.host}:{args.port}/")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
