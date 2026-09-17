#!/usr/bin/env python3
"""Extract the pinned KOF XIV TRY scope when the read-only WAD is remounted."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("kof_xiv_terry_inventory", HERE / "build_inventory.py")
INVENTORY = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(INVENTORY)

WAD_BYTES = 17_873_349_716
WAD_SHA256 = "96a14e2b0bd5a4de829e7b468b43909cc96a72d2ae3babcc3ef5d5d6249091f0"
QUICKBMS_SHA256 = "53f7a42ce35a68acf21a247b291032abe29b07246188f73df8eed776abca0af7"
SCRIPT_SHA256 = "ede3b47205d8fd92caceb9bcb96450ac7a03139359564dadfd8529c2d1b5bd13"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def expected_rows(path_index: Path) -> dict[str, dict[str, object]]:
    rows: dict[str, dict[str, object]] = {}
    with gzip.open(path_index, "rt", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            rows[row["path"]] = row
    if len(rows) != INVENTORY.EXPECTED_ROWS:
        raise ValueError("Terry path index row count changed")
    return rows


def freeze_extracted(extracted: Path, indexed: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    actual = {
        path.relative_to(extracted).as_posix(): path
        for path in extracted.rglob("*")
        if path.is_file()
    }
    if set(actual) != set(indexed):
        missing = sorted(set(indexed) - set(actual))[:5]
        extra = sorted(set(actual) - set(indexed))[:5]
        raise ValueError(f"Terry extracted path set differs: missing={missing}, extra={extra}")
    frozen = []
    for name in sorted(actual):
        path = actual[name]
        row = indexed[name]
        if path.stat().st_size != row["listedBytes"]:
            raise ValueError("Terry extracted byte count differs: " + name)
        frozen.append({
            "path": name,
            "absolutePath": str(path.resolve()),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "assetKind": row["assetKind"],
            "resourceRole": row["resourceRole"],
            "nativeCharacterId": "TRY",
        })
    return frozen


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=INVENTORY.REPO)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--wad", type=Path, required=True)
    parser.add_argument("--quickbms", type=Path, required=True)
    parser.add_argument("--script", type=Path, required=True)
    parser.add_argument(
        "--local-root",
        default="GGD-Asset-Library/intake/windows-readonly-20260914/kof-xiv-terry-native-v1",
    )
    parser.add_argument("--reuse-extracted", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace.resolve()
    local_root = (workspace / args.local_root).resolve()
    if not local_root.is_relative_to(workspace):
        raise ValueError("local output must remain inside the workspace")
    wad = args.wad.resolve()
    quickbms = args.quickbms.resolve()
    script = args.script.resolve()
    if wad.stat().st_size != WAD_BYTES or sha256(wad) != WAD_SHA256:
        raise ValueError("mounted KOF XIV WAD differs from pinned parent source")
    if sha256(quickbms) != QUICKBMS_SHA256 or sha256(script) != SCRIPT_SHA256:
        raise ValueError("QuickBMS executable or KOF XIV script differs from pinned decoder")

    path_index = repo / "materials/hero-model-library/source-inventories/kof-xiv-terry-path-index-v1/files.jsonl.gz"
    indexed = expected_rows(path_index)
    extracted = local_root / "extracted"
    logs = local_root / "logs"
    extracted.mkdir(parents=True, exist_ok=True)
    logs.mkdir(parents=True, exist_ok=True)
    if not args.reuse_extracted:
        result = subprocess.run(
            [str(quickbms), "-o", "-f", "Chara/TRY/{}", str(script), str(wad), str(extracted)],
            check=True,
            capture_output=True,
            text=True,
        )
        (logs / "quickbms-extract.log").write_text(result.stdout, encoding="utf-8")
    frozen = freeze_extracted(extracted, indexed)
    manifest = {
        "schema": "ggd.kofxiv-terry-extraction@1",
        "sourceId": INVENTORY.SOURCE_ID,
        "sourceGame": "THE KING OF FIGHTERS XIV",
        "nativeCharacterId": "TRY",
        "source": {"absolutePath": str(wad), "bytes": wad.stat().st_size, "sha256": WAD_SHA256, "access": "read-only mount"},
        "decoder": {
            "executablePath": str(quickbms),
            "executableSha256": QUICKBMS_SHA256,
            "scriptPath": str(script),
            "scriptSha256": SCRIPT_SHA256,
        },
        "files": frozen,
        "summary": {
            "files": len(frozen),
            "bytes": sum(int(row["bytes"]) for row in frozen),
            "allFilesSha256Verified": True,
            "converted": 0,
            "reviewed": 0,
            "runtimeBindings": 0,
            "backendOptions": 0,
            "deployed": 0,
        },
    }
    output = local_root / "extraction-manifest.json"
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(output), "files": len(frozen), "bytes": manifest["summary"]["bytes"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
