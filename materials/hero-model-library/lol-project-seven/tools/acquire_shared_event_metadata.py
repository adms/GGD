#!/usr/bin/env python3
"""Sparsely extract exact skin BIN metadata from official Riot shared WADs.

The RMAN manifest is already local.  Only patch chunks intersecting the WAD
header/table and requested entries are fetched.  Every downloaded chunk and
extracted entry is hashed and receipted.  This tool deliberately records a
partial acquisition; it does not claim that the complete shared WAD exists.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit


WAD_V34_HEADER_BYTES = 272
WAD_V34_ENTRY_BYTES = 32


def sha256_bytes(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


@dataclass(frozen=True)
class ChunkRef:
    chunk_id: int
    bundle_id: int
    bundle_offset: int
    compressed_size: int
    target_size: int
    wad_offset: int

    @property
    def wad_end(self) -> int:
        return self.wad_offset + self.target_size


@dataclass(frozen=True)
class WadEntry:
    path_hash: int
    offset: int
    compressed_size: int
    size: int
    compression_type: int
    first_subchunk_index: int
    subchunk_count: int
    checksum: int


def manifest_chunks(patcher_file) -> list[ChunkRef]:
    rows = []
    wad_offset = 0
    for chunk in patcher_file.chunks:
        rows.append(ChunkRef(
            chunk_id=chunk.chunk_id,
            bundle_id=chunk.bundle.bundle_id,
            bundle_offset=chunk.offset,
            compressed_size=chunk.size,
            target_size=chunk.target_size,
            wad_offset=wad_offset,
        ))
        wad_offset += chunk.target_size
    if wad_offset != patcher_file.size:
        raise ValueError("Manifest chunk target sizes do not equal WAD size")
    return rows


def chunks_covering(rows: list[ChunkRef], start: int, end: int) -> list[ChunkRef]:
    if start < 0 or end <= start:
        raise ValueError("Invalid requested WAD byte range")
    selected = [row for row in rows if row.wad_offset < end and row.wad_end > start]
    if not selected or selected[0].wad_offset > start or selected[-1].wad_end < end:
        raise ValueError("Manifest chunks do not cover requested WAD byte range")
    return selected


def parse_wad_v34_toc(prefix: bytes) -> list[WadEntry]:
    if len(prefix) < WAD_V34_HEADER_BYTES or prefix[:2] != b"RW":
        raise ValueError("Invalid or incomplete WAD header")
    major, minor = prefix[2], prefix[3]
    if (major, minor) != (3, 4):
        raise ValueError(f"Expected WAD 3.4, got {major}.{minor}")
    count, = struct.unpack_from("<I", prefix, 268)
    required = WAD_V34_HEADER_BYTES + count * WAD_V34_ENTRY_BYTES
    if count > 1_000_000 or len(prefix) < required:
        raise ValueError(f"Incomplete or unreasonable WAD table: count={count}, required={required}")
    entries = []
    for index in range(count):
        fields = struct.unpack_from("<QIIIBBHQ", prefix, WAD_V34_HEADER_BYTES + index * WAD_V34_ENTRY_BYTES)
        path_hash, offset, compressed_size, size, kind, sub_hi, sub_lo, checksum = fields
        entries.append(WadEntry(
            path_hash=path_hash,
            offset=offset,
            compressed_size=compressed_size,
            size=size,
            compression_type=kind & 0xF,
            subchunk_count=(kind & 0xF0) >> 4,
            first_subchunk_index=sub_lo + (sub_hi << 16),
            checksum=checksum,
        ))
    return entries


def load_control(path: Path, names: list[str]) -> tuple[dict, dict[str, dict]]:
    control = json.loads(path.read_text())
    if control.get("schema") != "ggd.lol-shared-event-metadata-scope@1":
        raise ValueError("Unexpected shared event metadata control schema")
    if not control.get("enabled") or control.get("scope") != "project-seven-only":
        raise ValueError("Project-seven event metadata scope is disabled")
    if control.get("fullRosterEnabled") is not False:
        raise ValueError("Full-roster acquisition must remain disabled")
    allowed = set(control.get("allowedFetchNames", []))
    if not names or not set(names) <= allowed:
        raise ValueError("Unlisted shared WAD acquisition refused")
    characters = {row["nativeId"]: row for row in control.get("characters", [])}
    if set(characters) != allowed or any(name not in characters for name in names):
        raise ValueError("Control character rows and allowlist differ")
    return control, characters


class ChunkStore:
    def __init__(self, root: Path, cdn_base: str):
        self.root = root
        self.cdn_base = cdn_base
        self.chunk_root = root / "original-shared-event-chunks"
        self.receipt_root = root / "receipts" / "shared-event-metadata" / "chunks"
        self.chunk_root.mkdir(parents=True, exist_ok=True)
        self.receipt_root.mkdir(parents=True, exist_ok=True)

    def paths(self, row: ChunkRef) -> tuple[Path, Path]:
        chunk = self.chunk_root / f"{row.bundle_id:016X}" / f"{row.chunk_id:016X}.zstd"
        receipt = self.receipt_root / f"{row.chunk_id:016X}.json"
        return chunk, receipt

    def get(self, row: ChunkRef) -> tuple[bytes, dict]:
        import pyzstd

        chunk, receipt = self.paths(row)
        if chunk.is_file() and receipt.is_file():
            saved = json.loads(receipt.read_text())
            blob = chunk.read_bytes()
            if (saved.get("verified") is True and len(blob) == row.compressed_size
                    and sha256_bytes(blob) == saved.get("sha256")):
                decoded = pyzstd.decompress(blob)
                if len(decoded) != row.target_size:
                    raise ValueError("Saved chunk target size changed")
                return decoded, saved
        chunk.parent.mkdir(parents=True, exist_ok=True)
        attempt = 1
        while chunk.with_suffix(f".attempt{attempt}.partial").exists():
            attempt += 1
        partial = chunk.with_suffix(f".attempt{attempt}.partial")
        headers = chunk.with_suffix(f".attempt{attempt}.headers.txt")
        url = self.cdn_base + f"{row.bundle_id:016X}.bundle"
        start, end = row.bundle_offset, row.bundle_offset + row.compressed_size - 1
        result = subprocess.run([
            "curl", "--fail", "--location", "--range", f"{start}-{end}",
            "--max-time", "120", "--max-filesize", str(row.compressed_size + 1),
            "--silent", "--show-error", "--dump-header", str(headers),
            "--output", str(partial), url,
        ], capture_output=True, text=True)
        evidence = {
            "schema": "ggd-riot-shared-event-chunk@1",
            "chunkId": f"{row.chunk_id:016X}",
            "bundleId": f"{row.bundle_id:016X}",
            "sourceUrl": url,
            "requestedRange": [start, end],
            "compressedBytes": row.compressed_size,
            "targetBytes": row.target_size,
            "attempt": attempt,
            "exitCode": result.returncode,
            "error": result.stderr,
            "verified": False,
        }
        try:
            if result.returncode != 0:
                raise ValueError(result.stderr.strip() or f"curl exited {result.returncode}")
            ranges = re.findall(r"content-range:\s*bytes (\d+)-(\d+)/(\d+)", headers.read_text(), re.I)
            if not ranges or tuple(map(int, ranges[-1][:2])) != (start, end):
                raise ValueError("HTTP Content-Range does not match requested bytes")
            blob = partial.read_bytes()
            if len(blob) != row.compressed_size:
                raise ValueError("Downloaded chunk size differs from manifest")
            decoded = pyzstd.decompress(blob)
            if len(decoded) != row.target_size:
                raise ValueError("Decompressed chunk size differs from manifest")
            if chunk.exists():
                raise ValueError("Refusing to overwrite an existing shared chunk")
            partial.rename(chunk)
            evidence.update(
                path=str(chunk),
                sha256=sha256_bytes(blob),
                decompressedSha256=sha256_bytes(decoded),
                normalHttpRangeVerified=True,
                zstdAndTargetSizeVerified=True,
                verified=True,
            )
            receipt.write_text(json.dumps(evidence, indent=2) + "\n")
            return decoded, evidence
        except Exception as exc:
            evidence["validationError"] = str(exc)
            receipt.write_text(json.dumps(evidence, indent=2) + "\n")
            raise


def materialize_range(store: ChunkStore, rows: list[ChunkRef], start: int, end: int) -> tuple[bytes, list[dict]]:
    output = bytearray()
    receipts = []
    for row in chunks_covering(rows, start, end):
        decoded, receipt = store.get(row)
        left = max(start, row.wad_offset) - row.wad_offset
        right = min(end, row.wad_end) - row.wad_offset
        output.extend(decoded[left:right])
        receipts.append(receipt)
    if len(output) != end - start:
        raise ValueError("Materialized WAD range has the wrong length")
    return bytes(output), receipts


def decode_entry(entry: WadEntry, stored: bytes) -> bytes:
    import pyzstd

    if len(stored) != entry.compressed_size:
        raise ValueError("Stored WAD entry size differs from table")
    if entry.compression_type == 0:
        decoded = stored
    elif entry.compression_type == 1:
        decoded = gzip.decompress(stored)
    elif entry.compression_type == 3:
        decoded = pyzstd.decompress(stored)
    elif entry.compression_type == 4:
        raise ValueError("Subchunked WAD entry requires the .subchunktoc entry")
    else:
        raise ValueError(f"Unsupported WAD entry compression type {entry.compression_type}")
    if len(decoded) != entry.size:
        raise ValueError("Decoded WAD entry size differs from table")
    return decoded


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--control", required=True, type=Path)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--names", nargs="+", required=True)
    parser.add_argument("--batch-id", required=True)
    args = parser.parse_args()

    from cdtb.patcher import PatcherManifest
    import importlib.metadata
    import xxhash

    control, characters = load_control(args.control, args.names)
    root = args.source_root.resolve()
    manifest_path = root / "sources" / f"{control['releaseId']}.manifest"
    if sha256_file(manifest_path) != control["manifestSha256"]:
        raise ValueError("Pinned Riot manifest SHA-256 differs")
    manifest = PatcherManifest(str(manifest_path))
    source_catalog = json.loads((root / "sources" / "ja_JP-character-wads.json").read_text())
    source_url = source_catalog["sourceUrl"]
    if source_catalog["releaseId"] != control["releaseId"] or source_catalog["manifestSha256"] != control["manifestSha256"]:
        raise ValueError("Saved Riot source catalog differs from control")
    cdn_base = "https://" + urlsplit(source_url).netloc + "/channels/public/bundles/"
    if cdn_base != "https://lol.secure.dyn.riotcdn.net/channels/public/bundles/":
        raise ValueError("Unexpected Riot bundle CDN")
    store = ChunkStore(root, cdn_base)
    output_root = root / "event-metadata"
    receipt_root = root / "receipts" / "shared-event-metadata"
    output_root.mkdir(parents=True, exist_ok=True)
    receipt_root.mkdir(parents=True, exist_ok=True)
    results = []

    for name in args.names:
        package_path = f"DATA/FINAL/Champions/{name}.wad.client"
        patch_file = manifest.files.get(package_path)
        if patch_file is None or patch_file.flags is not None or patch_file.link is not None:
            raise ValueError(f"Exact non-localized shared WAD not found: {package_path}")
        rows = manifest_chunks(patch_file)
        initial, header_receipts = materialize_range(store, rows, 0, WAD_V34_HEADER_BYTES)
        count, = struct.unpack_from("<I", initial, 268)
        table_end = WAD_V34_HEADER_BYTES + count * WAD_V34_ENTRY_BYTES
        prefix, table_receipts = materialize_range(store, rows, 0, table_end)
        entries = {entry.path_hash: entry for entry in parse_wad_v34_toc(prefix)}
        package_results = []
        compressed_request_bytes = sum({r["chunkId"]: r["compressedBytes"] for r in header_receipts + table_receipts}.values())
        for internal_path in characters[name]["skinPaths"]:
            path_hash = xxhash.xxh64_intdigest(internal_path.lower().encode("utf-8"))
            entry = entries.get(path_hash)
            if entry is None:
                raise ValueError(f"Requested path is absent from {package_path}: {internal_path}")
            stored, entry_receipts = materialize_range(store, rows, entry.offset, entry.offset + entry.compressed_size)
            compressed_request_bytes += sum({r["chunkId"]: r["compressedBytes"] for r in entry_receipts}.values())
            if xxhash.xxh3_64_intdigest(stored) != entry.checksum:
                raise ValueError("WAD 3.4 stored-entry xxh3 checksum differs")
            decoded = decode_entry(entry, stored)
            destination = output_root / name / Path(internal_path).name
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists() and destination.read_bytes() != decoded:
                raise ValueError("Refusing to overwrite changed event metadata")
            if not destination.exists():
                destination.write_bytes(decoded)
            package_results.append({
                "internalPath": internal_path,
                "pathHash": f"{path_hash:016x}",
                "wadOffset": entry.offset,
                "storedBytes": entry.compressed_size,
                "decodedBytes": entry.size,
                "compressionType": entry.compression_type,
                "wadStoredXxh3": f"{entry.checksum:016x}",
                "wadStoredChecksumVerified": True,
                "absolutePath": str(destination.resolve()),
                "sha256": sha256_file(destination),
                "sourceChunks": sorted({r["chunkId"] for r in entry_receipts}),
            })
        if compressed_request_bytes > control["maxCompressedRequestBytes"]:
            raise ValueError("Scoped compressed request exceeds control limit")
        results.append({
            "nativeId": name,
            "heroId": characters[name]["heroId"],
            "sourcePackage": package_path,
            "sourcePackageBytes": patch_file.size,
            "sourcePackageCdtbChunkIdentitySha1": patch_file.hexdigest(),
            "sourcePackageCompleteLocally": False,
            "acquisitionStatus": "partial-extraction-from-official-release-chunks",
            "tocEntries": count,
            "tocBytes": table_end,
            "compressedRequestBytesUpperBound": compressed_request_bytes,
            "entries": package_results,
            "gaps": ["Complete non-localized champion WAD has not been reconstructed or archived."],
        })
    receipt = {
        "schema": "ggd-lol-shared-event-metadata-batch@1",
        "batchId": args.batch_id,
        "scope": "project-seven-only",
        "releaseId": control["releaseId"],
        "manifestPath": str(manifest_path),
        "manifestSha256": control["manifestSha256"],
        "sourceUrl": source_url,
        "tool": {
            "name": "CDTB",
            "version": importlib.metadata.version("cdtb"),
            "scriptPath": str(Path(__file__).resolve()),
            "scriptSha256": sha256_file(Path(__file__)),
        },
        "fullRosterEnabled": False,
        "englishLocaleWadsFetched": False,
        "completeSharedWadsAcquired": 0,
        "results": results,
    }
    target = receipt_root / f"{args.batch_id}.json"
    encoded = json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
    if target.exists() and target.read_text() != encoded:
        raise ValueError("Refusing to replace a different frozen batch receipt")
    target.write_text(encoded)
    print(json.dumps({
        "receipt": str(target.resolve()),
        "characters": len(results),
        "entries": sum(len(row["entries"]) for row in results),
        "completeSharedWadsAcquired": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
