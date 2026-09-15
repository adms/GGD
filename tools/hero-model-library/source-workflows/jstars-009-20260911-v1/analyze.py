#!/usr/bin/env python3
"""Record a reproducible, non-promotional analysis of the J-Stars 009 PAK sample.

The three PAKs remain native $CMP containers.  The tool validates their known
hashes, records their container headers, and optionally runs the public
QuickBMS cmp_scz.bms script in an isolated directory.  A QuickBMS output is
retained only as a *partial index* unless its byte count equals the PAK's
declared decoded size.  No output from this workflow is a GGD model.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
from pathlib import Path


EXPECTED = {
    "i": ("character_model_009_i.pak", 956000,
          "143dcd6b72ff53e81c2497ab85901f14b051bbe0324a9b2a9ccb1e0fde9aad22"),
    "m": ("character_model_009_m.pak", 287408,
          "804288516207ee498fed227ddfa0ce1f6ad86754588730b562642760a39f3b43"),
    "v": ("character_model_009_v.pak", 2330800,
          "27775f7255fbc8d7603ad144e2b73b727770e822d329cc09cd879cf1be44d088"),
}
STPK_IDENTITY_MARKERS = [
    "009_vegeta_01p_PS3_texture.srd",
    "009_vegeta_01p_PS3.srd",
    "009_vegeta_01p_PS3_ability.srd",
    "009_vegeta_stream_jp_lps_PS3.pak",
]


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def u32be(data: bytes, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


def ascii_strings(data: bytes, minimum: int = 4) -> list[str]:
    strings, current = [], bytearray()
    for byte in data:
        if 32 <= byte <= 126:
            current.append(byte)
        else:
            if len(current) >= minimum:
                strings.append(current.decode("ascii"))
            current.clear()
    if len(current) >= minimum:
        strings.append(current.decode("ascii"))
    return strings


def inspect_pak(path: Path, kind: str) -> dict:
    expected_name, expected_bytes, expected_sha = EXPECTED[kind]
    if path.name != expected_name or path.stat().st_size != expected_bytes or sha(path) != expected_sha:
        raise ValueError(f"unrecognised or changed {kind} source: {path}")
    raw = path.read_bytes()
    if raw[:4] != b"$CMP" or len(raw) < 32:
        raise ValueError(f"{path.name} is not a complete $CMP container")
    compressed = u32be(raw, 20)
    decode_region = compressed + 16
    if decode_region > len(raw):
        raise ValueError(f"{path.name} declares a decode region beyond the file")
    tail = raw[decode_region:]
    return {
        "kind": kind,
        "path": str(path.resolve()),
        "bytes": len(raw),
        "sha256": expected_sha,
        "magic": "$CMP",
        "header": {
            "field04": u32be(raw, 4),
            "declaredDecodedBytes": u32be(raw, 16),
            "compressedBytesForQuickBms": compressed,
            "field18": u32be(raw, 24),
            "field1c": u32be(raw, 28),
            "quickBmsInputBytes": decode_region,
            "terminalBytesNotPassedToQuickBms": len(tail),
            "terminalSha256": hashlib.sha256(tail).hexdigest(),
            "terminalHex": tail.hex(),
        },
    }


def run_quickbms(*, quickbms: Path, bms: Path, source: Path, destination: Path, declared: int) -> dict:
    destination.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [str(quickbms), "-Y", "-o", str(bms), str(source), str(destination)],
        text=True, capture_output=True, check=False,
    )
    (destination / "quickbms.stdout.txt").write_text(result.stdout, encoding="utf-8")
    (destination / "quickbms.stderr.txt").write_text(result.stderr, encoding="utf-8")
    outputs = [p for p in destination.iterdir() if p.is_file() and p.suffix not in {".txt"}]
    rows = []
    for output in sorted(outputs):
        content = output.read_bytes()
        rows.append({
            "path": output.name,
            "bytes": len(content),
            "sha256": sha(output),
            "magic": content[:4].decode("ascii", errors="replace"),
            "declaredSizeMatch": len(content) == declared,
        })
    return {
        "command": [str(quickbms), "-Y", "-o", str(bms), str(source), str(destination)],
        "returnCode": result.returncode,
        "terminatedBySignal": -result.returncode if result.returncode < 0 else None,
        "outputs": rows,
        "success": result.returncode == 0 and len(rows) == 1 and rows[0]["declaredSizeMatch"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path,
                        help="directory containing character_model_009_i/m/v.pak")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--quickbms", required=True, type=Path)
    parser.add_argument("--script", required=True, type=Path,
                        help="public cmp_scz.bms script used with QuickBMS")
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    quickbms, bms = args.quickbms.resolve(), args.script.resolve()
    if output.exists():
        raise ValueError(f"refusing to overwrite existing analysis: {output}")
    if not quickbms.is_file() or not bms.is_file():
        raise ValueError("QuickBMS executable or script is missing")
    output.mkdir(parents=True)
    receipts = {kind: inspect_pak(source / values[0], kind) for kind, values in EXPECTED.items()}
    reference = output / "reference-tools"
    reference.mkdir()
    shutil.copy2(bms, reference / "cmp_scz.bms")
    shutil.copy2(quickbms, reference / "quickbms")
    tool = {
        "quickBms": str(quickbms), "quickBmsSha256": sha(quickbms),
        "quickBmsVersion": "0.12.0 (official macOS package build 2022-08-24)",
        "scriptSource": "https://aluigi.altervista.org/papers/cmp_scz.bms",
        "scriptSha256": sha(bms),
        "scriptCopy": str((reference / "cmp_scz.bms").resolve()),
        "quickBmsCopy": str((reference / "quickbms").resolve()),
    }
    for kind in EXPECTED:
        destination = output / "quickbms" / kind
        receipts[kind]["quickBms"] = run_quickbms(
            quickbms=quickbms, bms=bms, source=Path(receipts[kind]["path"]),
            destination=destination, declared=receipts[kind]["header"]["declaredDecodedBytes"],
        )
    partial = output / "quickbms" / "m" / "character_model_009_m.stp"
    if partial.is_file() and partial.read_bytes()[:4] == b"STPK":
        strings = ascii_strings(partial.read_bytes())
        receipts["m"]["partialIndexEvidence"] = {
            "path": str(partial.resolve()), "bytes": partial.stat().st_size, "sha256": sha(partial),
            "magic": "STPK", "identityMarkers": [marker for marker in STPK_IDENTITY_MARKERS if marker in strings],
            "status": "partial-only-size-mismatch-not-native-decode-success",
        }
    summary = {
        "schema": "ggd-jstars-009-analysis@1",
        "sourceId": "parallel-ps-jstars-sample",
        "source": str(source),
        "tool": tool,
        "pakReceipts": receipts,
        "identity": {
            "nativeCharacterId": "009", "name": "Vegeta", "nameOriginal": "ベジータ",
            "status": "internal-index-name-observed-not-visually-confirmed",
            "evidencePak": "m",
        },
        "assetStatus": {
            "model": "not-decoded", "textures": "referenced-by-partial-index-not-extracted",
            "skeleton": "not-decoded", "animation": "referenced-by-partial-index-not-extracted",
            "vfx": "not-established", "audio": "JP stream container referenced-not-extracted",
        },
        "acceptance": {
            "completeNativeDecode": False, "standardizedModel": False,
            "visualValidation": False, "backendRegistered": False, "runtimeSelectable": False,
        },
    }
    (output / "analysis.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"completeNativeDecode": False, "quickBmsSuccesses":
          sum(row["quickBms"]["success"] for row in receipts.values()),
          "analysis": str((output / "analysis.json").resolve())}, ensure_ascii=False))


if __name__ == "__main__":
    main()
