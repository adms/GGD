#!/usr/bin/env python3
"""Inventory J-Stars $CMP/STPK research samples without claiming GGD readiness."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from collections import Counter
from pathlib import Path


CHARACTERS = {
    "000": {"slug": "luffy", "name": "Monkey D. Luffy", "nameOriginal": "モンキー・D・ルフィ"},
    "013": {"slug": "toriko", "name": "Toriko", "nameOriginal": "トリコ"},
    "014": {"slug": "zebra", "name": "Zebra", "nameOriginal": "ゼブラ"},
    "018": {"slug": "killua", "name": "Killua Zoldyck", "nameOriginal": "キルア＝ゾルディック"},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def u32be(data: bytes, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


def safe_name(raw: bytes) -> str:
    name = raw.split(b"\0", 1)[0].decode("ascii")
    if not name or name in {".", ".."} or "/" in name or "\\" in name:
        raise ValueError(f"unsafe STPK member name: {name!r}")
    return name


def parse_stpk(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 16 or data[:4] != b"STPK":
        raise ValueError(f"not an STPK container: {path}")
    version, count, alignment = (u32be(data, offset) for offset in (4, 8, 12))
    table_end = 16 + count * 48
    if table_end > len(data):
        raise ValueError(f"STPK table exceeds file: {path}")
    rows = []
    for index in range(count):
        cursor = 16 + index * 48
        offset, size = u32be(data, cursor), u32be(data, cursor + 4)
        name = safe_name(data[cursor + 16:cursor + 48])
        if offset > len(data) or size > len(data) - offset:
            raise ValueError(f"STPK member exceeds file: {path}:{name}")
        payload = data[offset:offset + size]
        rows.append({
            "index": index,
            "name": name,
            "offset": offset,
            "bytes": size,
            "sha256": hashlib.sha256(payload).hexdigest() if size else None,
            "magic": payload[:4].decode("ascii", errors="replace") if size else None,
        })
    return {
        "path": str(path.resolve()), "bytes": len(data), "sha256": sha256(path),
        "version": version, "entryCount": count, "alignmentField": alignment,
        "nonEmptyEntryCount": sum(row["bytes"] > 0 for row in rows), "entries": rows,
    }


def inspect_cmp(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 32 or data[:4] != b"$CMP":
        raise ValueError(f"not a $CMP container: {path}")
    cursor, chunks = 32, []
    while cursor + 16 <= len(data):
        magic = data[cursor:cursor + 4]
        if magic not in {b"$CL0", b"$CLH"}:
            break
        decoded_bytes = u32be(data, cursor + 4)
        stored_bytes = u32be(data, cursor + 8)
        extra = u32be(data, cursor + 12)
        if stored_bytes < 16 or stored_bytes > len(data) - cursor:
            raise ValueError(f"invalid $CMP chunk bounds: {path}@{cursor}")
        row = {
            "offset": cursor, "mode": magic.decode("ascii"), "storedBytes": stored_bytes,
            "decodedBytes": decoded_bytes, "field0c": extra,
        }
        if magic == b"$CLH":
            nested = data[cursor + 16:cursor + 32]
            row["nestedMode"] = nested[:4].decode("ascii", errors="replace")
            row["nestedFields"] = [u32be(nested, x) for x in (4, 8, 12)]
        chunks.append(row)
        cursor += stored_bytes
    counts = Counter(row["mode"] for row in chunks)
    return {
        "path": str(path.resolve()), "bytes": len(data), "sha256": sha256(path),
        "declaredDecodedBytes": u32be(data, 16),
        "chunkCount": len(chunks), "chunkModes": dict(sorted(counts.items())),
        "parsedChunkBytes": cursor - 32, "unparsedTailBytes": len(data) - cursor,
        "requiresUnsupportedCh0Stage": counts.get("$CLH", 0) > 0,
        "chunks": chunks,
    }


def extract_stpk(stpk: dict, destination: Path) -> list[dict]:
    source = Path(stpk["path"])
    data = source.read_bytes()
    destination.mkdir(parents=True, exist_ok=False)
    outputs = []
    for row in stpk["entries"]:
        if not row["bytes"]:
            continue
        output = destination / row["name"]
        output.write_bytes(data[row["offset"]:row["offset"] + row["bytes"]])
        outputs.append({"path": str(output.resolve()), "bytes": output.stat().st_size, "sha256": sha256(output)})
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--git-evidence", required=True, type=Path)
    args = parser.parse_args()
    source, output, evidence = args.source.resolve(), args.output.resolve(), args.git_evidence.resolve()
    if output.exists() or evidence.exists():
        raise ValueError("refusing to overwrite existing output")
    output.mkdir(parents=True)
    evidence.mkdir(parents=True)
    characters = []
    for native_id, identity in CHARACTERS.items():
        folder = source / "extracted" / identity["slug"]
        pairs, package_counts = [], Counter()
        for kind in ("i", "m", "v"):
            stem = f"character_model_{native_id}_{kind}"
            pak, stpk_path = folder / f"{stem}.pak", folder / f"{stem}.stpk"
            if not pak.is_file() or not stpk_path.is_file():
                raise FileNotFoundError(f"missing comparison pair: {stem}")
            cmp_info, stpk_info = inspect_cmp(pak), parse_stpk(stpk_path)
            declared = cmp_info["declaredDecodedBytes"]
            extracted = extract_stpk(stpk_info, output / identity["slug"] / kind)
            package_counts.update(Path(row["path"]).suffix.lower() for row in extracted)
            pairs.append({
                "kind": kind, "pak": cmp_info, "stpk": stpk_info,
                "declaredMinusStpkBytes": declared - stpk_info["bytes"],
                "exactDeclaredSizeMatch": declared == stpk_info["bytes"],
                "splitOutputs": extracted,
            })
        characters.append({
            "nativeCharacterId": native_id, **identity,
            "identityStatus": "archive-directory-and-internal-member-names-observed-not-visually-confirmed",
            "pairs": pairs, "splitMemberExtensions": dict(sorted(package_counts.items())),
            "acceptance": {
                "nativeContainerSplit": True, "standardizedModel": False,
                "texturesDecoded": False, "skeletonVerified": False, "nativeAnimationsExtracted": False,
                "vfxExtracted": False, "audioDecoded": False, "visualValidation": False,
                "backendRegistered": False, "runtimeSelectable": False,
            },
        })
    report = {
        "schema": "ggd.jstars-stpk-research@1",
        "sourceId": "zenhax-jstars-pak-stpk-comparison-v1",
        "source": str(source), "conversionOutput": str(output),
        "characters": characters,
        "summary": {
            "nativeCharacters": len(characters), "pakStpkPairs": sum(len(x["pairs"]) for x in characters),
            "stpkContainersSplit": sum(len(x["pairs"]) for x in characters),
            "standardizedModels": 0, "nativeAnimations": 0, "vfx": 0, "decodedAudio": 0,
            "blockedCmpPairs": sum(p["pak"]["requiresUnsupportedCh0Stage"] for x in characters for p in x["pairs"]),
        },
        "blockers": [
            {"action": "decode $CLH chunks", "resource": "$CH0 entropy stage embedded in J-Stars $CMP", "reason": "current public cmp_scz.bms/QuickBMS path does not implement the $CH0 stage safely"},
            {"action": "convert model/texture", "resource": "PS3 SRD/SRDI/SRDV members", "reason": "native members are split and hashed, but console geometry layout and texture swizzle are not validated by a runnable local converter"},
            {"action": "verify skeleton, animation, VFX and audio", "resource": "four character samples", "reason": "the sample contains character_model i/m/v groups only; the referenced resources have not been decoded or visually/event verified"},
        ],
    }
    report_path = evidence / "analysis.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
