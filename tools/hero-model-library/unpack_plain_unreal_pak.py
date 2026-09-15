#!/usr/bin/env python3
"""Safely unpack a bounded subset of Unreal Engine v3/v4 PAK files.

The unpacker accepts only an unencrypted index and entries using either no
compression or compression method 1 (the Zlib framing used by the verified
source PAKs).  It never loads Unreal assets or executes source-provided code.
Every entry header, compressed payload hash, decoded byte count, and output
SHA-256 is recorded in the manifest.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
from pathlib import Path, PurePosixPath
import struct
import sys
import zlib


MAGIC = 0x5A6F12E1
MAX_ENTRIES = 10_000
MAX_STRING_BYTES = 4_096
MAX_ENTRY_BYTES = 100_000_000
MAX_TOTAL_BYTES = 100_000_000
MAX_INDEX_PADDING_BYTES = 64


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pak", type=Path)
    parser.add_argument("output", type=Path,
                        help="A new output directory for safely decoded files.")
    args = parser.parse_args()
    pak = args.pak.resolve()
    output = args.output.resolve()
    if output.exists():
        raise ValueError(f"output must not already exist: {output}")

    data = pak.read_bytes()
    if len(data) < 44:
        raise ValueError("PAK is shorter than its footer")
    footer = len(data) - 44
    magic, version, index_offset, index_size = struct.unpack_from("<IIQQ", data, footer)
    if magic != MAGIC or version not in (3, 4):
        raise ValueError(f"only Unreal PAK v3/v4 is supported (got magic={magic:#x}, version={version})")
    if not (0 <= index_offset < footer and 0 < index_size <= footer - index_offset):
        raise ValueError("PAK index bounds are invalid")
    index_end = index_offset + index_size
    padding = data[index_end:footer]
    if len(padding) > MAX_INDEX_PADDING_BYTES or padding != b"\0" * len(padding):
        raise ValueError("unexpected bytes between PAK index and footer")
    index = data[index_offset:index_end]
    if hashlib.sha1(index).digest() != data[-20:]:
        raise ValueError("PAK index SHA-1 does not match the footer")

    cursor = 0

    def take(count: int) -> bytes:
        nonlocal cursor
        if count < 0 or cursor + count > len(index):
            raise ValueError("PAK index ends unexpectedly")
        value = index[cursor:cursor + count]
        cursor += count
        return value

    def read_string() -> str:
        (count,) = struct.unpack("<i", take(4))
        if not 0 < count < MAX_STRING_BYTES:
            raise ValueError("PAK index string length is invalid or unsupported")
        raw = take(count)
        if raw[-1:] != b"\0":
            raise ValueError("PAK index string has no NUL terminator")
        return raw[:-1].decode("utf-8")

    mount_point = read_string()
    (entry_count,) = struct.unpack("<I", take(4))
    if not 0 < entry_count <= MAX_ENTRIES:
        raise ValueError("PAK entry count is outside the allowed limit")

    entries: list[dict[str, object]] = []
    total_decoded_bytes = 0
    output.mkdir()
    for _ in range(entry_count):
        name = read_string()
        relative = PurePosixPath(name.replace("\\", "/"))
        if relative.is_absolute() or ".." in relative.parts or ":" in name or "\0" in name:
            raise ValueError(f"unsafe PAK entry path: {name!r}")
        entry_start = cursor
        file_offset, compressed_bytes, decoded_bytes, compression = struct.unpack("<QQQI", take(28))
        declared_sha1 = take(20)
        blocks: list[tuple[int, int]] = []
        if compression:
            (block_count,) = struct.unpack("<I", take(4))
            if not 0 < block_count <= MAX_ENTRIES:
                raise ValueError(f"invalid compression block count for {name}")
            blocks = [struct.unpack("<QQ", take(16)) for _ in range(block_count)]
        flags, block_size = struct.unpack("<BI", take(5))
        header_end = cursor

        if flags != 0 or compression not in (0, 1):
            raise ValueError(f"unsupported encryption or compression for {name}: flags={flags}, method={compression}")
        if compressed_bytes > MAX_ENTRY_BYTES or decoded_bytes > MAX_ENTRY_BYTES:
            raise ValueError(f"entry exceeds the per-file size limit: {name}")
        header_bytes = header_end - entry_start
        if not (file_offset + header_bytes <= index_offset):
            raise ValueError(f"entry header is outside PAK payload area: {name}")
        if data[file_offset + 8:file_offset + header_bytes] != index[entry_start + 8:header_end]:
            raise ValueError(f"entry header disagrees with PAK index: {name}")

        if compression == 0:
            if compressed_bytes != decoded_bytes:
                raise ValueError(f"uncompressed entry has unequal byte counts: {name}")
            start = file_offset + header_bytes
            blocks = [(start, start + compressed_bytes)]
        if sum(end - start for start, end in blocks) != compressed_bytes:
            raise ValueError(f"compressed block sizes disagree with entry size: {name}")
        expected_start = file_offset + header_bytes
        for start, end in blocks:
            if not (expected_start <= start <= end <= index_offset):
                raise ValueError(f"compressed block bounds are invalid: {name}")
            expected_start = end

        compressed = b"".join(data[start:end] for start, end in blocks)
        if hashlib.sha1(compressed).digest() != declared_sha1:
            raise ValueError(f"compressed payload SHA-1 does not match: {name}")
        try:
            decoded = compressed if compression == 0 else b"".join(zlib.decompress(data[start:end]) for start, end in blocks)
        except zlib.error as exc:
            raise ValueError(f"Zlib decode failed for {name}: {exc}") from exc
        if len(decoded) != decoded_bytes:
            raise ValueError(f"decoded byte count does not match PAK index: {name}")
        total_decoded_bytes += len(decoded)
        if total_decoded_bytes > MAX_TOTAL_BYTES:
            raise ValueError("decoded payload total exceeds the safety limit")

        destination = output.joinpath(*relative.parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(decoded)
        entries.append({
            "relativePath": str(relative),
            "bytes": len(decoded),
            "sha256": sha256(decoded),
            "pakPayloadSha1": declared_sha1.hex(),
            "pakPayloadSha1Valid": True,
            "compressionMethod": "none" if compression == 0 else "zlib",
            "compressionBlockCount": len(blocks),
            "compressionBlockSize": block_size,
            "entryHeaderMatchesIndex": True,
        })

    if cursor != len(index):
        raise ValueError("PAK index has unparsed bytes")
    manifest = {
        "sourcePath": str(pak),
        "sourceSha256": sha256(data),
        "pakVersion": version,
        "indexSha1Valid": True,
        "indexFooterPaddingBytes": len(padding),
        "mountPoint": mount_point,
        "mountPointTraversalNotUsed": True,
        "entryCount": entry_count,
        "extensionCounts": dict(collections.Counter(Path(str(row["relativePath"])).suffix.lower() for row in entries)),
        "totalDecodedBytes": total_decoded_bytes,
        "entries": entries,
    }
    manifest_path = output.with_suffix(".manifest.json")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in manifest.items() if key != "entries"}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, UnicodeError, ValueError, struct.error) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
