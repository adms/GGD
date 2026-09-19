#!/usr/bin/env python3
"""Decode Hero's Bonds ALI2 indexes and map logical assets to preserved blobs.

The complete cache and bundledtree APK use a small FlatBuffer table identified
by ``ALI2``. This tool does not execute game code. It produces a deterministic
full JSONL index in GGD-Asset-Library and a bounded Git summary for review.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import shutil
import struct
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[4]
DEFAULT_TERMS = ("vearn", "burn", "bahn", "kigan", "バーン", "鬼眼")
DEFAULT_CHARACTER_IDS = ("027003700", "027003800", "027005800", "027005801")
GIT_OUT = ROOT / "materials/hero-model-library/source-inventories/vearn-related-3d-v1"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


@dataclass(frozen=True)
class Ali2Row:
    raw_path: str
    path_hash: int
    stored_bytes: int
    blob_id: int
    unpacked_bytes: int
    group_hash: int
    flags: int
    secondary_key: int

    @property
    def blob_hex(self) -> str:
        return f"{self.blob_id:016x}"

    @property
    def logical_path(self) -> str:
        # ALI2 appends a one-character asset-kind discriminator to each key.
        return self.raw_path[:-1] if self.raw_path[-1:] in "@!" else self.raw_path


class BoundsError(ValueError):
    pass


def _unpack(fmt: str, data: bytes, offset: int) -> tuple[int, ...]:
    size = struct.calcsize(fmt)
    if offset < 0 or offset + size > len(data):
        raise BoundsError(f"ALI2 read outside buffer at {offset} (+{size}, size={len(data)})")
    return struct.unpack_from(fmt, data, offset)


def _field_address(data: bytes, table: int, field: int) -> int:
    (vtable_distance,) = _unpack("<I", data, table)
    vtable = table - vtable_distance
    vtable_bytes, _object_bytes = _unpack("<HH", data, vtable)
    entry = vtable + 4 + field * 2
    if entry + 2 > vtable + vtable_bytes:
        raise ValueError(f"ALI2 field {field} is absent")
    (relative,) = _unpack("<H", data, entry)
    if relative == 0:
        raise ValueError(f"ALI2 field {field} is null")
    return table + relative


def _vector(data: bytes, field_address: int) -> tuple[int, int]:
    (relative,) = _unpack("<I", data, field_address)
    vector = field_address + relative
    (count,) = _unpack("<I", data, vector)
    return vector + 4, count


def parse_ali2(data: bytes) -> tuple[int, list[Ali2Row]]:
    if len(data) < 32 or data[4:8] != b"ALI2":
        raise ValueError("not an ALI2 index")
    (root,) = _unpack("<I", data, 0)
    structs, struct_count = _vector(data, _field_address(data, root, 0))
    keys, key_count = _vector(data, _field_address(data, root, 1))
    strings, string_count = _vector(data, _field_address(data, root, 2))
    (version,) = _unpack("<I", data, _field_address(data, root, 3))
    if len({struct_count, key_count, string_count}) != 1:
        raise ValueError(
            f"ALI2 vector counts differ: structs={struct_count}, keys={key_count}, strings={string_count}"
        )
    rows: list[Ali2Row] = []
    for index in range(struct_count):
        values = _unpack("<6Q", data, structs + index * 48)
        (secondary_key,) = _unpack("<Q", data, keys + index * 8)
        string_entry = strings + index * 4
        (string_relative,) = _unpack("<I", data, string_entry)
        string_start = string_entry + string_relative
        (string_bytes,) = _unpack("<I", data, string_start)
        start = string_start + 4
        if start + string_bytes > len(data):
            raise BoundsError(f"ALI2 string {index} exceeds the index buffer")
        raw_path = data[start:start + string_bytes].decode("utf-8")
        rows.append(Ali2Row(raw_path, *values, secondary_key))
    return version, rows


def _row_payload(row: Ali2Row, source: str, index_name: str, blob_exists: bool,
                 actual_bytes: int | None) -> dict:
    return {
        "source": source,
        "index": index_name,
        "logicalPath": row.logical_path,
        "rawPath": row.raw_path,
        "pathHash": f"{row.path_hash:016x}",
        "secondaryKey": f"{row.secondary_key:016x}",
        "blobId": row.blob_hex,
        "blobRelativePath": f"blob/{row.blob_hex[:2]}/{row.blob_hex}",
        "storedBytes": row.stored_bytes,
        "unpackedBytes": row.unpacked_bytes,
        "groupHash": f"{row.group_hash:016x}",
        "flags": row.flags,
        "blobExists": blob_exists,
        "actualBytes": actual_bytes,
        "sizeMatches": actual_bytes == row.stored_bytes if actual_bytes is not None else False,
    }


def read_cache(index_root: Path, blob_root: Path) -> tuple[list[dict], list[dict]]:
    records: list[dict] = []
    indexes: list[dict] = []
    for path in sorted(index_root.glob("*/*")):
        data = path.read_bytes()
        version, rows = parse_ali2(data)
        indexes.append({
            "source": "downloaded-cache", "path": str(path),
            "sha256": sha256_bytes(data), "bytes": len(data),
            "version": version, "entryCount": len(rows),
        })
        for row in rows:
            blob = blob_root / row.blob_hex[:2] / row.blob_hex
            actual = blob.stat().st_size if blob.is_file() else None
            records.append(_row_payload(row, "downloaded-cache", path.name, blob.is_file(), actual))
    return records, indexes


def read_bundledtree(apk: Path) -> tuple[list[dict], list[dict]]:
    records: list[dict] = []
    indexes: list[dict] = []
    with zipfile.ZipFile(apk) as archive:
        names = set(archive.namelist())
        index_names = sorted(name for name in names if name.startswith("assets/assetpack/index/") and not name.endswith("/"))
        for name in index_names:
            data = archive.read(name)
            version, rows = parse_ali2(data)
            indexes.append({
                "source": "bundledtree-apk", "path": f"{apk}!/{name}",
                "sha256": sha256_bytes(data), "bytes": len(data),
                "version": version, "entryCount": len(rows),
            })
            for row in rows:
                blob_name = f"assets/assetpack/blob/{row.blob_hex[:2]}/{row.blob_hex}"
                info = archive.getinfo(blob_name) if blob_name in names else None
                records.append(_row_payload(
                    row, "bundledtree-apk", Path(name).name, info is not None,
                    info.file_size if info is not None else None,
                ))
    return records, indexes


def write_jsonl_gz(path: Path, rows: Iterable[dict]) -> None:
    payload = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows).encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(payload, mtime=0))


def asset_kind(logical_path: str) -> str:
    folded = logical_path.casefold()
    if "/model/" in folded or "/meshes" in folded or "/materials" in folded or "/textures" in folded:
        return "model"
    if "animationclip" in folded or "animationevent" in folded:
        return "motion"
    if folded.endswith(".acb") or folded.endswith(".awb") or "/sounds/" in folded:
        return "audio"
    if folded.startswith("effect/") or folded.startswith("cutscene/"):
        return "effect-or-cutscene"
    return "supporting-data"


def select_candidate_records(records: Iterable[dict], terms: Iterable[str],
                             character_ids: Iterable[str]) -> list[dict]:
    folded_terms = tuple(term.casefold() for term in terms)
    id_terms = tuple(identifier.casefold() for identifier in character_ids)
    selected: dict[tuple[str, str], dict] = {}
    for row in records:
        logical = row["logicalPath"].casefold()
        if not (any(term in logical for term in folded_terms)
                or any(identifier in logical for identifier in id_terms)):
            continue
        # Prefer the downloaded cache: it is the complete final archive and can
        # be copied without unpacking a nested APK for every selected asset.
        key = (row["logicalPath"], row["blobId"])
        previous = selected.get(key)
        if previous is None or (previous["source"] != "downloaded-cache"
                                and row["source"] == "downloaded-cache"):
            selected[key] = row
    return sorted(selected.values(), key=lambda row: (row["logicalPath"].casefold(), row["blobId"]))


def extract_candidates(rows: Iterable[dict], blob_root: Path, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    manifest_rows: list[dict] = []
    for row in rows:
        if row["source"] != "downloaded-cache":
            continue
        source = blob_root / row["blobId"][:2] / row["blobId"]
        if not source.is_file():
            continue
        destination = output / "blobs" / row["blobId"][:2] / row["blobId"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or destination.stat().st_size != source.stat().st_size:
            shutil.copyfile(source, destination)
        header = source.read_bytes()[:16].hex()
        aladin_encrypted = row["groupHash"] != "0000000000000000" and row["flags"] != 0
        manifest_rows.append({
            **row,
            "assetKind": asset_kind(row["logicalPath"]),
            "sourceAbsolutePath": str(source),
            "extractedAbsolutePath": str(destination),
            "sha256": sha256_file(destination),
            "header16Hex": header,
            "containerStatus": ("dena-aladin-encrypted-blob"
                                if aladin_encrypted else "unencrypted-game-container"),
        })
    manifest = {
        "schema": "ggd.heros-bonds-vearn-extraction@1",
        "entryCount": len(manifest_rows),
        "bytes": sum(row["actualBytes"] for row in manifest_rows),
        "assetKindCounts": {
            kind: sum(row["assetKind"] == kind for row in manifest_rows)
            for kind in sorted({row["assetKind"] for row in manifest_rows})
        },
        "identityEvidence": {
            "027003700": "path-linked-to-shinBurn-cutscene; not proof of Ghost-Eye King",
            "027003800": "adjacent numeric boss character candidate; identity unverified",
            "027005800": "large late-boss model candidate; identity unverified",
            "027005801": "companion large late-boss model candidate; identity unverified",
            "kiganohburn": "direct game path naming confirms Ghost-Eye King effect family",
        },
        "warning": "Only directly named kiganohburn effects are identity-confirmed. Numeric character models require decoded object or visual verification.",
        "files": manifest_rows,
    }
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    manifest["manifest"] = {
        "absolutePath": str(manifest_path),
        "sha256": sha256_file(manifest_path),
        "bytes": manifest_path.stat().st_size,
    }
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-files-root", type=Path, required=True,
                        help="directory containing index/ and blob/ from the preserved cache")
    parser.add_argument("--bundledtree-apk", type=Path)
    parser.add_argument("--local-output", type=Path, required=True)
    parser.add_argument("--summary-output", type=Path, default=GIT_OUT / "bonds-asset-index-summary.json")
    parser.add_argument("--candidate-output", type=Path, default=GIT_OUT / "bonds-vearn-candidates.json")
    parser.add_argument("--term", action="append", dest="terms")
    parser.add_argument("--character-id", action="append", dest="character_ids")
    parser.add_argument("--extract-output", type=Path,
                        help="copy selected cache blobs and write a SHA-256 manifest")
    args = parser.parse_args()

    files_root = args.cache_files_root.resolve()
    records, indexes = read_cache(files_root / "index", files_root / "blob")
    inputs = [{"path": str(files_root), "kind": "downloaded-cache"}]
    if args.bundledtree_apk:
        bundled_records, bundled_indexes = read_bundledtree(args.bundledtree_apk.resolve())
        records.extend(bundled_records)
        indexes.extend(bundled_indexes)
        inputs.append({
            "path": str(args.bundledtree_apk.resolve()), "kind": "bundledtree-apk",
            "bytes": args.bundledtree_apk.stat().st_size,
            "sha256": sha256_file(args.bundledtree_apk),
        })
    records.sort(key=lambda row: (row["logicalPath"].casefold(), row["source"], row["blobId"]))
    write_jsonl_gz(args.local_output.resolve(), records)

    terms = tuple(args.terms or DEFAULT_TERMS)
    character_ids = tuple(args.character_ids or DEFAULT_CHARACTER_IDS)
    candidates = select_candidate_records(records, terms, character_ids)
    missing = [row for row in records if not row["blobExists"]]
    mismatched = [row for row in records if row["blobExists"] and not row["sizeMatches"]]
    summary = {
        "schema": "ggd.heros-bonds-ali2-index@1", "inputs": inputs, "indexes": indexes,
        "entryCount": len(records),
        "uniqueLogicalPathCount": len({row["logicalPath"] for row in records}),
        "blobPresentCount": len(records) - len(missing),
        "missingBlobCount": len(missing), "sizeMismatchCount": len(mismatched),
        "searchTerms": list(terms), "characterIdCandidates": list(character_ids),
        "candidateCount": len(candidates),
        "fullIndex": {"absolutePath": str(args.local_output.resolve()),
                      "bytes": args.local_output.stat().st_size,
                      "sha256": sha256_file(args.local_output.resolve())},
        "identityConclusion": ("direct-path-candidates-require-object-and-visual-verification"
                               if candidates else "no-direct-name-match-character-id-correlation-required"),
        "modelConverted": False, "runtimeRegistered": False,
    }
    candidate_document = {
        "schema": "ggd.heros-bonds-vearn-candidates@1", "searchTerms": list(terms),
        "characterIdCandidates": list(character_ids),
        "candidateCount": len(candidates), "candidates": candidates,
        "warning": "Only kiganohburn path-name matches establish the effect family. Numeric character IDs require decoded object or visual verification.",
    }
    if args.extract_output:
        extraction = extract_candidates(candidates, files_root / "blob", args.extract_output.resolve())
        candidate_document["extraction"] = extraction["manifest"]
        candidate_document["extractedEntryCount"] = extraction["entryCount"]
        candidate_document["extractedBytes"] = extraction["bytes"]
        candidate_document["assetKindCounts"] = extraction["assetKindCounts"]
        candidate_document["identityEvidence"] = extraction["identityEvidence"]
    args.summary_output.parent.mkdir(parents=True, exist_ok=True)
    args.summary_output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    args.candidate_output.write_text(json.dumps(candidate_document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
