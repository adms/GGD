#!/usr/bin/env python3
"""Inventory encrypted CRI CPK files from the owner J-Stars ISO.

The parser reads the CPK/TOC tables and hashes the exact stored bytes for every
member without modifying or decoding the source containers.  A full compressed
JSONL manifest stays in GGD-Asset-Library; Git receives a compact receipt plus
the exact members that can be assigned to a verified priority character.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import re
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, BinaryIO

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from full_audit_archive import refreshed_full_audit


SCHEMA = "ggd.jstars-owner-cpk-inventory@1"
SOURCE_ID = "owner-jstars-victory-vs-plus-20260917"
CPK_NAMES = (
    "partition_op_battle_ps3.cpk",
    "partition_op_character_ps3.cpk",
    "partition_op_game_ps3.cpk",
    "partition_op_map_ps3.cpk",
    "partition_op_patch_ps3.cpk",
    "partition_op_progress_ps3.cpk",
    "partition_op_sound_ps3.cpk",
)
PRIORITY = (
    {"slug": "gintoki", "nameZhTW": "坂田銀時", "heroIds": ["community-review-23-20260907"]},
    {"slug": "nube", "nameZhTW": "鵺野鳴介／神眉", "heroIds": ["b2-nube"]},
    {"slug": "gon", "nameZhTW": "小傑·富力士", "heroIds": ["godie-ucrl"]},
    {
        "slug": "killua",
        "nameZhTW": "奇犚·揍敵客",
        "heroIds": ["community-review-24-20260907"],
    },
    {"slug": "luckyman", "nameZhTW": "幸運超人", "heroIds": ["b2-luckyman"]},
    {"slug": "hiei", "nameZhTW": "飛影", "heroIds": ["godie-u010", "godie-uvng"]},
)

UTF_TYPES: dict[int, tuple[str, int]] = {
    0x0: (">B", 1),
    0x1: (">b", 1),
    0x2: (">H", 2),
    0x3: (">h", 2),
    0x4: (">I", 4),
    0x5: (">i", 4),
    0x6: (">Q", 8),
    0x7: (">q", 8),
    0x8: (">f", 4),
    0xA: ("string", 4),
    0xB: ("data", 8),
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def default_container_root() -> Path:
    return (
        repo_root().parent
        / "GGD-Asset-Library/intake/owner-jstars-victory-vs-plus-20260917/containers/PS3_GAME/USRDIR/data/PS3"
    )


def default_manifest() -> Path:
    return (
        repo_root().parent
        / "GGD-Asset-Library/conversions/jstars-owner-archive-extract-v1/cpk-members.jsonl.gz"
    )


def default_split_root() -> Path:
    return (
        repo_root().parent
        / "GGD-Asset-Library/conversions/jstars-owner-archive-extract-v1/native-token-members"
    )


def default_output() -> Path:
    return repo_root() / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cpk-inventory.json"


def default_identity_probe() -> Path:
    return repo_root() / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/identity-probe.json"


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_region(stream: BinaryIO, offset: int, size: int) -> tuple[str, bytes]:
    stream.seek(offset)
    remaining = size
    digest = hashlib.sha256()
    prefix = b""
    while remaining:
        chunk = stream.read(min(8 * 1024 * 1024, remaining))
        if not chunk:
            raise ValueError(f"member exceeds source at offset={offset} size={size}")
        if not prefix:
            prefix = chunk[:16]
        digest.update(chunk)
        remaining -= len(chunk)
    return digest.hexdigest(), prefix


def safe_relative_member(path: str) -> Path:
    value = Path(path)
    if value.is_absolute() or not value.parts or any(part in {"", ".", ".."} for part in value.parts):
        raise ValueError(f"unsafe CPK member path: {path!r}")
    return value


def materialize_region(source: Path, offset: int, size: int, destination: Path, expected_sha256: str) -> None:
    if destination.is_file():
        if destination.stat().st_size != size or sha256_path(destination) != expected_sha256:
            raise ValueError(f"refusing to overwrite non-matching split output: {destination}")
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".partial")
    if temporary.exists():
        raise ValueError(f"stale partial split output requires manual review: {temporary}")
    digest = hashlib.sha256()
    with source.open("rb") as reader, temporary.open("xb") as writer:
        reader.seek(offset)
        remaining = size
        while remaining:
            chunk = reader.read(min(8 * 1024 * 1024, remaining))
            if not chunk:
                raise ValueError(f"member exceeds source: {source}@{offset}+{size}")
            writer.write(chunk)
            digest.update(chunk)
            remaining -= len(chunk)
    if digest.hexdigest() != expected_sha256:
        raise ValueError(f"split output SHA-256 mismatch: {destination}")
    temporary.rename(destination)


def decrypt_utf(payload: bytes) -> bytes:
    value = bytearray(payload)
    multiplier = 0x655F
    for index in range(len(value)):
        value[index] ^= multiplier & 0xFF
        multiplier = (multiplier * 0x4115) & 0xFFFFFFFF
    return bytes(value)


def read_chunk_utf(stream: BinaryIO, offset: int) -> dict[str, Any]:
    stream.seek(offset)
    chunk = stream.read(16)
    if len(chunk) != 16:
        raise ValueError(f"truncated CPK chunk header at {offset}")
    size = int.from_bytes(chunk[8:12], "little")
    encrypted = stream.read(size)
    if len(encrypted) != size:
        raise ValueError(f"truncated CPK UTF table at {offset}")
    plain = decrypt_utf(encrypted)
    if plain[:4] != b"@UTF":
        raise ValueError(f"unsupported or unencrypted CPK UTF table at {offset}: {plain[:4]!r}")
    return parse_utf(plain)


def parse_utf(data: bytes) -> dict[str, Any]:
    if len(data) < 32 or data[:4] != b"@UTF":
        raise ValueError("not a CRI @UTF table")

    def u32(offset: int) -> int:
        return int.from_bytes(data[offset : offset + 4], "big")

    table_size = u32(4)
    rows_offset = 8 + u32(8)
    strings_offset = 8 + u32(12)
    data_offset = 8 + u32(16)
    table_name_offset = u32(20)
    column_count = int.from_bytes(data[24:26], "big")
    row_bytes = int.from_bytes(data[26:28], "big")
    row_count = u32(28)
    if not (32 <= rows_offset <= strings_offset <= data_offset <= len(data)):
        raise ValueError("invalid @UTF section offsets")

    def string_at(offset: int) -> str:
        begin = strings_offset + offset
        end = data.find(b"\0", begin, data_offset)
        if begin < strings_offset or end < begin:
            raise ValueError(f"invalid @UTF string offset: {offset}")
        return data[begin:end].decode("utf-8", errors="replace")

    def value_at(type_id: int, offset: int) -> tuple[Any, int]:
        if type_id not in UTF_TYPES:
            raise ValueError(f"unsupported @UTF type: {type_id:#x}")
        kind, size = UTF_TYPES[type_id]
        raw = data[offset : offset + size]
        if len(raw) != size:
            raise ValueError("truncated @UTF value")
        if kind == "string":
            return string_at(int.from_bytes(raw, "big")), size
        if kind == "data":
            return {"offset": int.from_bytes(raw[:4], "big"), "bytes": int.from_bytes(raw[4:], "big")}, size
        return struct.unpack(kind, raw)[0], size

    cursor = 32
    columns = []
    for _ in range(column_count):
        flag = data[cursor]
        name_offset = int.from_bytes(data[cursor + 1 : cursor + 5], "big")
        cursor += 5
        column: dict[str, Any] = {
            "name": string_at(name_offset),
            "storage": flag & 0xF0,
            "type": flag & 0x0F,
        }
        if column["storage"] == 0x30:
            column["constant"], consumed = value_at(column["type"], cursor)
            cursor += consumed
        columns.append(column)

    rows = []
    for row_index in range(row_count):
        cursor = rows_offset + row_index * row_bytes
        row = {}
        for column in columns:
            if column["storage"] == 0x50:
                row[column["name"]], consumed = value_at(column["type"], cursor)
                cursor += consumed
            elif column["storage"] == 0x30:
                row[column["name"]] = column["constant"]
            elif column["storage"] == 0x10:
                row[column["name"]] = 0
            else:
                raise ValueError(f"unsupported @UTF storage: {column['storage']:#x}")
        rows.append(row)
    return {
        "table": string_at(table_name_offset),
        "declaredBytes": table_size,
        "rowCount": row_count,
        "rows": rows,
    }


def native_tokens(path: str) -> list[str]:
    matches = set()
    patterns = (
        r"(?:^|[/_])character_model_(\d{3})(?:_|/)",
        r"(?:^|[/_])battle_character_(\d{3})(?:_|/)",
        r"(?:^|/)(?:cv|pv)_(\d{3})(?:_|/)",
        r"battle_character_(?:assist|assist_skill|sound)[/_](?:jp/)?(?:battle_character_(?:assist|assist_skill|sound)_)?(\d{3})(?:_|/)",
        r"(?:^|/)character/(?:battle_character_assist(?:_skill)?)/(\d{3})(?:/|_)",
    )
    lowered = path.casefold()
    for pattern in patterns:
        matches.update(re.findall(pattern, lowered))
    return sorted(matches)


def classify_modules(container: str, path: str) -> list[str]:
    lowered = path.casefold()
    modules = set()
    if container == "partition_op_character_ps3.cpk":
        if "/model/" in lowered or "character_model_" in lowered:
            modules.update(("model", "texture", "skeleton"))
        if "/battle_character" in lowered:
            modules.add("motion")
        if "assist_skill" in lowered or "effect" in lowered:
            modules.add("vfx")
        if "battle_character_sound" in lowered:
            modules.update(("sfx", "voice"))
    if container == "partition_op_battle_ps3.cpk":
        modules.update(("motion", "vfx"))
    if container == "partition_op_sound_ps3.cpk":
        modules.update(("sfx", "voice"))
    return sorted(modules)


def parse_cpk(path: Path, manifest_rows: list[dict[str, Any]]) -> dict[str, Any]:
    with path.open("rb") as stream:
        magic = stream.read(4)
        if magic != b"CPK ":
            raise ValueError(f"not a CPK container: {path}")
        header = read_chunk_utf(stream, 0)
        if header["table"] != "CpkHeader" or len(header["rows"]) != 1:
            raise ValueError(f"unexpected CPK header table: {path}")
        values = header["rows"][0]
        toc_offset = int(values.get("TocOffset") or 0)
        content_offset = int(values.get("ContentOffset") or 0)
        if not toc_offset:
            raise ValueError(f"CPK has no named TOC: {path}")
        toc = read_chunk_utf(stream, toc_offset)
        if toc["table"] != "CpkTocInfo":
            raise ValueError(f"unexpected CPK TOC table: {path}")
        base_offset = min(value for value in (toc_offset, content_offset) if value > 0)
        module_counts = Counter()
        token_counts = Counter()
        packed_bytes = 0
        container_rows = []
        for toc_row in toc["rows"]:
            directory = str(toc_row.get("DirName") or "").strip("/")
            file_name = str(toc_row.get("FileName") or "")
            logical_path = f"{directory}/{file_name}" if directory else file_name
            size = int(toc_row.get("FileSize") or 0)
            extract_size = int(toc_row.get("ExtractSize") or 0)
            file_offset = int(toc_row.get("FileOffset") or 0)
            absolute_offset = base_offset + file_offset
            digest, prefix = sha256_region(stream, absolute_offset, size)
            modules = classify_modules(path.name, logical_path)
            tokens = native_tokens(logical_path)
            module_counts.update(modules)
            token_counts.update(tokens)
            packed_bytes += size
            row = {
                "container": path.name,
                "path": logical_path,
                "bytes": size,
                "extractBytes": extract_size,
                "sha256": digest,
                "magicHex": prefix[:4].hex(),
                "nativeTokens": tokens,
                "moduleHints": modules,
                "cpkFileId": toc_row.get("ID"),
                "storedOffset": absolute_offset,
            }
            manifest_rows.append(row)
            container_rows.append(row)
    return {
        "fileName": path.name,
        "absolutePath": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": sha256_path(path),
        "cpkVersion": values.get("Version"),
        "cpkRevision": values.get("Revision"),
        "cpkToolVersion": values.get("Tvers"),
        "memberCount": len(container_rows),
        "storedMemberBytes": packed_bytes,
        "moduleHintCounts": dict(sorted(module_counts.items())),
        "nativeTokenCounts": dict(sorted(token_counts.items())),
    }


def manifest_bytes(rows: list[dict[str, Any]]) -> bytes:
    raw = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows).encode("utf-8")
    target = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=target, mtime=0) as archive:
        archive.write(raw)
    return target.getvalue()


def split_native_groups(
    rows: list[dict[str, Any]],
    container_root: Path,
    split_root: Path,
) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        for token in row["nativeTokens"]:
            grouped[token].append(row)
    results = {}
    for token, token_rows in sorted(grouped.items()):
        manifest_rows = []
        for row in token_rows:
            source = container_root / row["container"]
            relative = Path(row["container"]) / safe_relative_member(row["path"])
            destination = split_root / token / relative
            materialize_region(
                source,
                int(row["storedOffset"]),
                int(row["bytes"]),
                destination,
                str(row["sha256"]),
            )
            manifest_rows.append({
                "sourceContainer": row["container"],
                "sourceMember": row["path"],
                "output": str(destination.resolve()),
                "bytes": row["bytes"],
                "sha256": row["sha256"],
                "magicHex": row["magicHex"],
                "moduleHints": row["moduleHints"],
            })
        manifest_path = split_root / token / "manifest.json"
        rendered = json.dumps(
            {
                "schema": "ggd.jstars-native-token-split-manifest@1",
                "sourceId": SOURCE_ID,
                "nativeToken": token,
                "memberCount": len(manifest_rows),
                "members": manifest_rows,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ) + "\n"
        if manifest_path.is_file() and manifest_path.read_text(encoding="utf-8") != rendered:
            raise ValueError(f"refusing to overwrite non-matching token manifest: {manifest_path}")
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(rendered, encoding="utf-8")
        results[token] = {
            "absolutePath": str(manifest_path.resolve()),
            "bytes": manifest_path.stat().st_size,
            "sha256": sha256_path(manifest_path),
            "memberCount": len(manifest_rows),
            "payloadBytes": sum(int(row["bytes"]) for row in manifest_rows),
        }
    return results


def load_priority_identities(identity_probe: Path) -> dict[str, dict[str, Any]]:
    if not identity_probe.is_file():
        return {}
    value = json.loads(identity_probe.read_text(encoding="utf-8"))
    if value.get("schema") != "ggd.jstars-owner-identity-probe@1":
        raise ValueError(f"unsupported identity probe schema: {identity_probe}")
    return {
        str(row["slug"]): row
        for row in value.get("priorityCharacters", [])
        if isinstance(row, dict) and row.get("slug")
    }


def summarize_priority(rows: list[dict[str, Any]], identities: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    for character in PRIORITY:
        identity = identities.get(character["slug"], {})
        native_id = identity.get("nativeId")
        if native_id is None:
            output.append({
                **character,
                "nativeId": None,
                "identityStatus": "blocked-native-id-unproven",
                "memberCount": 0,
                "memberEvidence": None,
                "moduleCounts": {},
                "blockers": ["owner archive filenames expose numeric native IDs but no verified name mapping for this character"],
            })
            continue
        matches = [row for row in rows if native_id in row["nativeTokens"]]
        counts = Counter(module for row in matches for module in row["moduleHints"])
        output.append({
            **character,
            "nativeId": native_id,
            "identityStatus": str(identity.get("identityStatus") or "confirmed-unique-internal-stpk-member-name"),
            "identityEvidence": (
                "identity-probe.json unique internal STPK member-name match "
                f"{character['slug']} -> {native_id}"
            ),
            "memberCount": len(matches),
            "memberEvidence": {
                "bytes": sum(int(row["bytes"]) for row in matches),
                "sha256": hashlib.sha256(
                    "".join(
                        json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
                        for row in matches
                    ).encode("utf-8")
                ).hexdigest(),
                "fullManifest": "GGD-Asset-Library/conversions/jstars-owner-archive-extract-v1/cpk-members.jsonl.gz",
            },
            "moduleCounts": dict(sorted(counts.items())),
            "conversionStatus": "native-containers-hashed-conversion-blocked-by-cmp-ch0-and-ps3-srd",
            "runtimeReady": False,
        })
    return output


def build(container_root: Path, manifest: Path, split_root: Path, identity_probe: Path) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    containers = []
    blockers = []
    for name in CPK_NAMES:
        path = container_root / name
        if not path.is_file():
            blockers.append({"action": "inventory CPK", "resource": str(path), "reason": "container is missing"})
            continue
        containers.append(parse_cpk(path, rows))
    rows.sort(key=lambda row: (row["container"], row["path"]))
    data = manifest_bytes(rows)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_bytes(data)
    manifest_record = {
        "absolutePath": str(manifest.resolve()),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "format": "deterministic-jsonl-gzip-mtime-0",
        "memberCount": len(rows),
    }
    split_manifests = split_native_groups(rows, container_root, split_root)
    token_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {"memberCount": 0, "moduleCounts": Counter()})
    for row in rows:
        for token in row["nativeTokens"]:
            token_groups[token]["memberCount"] += 1
            token_groups[token]["moduleCounts"].update(row["moduleHints"])
    compact_tokens = [
        {
            "nativeToken": token,
            "memberCount": value["memberCount"],
            "moduleCounts": dict(sorted(value["moduleCounts"].items())),
            "splitManifest": split_manifests[token],
        }
        for token, value in sorted(token_groups.items())
    ]
    priority = summarize_priority(rows, load_priority_identities(identity_probe))
    if any(row["nativeId"] is None for row in priority):
        blockers.append({
            "action": "assign owner-priority native IDs",
            "resource": ",".join(row["slug"] for row in priority if row["nativeId"] is None),
            "reason": "identity probe did not provide a unique internal STPK member-name match",
        })
    blockers.extend((
        {
            "action": "decode J-Stars $CMP",
            "resource": "$CH0 entropy stage",
            "reason": "existing validated decoder does not support mixed $CLH/$CH0 chunks",
        },
        {
            "action": "convert PS3 model",
            "resource": "SRD/SRDI/SRDV",
            "reason": "no validated local converter for console geometry layout and PS3 texture swizzle",
        },
    ))
    return {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "status": "native-containers-inventoried-conversion-blocked",
        "fullAudit": refreshed_full_audit({
            "bytes": 339170,
            "sha256": "b9dd84b125d120b2f9aeb23e79533c4a1bbb97fad53472e7331a19cc6efbeaf3",
            "localPath": "../GGD-Asset-Library/conversions/pr1284-preparation-final-v1/payload/materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cpk-inventory.json",
            "gitManifest": "materials/hero-model-library/pr1284-preparation-s3.json",
            "archiveMember": "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cpk-inventory.json",
            "restoreRequiredForInventoryBuild": False,
        }, repo_root()),
        "containerRoot": str(container_root.resolve()),
        "containers": containers,
        "fullMemberManifest": manifest_record,
        "nativeTokenSplitRoot": str(split_root.resolve()),
        "identityProbe": {
            "absolutePath": str(identity_probe.resolve()),
            "exists": identity_probe.is_file(),
            "sha256": sha256_path(identity_probe) if identity_probe.is_file() else None,
        },
        "nativeCharacterGroups": compact_tokens,
        "priorityCharacters": priority,
        "summary": {
            "containersExpected": len(CPK_NAMES),
            "containersInventoried": len(containers),
            "membersHashed": len(rows),
            "nativeTokenGroups": len(compact_tokens),
            "priorityIdentityConfirmed": sum(row["nativeId"] is not None for row in priority),
            "priorityIdentityBlocked": sum(row["nativeId"] is None for row in priority),
            "convertedModels": 0,
            "runtimeRegistered": 0,
        },
        "blockers": blockers,
        "safety": {"sourceContainersModified": False, "memberPayloadsMaterialized": True},
    }


def serialize(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container-root", type=Path, default=default_container_root())
    parser.add_argument("--manifest", type=Path, default=default_manifest())
    parser.add_argument("--split-root", type=Path, default=default_split_root())
    parser.add_argument("--identity-probe", type=Path, default=default_identity_probe())
    parser.add_argument("--output", type=Path, default=default_output())
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    container_root, manifest, split_root, identity_probe, output = (
        args.container_root.resolve(),
        args.manifest.resolve(),
        args.split_root.resolve(),
        args.identity_probe.resolve(),
        args.output.resolve(),
    )
    value = build(container_root, manifest, split_root, identity_probe)
    rendered = serialize(value)
    if args.check:
        if not output.is_file() or output.read_text(encoding="utf-8") != rendered:
            print(f"stale or missing receipt: {output}", file=sys.stderr)
            return 1
        print(f"ok: {output} ({value['summary']['membersHashed']} members)")
        return 0
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(rendered, encoding="utf-8")
    print(json.dumps({"output": str(output), **value["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
