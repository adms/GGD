#!/usr/bin/env python3
"""Serve verified Palworld review audio from the local asset library."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[4]
QUEUE = ROOT / "materials/hero-model-library/palworld/review/palworld-av-review.json"


RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def audio_map() -> dict[str, Path]:
    queue = json.loads(QUEUE.read_text(encoding="utf-8"))
    assert queue["schema"] == "ggd.palworld-av-review@1"
    assert queue["summary"]["audioCandidateCount"] == 18
    assert queue["summary"]["approvedCandidateCount"] == 0
    assert queue["summary"]["runtimeSelectableCandidateCount"] == 0
    files = {}
    for row in queue["audioCandidates"]:
        source = Path(row["file"]["path"])
        assert source.is_absolute(), row["candidateId"]
        assert source.is_file(), source
        assert source.stat().st_size == row["file"]["bytes"], source
        assert sha256(source) == row["file"]["sha256"], source
        assert row["candidateId"] not in files
        assert source not in files.values()
        files[row["candidateId"]] = source
    assert len(files) == 18
    return files


def byte_range(header: str | None, size: int) -> tuple[int, int] | None:
    """Return an inclusive single byte range; None means malformed/unsatisfiable."""
    if header is None:
        return 0, size - 1
    match = RANGE.fullmatch(header.strip())
    if match is None or not any(match.groups()) or size <= 0:
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


def handler_class(files: dict[str, Path]):
    class Handler(BaseHTTPRequestHandler):
        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.end_headers()

        def do_HEAD(self):
            self._serve(False)

        def do_GET(self):
            self._serve(True)

        def _serve(self, include_body: bool):
            path = urlsplit(self.path).path
            prefix = "/audio/"
            if not path.startswith(prefix):
                self.send_error(404)
                return
            candidate_id = unquote(path[len(prefix) :])
            source = files.get(candidate_id)
            if source is None or not source.is_file():
                self.send_error(404)
                return
            size = source.stat().st_size
            requested_range = self.headers.get("Range")
            selected = byte_range(requested_range, size)
            if selected is None:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
                self.end_headers()
                return
            start, end = selected
            length = end - start + 1
            content_type = "audio/wav" if source.suffix.lower() == ".wav" else "audio/mpeg"
            self.send_response(206 if requested_range is not None else 200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            if requested_range is not None:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
            self.end_headers()
            if include_body:
                with source.open("rb") as stream:
                    stream.seek(start)
                    self.wfile.write(stream.read(length))

        def log_message(self, message, *args):
            print(f"{self.client_address[0]} {message % args}")

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    files = audio_map()
    assert len(files) == 18
    print(f"Serving {len(files)} verified files at http://{args.host}:{args.port}/audio/<candidateId>")
    ThreadingHTTPServer((args.host, args.port), handler_class(files)).serve_forever()


if __name__ == "__main__":
    main()
