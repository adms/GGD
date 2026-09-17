#!/usr/bin/env python3
"""Probe split J-Stars $CMP members and the known QuickBMS decoder boundary."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import shutil
import struct
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


SCHEMA = "ggd.jstars-owner-cmp-probe@1"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def default_split_root() -> Path:
    return repo_root().parent / "GGD-Asset-Library/conversions/jstars-owner-archive-extract-v1/native-token-members"


def default_probe_root() -> Path:
    return repo_root().parent / "GGD-Asset-Library/conversions/jstars-owner-archive-extract-v1/cmp-probe"


def default_output() -> Path:
    return repo_root() / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cmp-probe.json"


def default_quickbms() -> Path:
    return repo_root().parent / "GGD-Asset-Library/tools/QuickBMS-complete-mirror/prebuilt-macos-0.12.0/quickbms"


def default_bms() -> Path:
    return repo_root().parent / "GGD-Asset-Library/conversions/jstars-009-20260911-v1/reference-tools/cmp_scz.bms"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def u32be(data: bytes, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


def inspect_cmp(path: Path, split_root: Path) -> dict[str, Any] | None:
    data = path.read_bytes()
    if data[:4] != b"$CMP":
        return None
    if len(data) < 32:
        raise ValueError(f"truncated $CMP: {path}")
    cursor = 32
    chunks = []
    while cursor + 16 <= len(data):
        mode = data[cursor : cursor + 4]
        if mode not in {b"$CL0", b"$CLH"}:
            break
        stored_bytes = u32be(data, cursor + 8)
        if stored_bytes < 16 or stored_bytes > len(data) - cursor:
            raise ValueError(f"invalid $CMP chunk bounds: {path}@{cursor}")
        chunk = data[cursor : cursor + stored_bytes]
        row: dict[str, Any] = {
            "offset": cursor,
            "mode": mode.decode("ascii"),
            "decodedBytes": u32be(data, cursor + 4),
            "storedBytes": stored_bytes,
            "sha256": sha256_bytes(chunk),
        }
        if mode == b"$CLH":
            nested = data[cursor + 16 : cursor + 32]
            row["nestedMode"] = nested[:4].decode("ascii", errors="replace")
            row["nestedStoredBytes"] = u32be(nested, 8) if len(nested) >= 12 else None
        chunks.append(row)
        cursor += stored_bytes
    relative = path.relative_to(split_root)
    return {
        "path": str(path.resolve()),
        "relativePath": relative.as_posix(),
        "nativeToken": relative.parts[0],
        "bytes": len(data),
        "sha256": sha256_bytes(data),
        "declaredDecodedBytes": u32be(data, 16),
        "chunkCount": len(chunks),
        "chunkModes": dict(sorted(Counter(row["mode"] for row in chunks).items())),
        "parsedChunkBytes": cursor - 32,
        "unparsedTailBytes": len(data) - cursor,
        "requiresUnsupportedCh0Stage": any(row.get("nestedMode") == "$CH0" for row in chunks),
        "chunks": chunks,
    }


def write_deterministic_gzip(rows: list[dict[str, Any]], path: Path) -> dict[str, Any]:
    raw = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows).encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as stream:
        with gzip.GzipFile(filename="", mode="wb", fileobj=stream, mtime=0) as archive:
            archive.write(raw)
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256_path(path), "rows": len(rows)}


def preserve_exact(path: Path, data: bytes) -> dict[str, Any]:
    if path.is_file():
        if path.read_bytes() != data:
            raise ValueError(f"refusing to overwrite changed probe artifact: {path}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return {"absolutePath": str(path.resolve()), "bytes": len(data), "sha256": sha256_bytes(data)}


def run_quickbms_probe(source: Path, quickbms: Path, bms: Path, probe_root: Path) -> dict[str, Any]:
    if not source.is_file() or not quickbms.is_file() or not bms.is_file():
        return {
            "attempted": False,
            "reason": "representative source, QuickBMS executable, or cmp_scz.bms is missing",
            "sourceExists": source.is_file(),
            "quickBmsExists": quickbms.is_file(),
            "scriptExists": bms.is_file(),
        }
    with tempfile.TemporaryDirectory(prefix="jstars-quickbms-") as temporary:
        destination = Path(temporary)
        command = [str(quickbms), "-Y", "-o", str(bms), str(source), str(destination)]
        completed = subprocess.run(command, text=True, capture_output=True, check=False)
        outputs = []
        for item in sorted(destination.iterdir(), key=lambda value: value.name):
            if not item.is_file():
                continue
            data = item.read_bytes()
            retained = preserve_exact(probe_root / "quickbms-partial" / item.name, data)
            outputs.append({"fileName": item.name, "magicHex": data[:4].hex(), **retained})
        stable_command = [*command[:-1], "<temporary-output>"]
        normalized_stdout = completed.stdout.replace(str(destination), "<temporary-output>")
        normalized_stderr = completed.stderr.replace(str(destination), "<temporary-output>")
    stdout = preserve_exact(probe_root / "quickbms.stdout.normalized.txt", normalized_stdout.encode("utf-8"))
    stderr = preserve_exact(probe_root / "quickbms.stderr.normalized.txt", normalized_stderr.encode("utf-8"))
    declared = u32be(source.read_bytes()[:32], 16)
    complete = completed.returncode == 0 and len(outputs) == 1 and outputs[0]["bytes"] == declared
    return {
        "attempted": True,
        "command": stable_command,
        "returnCode": completed.returncode,
        "terminatedBySignal": -completed.returncode if completed.returncode < 0 else None,
        "source": {"absolutePath": str(source.resolve()), "bytes": source.stat().st_size, "sha256": sha256_path(source)},
        "quickBms": {"absolutePath": str(quickbms.resolve()), "sha256": sha256_path(quickbms)},
        "script": {"absolutePath": str(bms.resolve()), "sha256": sha256_path(bms)},
        "stdout": stdout,
        "stderr": stderr,
        "outputs": outputs,
        "declaredDecodedBytes": declared,
        "completeNativeDecode": complete,
    }


def build(split_root: Path, probe_root: Path, quickbms: Path, bms: Path) -> dict[str, Any]:
    probes = []
    for path in sorted(split_root.rglob("*.pak"), key=lambda value: str(value).casefold()):
        probe = inspect_cmp(path, split_root)
        if probe:
            probes.append(probe)
    probe_root.mkdir(parents=True, exist_ok=True)
    full_manifest = write_deterministic_gzip(probes, probe_root / "cmp-files.jsonl.gz")
    unsupported = [
        {"probe": probe, "chunk": chunk}
        for probe in probes
        for chunk in probe["chunks"]
        if chunk.get("nestedMode") == "$CH0"
    ]
    minimum = min(unsupported, key=lambda row: (row["chunk"]["storedBytes"], row["probe"]["relativePath"], row["chunk"]["offset"])) if unsupported else None
    minimum_record = None
    if minimum:
        source = Path(minimum["probe"]["path"])
        with source.open("rb") as stream:
            stream.seek(minimum["chunk"]["offset"])
            data = stream.read(minimum["chunk"]["storedBytes"])
        minimum_record = {
            "sourceRelativePath": minimum["probe"]["relativePath"],
            "offset": minimum["chunk"]["offset"],
            "mode": minimum["chunk"]["mode"],
            "nestedMode": minimum["chunk"]["nestedMode"],
            **preserve_exact(probe_root / "minimal-unsupported-clh-ch0.bin", data),
        }
    by_token: dict[str, dict[str, Any]] = defaultdict(lambda: {"cmpFiles": 0, "cl0Chunks": 0, "clhChunks": 0, "ch0Files": 0})
    for probe in probes:
        summary = by_token[probe["nativeToken"]]
        summary["cmpFiles"] += 1
        summary["cl0Chunks"] += probe["chunkModes"].get("$CL0", 0)
        summary["clhChunks"] += probe["chunkModes"].get("$CLH", 0)
        summary["ch0Files"] += int(probe["requiresUnsupportedCh0Stage"])
    representative = (
        split_root
        / "018/partition_op_character_ps3.cpk/character/model/character_model_018_m.pak"
    )
    quickbms_probe = run_quickbms_probe(representative, quickbms, bms, probe_root)
    return {
        "schema": SCHEMA,
        "sourceId": "owner-jstars-victory-vs-plus-20260917",
        "status": "cmp-probed-complete-native-decode-blocked" if not quickbms_probe.get("completeNativeDecode") else "cmp-native-decode-complete",
        "splitRoot": str(split_root.resolve()),
        "fullProbeManifest": full_manifest,
        "tokenSummaries": [{"nativeToken": token, **summary} for token, summary in sorted(by_token.items())],
        "minimumUnsupportedChunk": minimum_record,
        "quickBmsRepresentativeProbe": quickbms_probe,
        "summary": {
            "cmpFiles": len(probes),
            "nativeTokens": len(by_token),
            "cl0Chunks": sum(row["chunkModes"].get("$CL0", 0) for row in probes),
            "clhChunks": sum(row["chunkModes"].get("$CLH", 0) for row in probes),
            "filesRequiringCh0": sum(row["requiresUnsupportedCh0Stage"] for row in probes),
            "completeNativeDecodes": int(bool(quickbms_probe.get("completeNativeDecode"))),
        },
        "blocker": {
            "action": "decode mixed $CMP $CLH chunks",
            "resource": "$CH0 entropy stage",
            "reason": "the retained public cmp_scz.bms path does not implement the observed $CH0 stage completely",
            "nextStep": "implement and validate the $CH0 entropy stage against exact decoded-size and STPK table checks before SRD conversion",
        },
    }


def serialize(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split-root", type=Path, default=default_split_root())
    parser.add_argument("--probe-root", type=Path, default=default_probe_root())
    parser.add_argument("--quickbms", type=Path, default=default_quickbms())
    parser.add_argument("--script", type=Path, default=default_bms())
    parser.add_argument("--output", type=Path, default=default_output())
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    value = build(args.split_root.resolve(), args.probe_root.resolve(), args.quickbms.resolve(), args.script.resolve())
    rendered = serialize(value)
    output = args.output.resolve()
    if args.check:
        if not output.is_file() or output.read_text(encoding="utf-8") != rendered:
            print(f"stale or missing probe receipt: {output}", file=sys.stderr)
            return 1
        print(f"ok: {output} ({value['status']})")
        return 0
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(rendered, encoding="utf-8")
    print(json.dumps({"output": str(output), **value["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
