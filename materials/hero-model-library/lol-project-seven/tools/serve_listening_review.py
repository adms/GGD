#!/usr/bin/env python3
"""Serve the project-seven review page and save explicit per-file decisions.

The server binds to loopback, exposes only queue-listed WAV files, and never
edits runtime voice or skill configuration.
"""
from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import sys
from urllib.parse import parse_qs, urlparse


BASE = Path(__file__).resolve().parent.parent
BUILDER_PATH = Path(__file__).with_name("build_listening_review_queue.py")


def load_builder():
    spec = importlib.util.spec_from_file_location("lol_listening_review_builder", BUILDER_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_decisions(document: dict, queue: dict, builder) -> None:
    if document.get("schema") != "ggd-lol-listening-review-decisions@1":
        raise ValueError("Unexpected listening decision schema")
    if document.get("sourceId") != builder.SOURCE_ID or not isinstance(document.get("decisions"), dict):
        raise ValueError("Decisions do not target the fixed project-seven source")
    targets = {row["key"]: row["candidateRuntimeTarget"] for row in queue["records"]}
    unknown = sorted(set(document["decisions"]) - set(targets))
    if unknown:
        raise ValueError("Unknown review keys: " + ", ".join(unknown[:5]))
    for key, decision in document["decisions"].items():
        if not isinstance(decision, dict):
            raise ValueError(f"Decision must be an object: {key}")
        builder.validate_decision(key, decision, targets[key])


def atomic_write(path: Path, document: dict) -> None:
    rendered = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(rendered, encoding="utf-8")
    temporary.replace(path)


def make_handler(builder, asset_workspace: Path):
    queue_path = BASE / "listening-review-queue.json"
    decisions_path = BASE / "listening-review-decisions.json"
    html_path = BASE / "listening-review.html"

    class Handler(BaseHTTPRequestHandler):
        server_version = "GGDListeningReview/1"

        def send_bytes(self, body: bytes, content_type: str, status=HTTPStatus.OK) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def send_json(self, data: dict, status=HTTPStatus.OK) -> None:
            self.send_bytes(
                (json.dumps(data, ensure_ascii=False) + "\n").encode(),
                "application/json; charset=utf-8", status,
            )

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path in {"/", "/listening-review.html"}:
                return self.send_bytes(html_path.read_bytes(), "text/html; charset=utf-8")
            if parsed.path == "/gap-listening-review.html":
                return self.send_bytes((BASE / "gap-listening-review.html").read_bytes(), "text/html; charset=utf-8")
            if parsed.path == "/listening-review-queue.json":
                return self.send_bytes(queue_path.read_bytes(), "application/json; charset=utf-8")
            if parsed.path == "/api/decisions":
                return self.send_bytes(decisions_path.read_bytes(), "application/json; charset=utf-8")
            if parsed.path == "/audio":
                key = parse_qs(parsed.query).get("key", [None])[0]
                queue = load_json(queue_path)
                matches = [row for row in queue["records"] if row["key"] == key]
                if len(matches) != 1:
                    return self.send_json({"error": "Unknown audio key"}, HTTPStatus.NOT_FOUND)
                path = Path(matches[0]["absolutePath"])
                expected = (asset_workspace / matches[0]["path"]).resolve()
                if path.resolve() != expected or not path.is_file():
                    return self.send_json({"error": "Audio path failed queue validation"}, HTTPStatus.CONFLICT)
                return self.send_bytes(path.read_bytes(), "audio/wav")
            return self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:  # noqa: N802
            if urlparse(self.path).path != "/api/decisions":
                return self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 4 * 1024 * 1024:
                    raise ValueError("Decision payload has an invalid size")
                document = json.loads(self.rfile.read(length))
                queue = load_json(queue_path)
                validate_decisions(document, queue, builder)
                atomic_write(decisions_path, document)
                rebuilt = builder.build(
                    BASE.parents[2], asset_workspace.resolve(), decisions_path.resolve()
                )
                builder.write_or_check(queue_path, builder.render_json(rebuilt), False)
                builder.write_or_check(BASE / "listening-review-queue.md", builder.markdown(rebuilt), False)
                receipt = builder.receipt(
                    BASE.parents[2], rebuilt, queue_path, BASE / "listening-review-queue.md",
                    html_path, decisions_path, BUILDER_PATH,
                )
                builder.write_or_check(BASE / "listening-review-receipt.json", builder.render_json(receipt), False)
                self.send_json(document)
            except (ValueError, KeyError, json.JSONDecodeError) as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)

        def log_message(self, fmt: str, *args) -> None:
            print(f"[lol-review] {self.address_string()} {fmt % args}")

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset-workspace", type=Path, required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Review server is intentionally loopback-only")
    builder = load_builder()
    handler = make_handler(builder, args.asset_workspace.resolve())
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"LOL review page: http://{args.host}:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
