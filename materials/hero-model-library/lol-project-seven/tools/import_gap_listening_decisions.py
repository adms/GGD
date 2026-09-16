#!/usr/bin/env python3
"""Validate and freeze owner decisions for ambiguous LoL skill-callout WAVs."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


BASE = Path(__file__).resolve().parent.parent
OUTPUT = BASE / "gap-listening-decisions.json"
SCHEMA = "ggd-lol-gap-listening-review@1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def validate(payload: dict, base: Path = BASE) -> dict:
    if payload.get("schema") != SCHEMA:
        raise ValueError("unexpected gap-listening decision schema")
    audit = json.loads((base / "runtime-audit.json").read_text())
    queue = json.loads((base / "listening-review-queue.json").read_text())
    queue_by_key = {row["key"]: row for row in queue["records"]}
    groups = audit["pendingAmbiguousSkillCandidates"] or audit.get("reviewedAmbiguousSkillCandidates", [])
    expected = {
        key: group["target"]
        for group in groups
        for key in group["reviewKeys"]
    }
    decisions = payload.get("decisions")
    if not isinstance(decisions, list) or len(decisions) != len(expected):
        raise ValueError("decision file does not cover the exact pending ambiguous set")
    if {row.get("key") for row in decisions} != set(expected):
        raise ValueError("decision key set differs from the pending ambiguous set")

    normalized = []
    for exported in decisions:
        key = exported["key"]
        source = queue_by_key[key]
        path = Path(exported["absolutePath"]).resolve()
        if str(path) != str(Path(source["absolutePath"]).resolve()):
            raise ValueError(f"absolute path changed: {key}")
        if exported.get("sha256") != source["sha256"] or sha256(path) != source["sha256"]:
            raise ValueError(f"source SHA-256 changed: {key}")
        if path.stat().st_size != source["bytes"]:
            raise ValueError(f"source byte count changed: {key}")
        if exported.get("nativeId") != source["nativeId"]:
            raise ValueError(f"native character changed: {key}")
        if exported.get("proposedTarget") != expected[key]:
            raise ValueError(f"proposed target changed: {key}")
        if exported.get("eventBindings") != source["eventBindings"]:
            raise ValueError(f"native event evidence changed: {key}")
        if exported.get("decision") not in {"approve", "reject"}:
            raise ValueError(f"decision remains pending: {key}")
        normalized.append({
            "key": key,
            "nativeId": source["nativeId"],
            "proposedTarget": expected[key],
            "sourcePath": source["path"],
            "absolutePath": str(path),
            "bytes": source["bytes"],
            "sha256": source["sha256"],
            "seconds": source["seconds"],
            "eventBindings": source["eventBindings"],
            "decision": exported["decision"],
            "reviewer": "owner",
            "reviewedAt": payload["reviewedAt"],
            "language": "ja",
            "speaker": source["nativeId"],
            "gainDecision": "keep-source-gain",
            "runtimeApproved": exported["decision"] == "approve",
        })
    normalized.sort(key=lambda row: row["key"])
    return {
        "schema": SCHEMA,
        "sourceId": queue["sourceId"],
        "reviewedAt": payload["reviewedAt"],
        "reviewer": "owner",
        "scope": "Owner playback decisions for the exact ambiguous skill-callout set.",
        "sourceQueueSha256": sha256(base / "listening-review-queue.json"),
        "decisions": normalized,
        "summary": {
            "reviewed": len(normalized),
            "approved": sum(row["runtimeApproved"] for row in normalized),
            "rejected": sum(not row["runtimeApproved"] for row in normalized),
            "pending": 0,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.write == args.check:
        raise SystemExit("choose exactly one of --write or --check")
    result = validate(json.loads(args.input.read_text()))
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUTPUT.write_text(rendered)
    elif not OUTPUT.is_file() or OUTPUT.read_text() != rendered:
        raise ValueError("canonical gap decisions are stale")
    print(json.dumps(result["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
