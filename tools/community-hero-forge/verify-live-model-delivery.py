#!/usr/bin/env python3
"""Verify the exact published model files; optionally read bytes from a Git ref."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = "materials/community-hero-forge/receipts/live-model-git-delivery.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--git-ref", help="Verify committed blobs instead of worktree files")
    args = parser.parse_args()

    def read(path):
        if args.git_ref:
            return subprocess.check_output(["git", "show", f"{args.git_ref}:{path}"], cwd=ROOT)
        return (ROOT / path).read_bytes()

    manifest = json.loads(read(MANIFEST))
    paths = set()
    total = 0
    for model in manifest["models"]:
        path = model["path"]
        assert path == f"content/assets/models/community/{model['sha256']}.glb", path
        assert path not in paths, path
        paths.add(path)
        data = read(path)
        assert len(data) == model["bytes"], f"size: {path}"
        assert hashlib.sha256(data).hexdigest() == model["sha256"], f"sha256: {path}"
        assert len(data) >= 20, f"short GLB: {path}"
        assert struct.unpack_from("<4sII", data) == (b"glTF", 2, len(data)), f"GLB: {path}"
        offset = 12
        document = None
        while offset < len(data):
            size, kind = struct.unpack_from("<I4s", data, offset)
            offset += 8
            assert size % 4 == 0 and offset + size <= len(data), f"GLB chunk: {path}"
            if kind == b"JSON":
                assert document is None, f"duplicate JSON: {path}"
                document = json.loads(data[offset:offset + size])
            offset += size
        assert document is not None and offset == len(data), f"GLB chunks: {path}"
        for entry in document.get("buffers", []) + document.get("images", []):
            uri = entry.get("uri")
            assert uri is None or uri.startswith("data:"), f"external dependency: {path}"
        total += len(data)
    inventory = manifest["modelInventory"]
    assert len(paths) == inventory["deliveredFiles"] == inventory["missingFromBaseMain"]
    assert total == inventory["deliveredBytes"]
    print(f"Verified {len(paths)} GLB files, {total} bytes ({args.git_ref or 'worktree'}); no network or writes")


if __name__ == "__main__":
    main()
