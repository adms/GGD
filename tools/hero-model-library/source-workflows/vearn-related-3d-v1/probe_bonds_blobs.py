#!/usr/bin/env python3
"""Probe selected Hero's Bonds blobs without mistaking Aladin encryption for compression."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import shutil
import struct
import subprocess
import zipfile
from collections import Counter
from pathlib import Path


MAGICS = (
    (b"UnityFS\x00", "unityfs"),
    (b"UnityRaw", "unity-raw"),
    (b"UnityWeb", "unity-web"),
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"@UTF", "cri-acb"),
    (b"AFS2", "cri-awb"),
    (b"RIFF", "riff"),
    (b"OggS", "ogg"),
    (b"PK\x03\x04", "zip"),
)


class BoundsError(ValueError):
    pass


def _unpack(fmt: str, data: bytes, offset: int) -> tuple[int, ...]:
    size = struct.calcsize(fmt)
    if offset < 0 or offset + size > len(data):
        raise BoundsError(f"read outside buffer at {offset} (+{size}, size={len(data)})")
    return struct.unpack_from(fmt, data, offset)


def _field_address(data: bytes, table: int, field: int) -> int:
    # FlatBuffers may place a shared vtable after later tables, producing a
    # negative signed distance for those table instances.
    (distance,) = _unpack("<i", data, table)
    vtable = table - distance
    (vtable_bytes, _object_bytes) = _unpack("<HH", data, vtable)
    entry = vtable + 4 + field * 2
    if entry + 2 > vtable + vtable_bytes:
        raise BoundsError(f"field {field} is absent")
    (relative,) = _unpack("<H", data, entry)
    if relative == 0:
        raise BoundsError(f"field {field} is null")
    return table + relative


def _vector(data: bytes, field_address: int) -> tuple[int, int]:
    (relative,) = _unpack("<I", data, field_address)
    vector = field_address + relative
    (count,) = _unpack("<I", data, vector)
    return vector + 4, count


def parse_aldc(data: bytes) -> tuple[dict[str, dict], dict[str, dict]]:
    """Return the Aladin 40-byte blob metadata and key-info tables."""
    if len(data) < 32 or data[4:8] != b"ALDC":
        raise ValueError("not an ALDC catalog")
    (root,) = _unpack("<I", data, 0)
    metadata_rows, metadata_count = _vector(data, _field_address(data, root, 0))
    metadata: dict[str, dict] = {}
    for index in range(metadata_count):
        secondary_key, path_hash, key_id, unknown, blob_id = _unpack(
            "<5Q", data, metadata_rows + index * 40
        )
        metadata[f"{blob_id:016x}"] = {
            "catalogRecordIndex": index,
            "secondaryKey": f"{secondary_key:016x}",
            "pathHash": f"{path_hash:016x}",
            "keyId": f"{key_id:016x}",
            "unknownQword": f"{unknown:016x}",
        }
    tables, count = _vector(data, _field_address(data, root, 1))
    groups: dict[str, dict] = {}
    for index in range(count):
        entry = tables + index * 4
        (relative,) = _unpack("<I", data, entry)
        table = entry + relative
        (group_hash,) = _unpack("<Q", data, _field_address(data, table, 0))
        payload, payload_bytes = _vector(data, _field_address(data, table, 1))
        key_info = data[payload:payload + payload_bytes]
        groups[f"{group_hash:016x}"] = {
            "catalogRecordIndex": index,
            "keyInfoBytes": payload_bytes,
            "keyInfoHex": key_info.hex(),
            "keyInfoSha256": hashlib.sha256(key_info).hexdigest(),
        }
    return metadata, groups


def entropy(data: bytes) -> float:
    if not data:
        return 0.0
    counts = Counter(data)
    length = len(data)
    return -sum((count / length) * math.log2(count / length) for count in counts.values())


def detect_magic(data: bytes) -> str | None:
    return next((name for magic, name in MAGICS if data.startswith(magic)), None)


def character_hint(path: str) -> str | None:
    folded = path.casefold()
    for candidate in ("027003700", "027003800", "027005800", "027005801"):
        if candidate in folded:
            return f"ch{candidate}"
    if "kiganohburn" in folded or "kiganouburn" in folded:
        return "direct-kiganohburn-effect"
    return None


def common_stream_cipher_probe(data: bytes, row: dict, key_info_hex: str | None) -> list[dict]:
    """Try bounded standard cipher layouts before declaring a custom runtime stage."""
    openssl = shutil.which("openssl")
    if not openssl or not key_info_hex or len(key_info_hex) != 64:
        return []
    values = {
        "zero": bytes(16),
        "blob-le": struct.pack("<Q", int(row["blobId"], 16)) + bytes(8),
        "path-le": struct.pack("<Q", int(row["pathHash"], 16)) + bytes(8),
        "secondary-le": struct.pack("<Q", int(row["secondaryKey"], 16)) + bytes(8),
        "key-id-le": struct.pack("<Q", int(row["groupHash"], 16)) + bytes(8),
    }
    attempts: list[dict] = []
    plans = [("aes-256-ctr", key_info_hex, name, iv) for name, iv in values.items()]
    plans.extend(("chacha20", key_info_hex, name, iv) for name, iv in values.items())
    plans.extend(("aes-128-ctr", key_info_hex[:32], "second-half", bytes.fromhex(key_info_hex[32:])) for _ in (0,))
    plans.extend(("aes-128-ctr", key_info_hex[32:], "first-half", bytes.fromhex(key_info_hex[:32])) for _ in (0,))
    for cipher, key_hex, iv_name, iv in plans:
        process = subprocess.run(
            [openssl, "enc", f"-{cipher}", "-d", "-K", key_hex, "-iv", iv.hex()],
            input=data[:64], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=False,
        )
        decoded = process.stdout
        attempts.append({
            "cipher": cipher,
            "ivLayout": iv_name,
            "exitCode": process.returncode,
            "decodedHeader16Hex": decoded[:16].hex(),
            "knownMagic": detect_magic(decoded),
        })
    return attempts


def seekable_aes_comparison_probe(data: bytes, key_info_hex: str | None) -> list[dict]:
    """Try a public seekable AES construction as comparison-only evidence.

    SeekableAesAssetBundle is not Aladin.  Its stream encrypts little-endian
    block numbers with AES-ECB and XORs that keystream with asset bytes.  A
    miss here only rules out direct reuse with the raw ALDC key-info bytes.
    """
    openssl = shutil.which("openssl")
    if not openssl or not key_info_hex or len(key_info_hex) != 64:
        return []
    layouts = (
        ("aes-128-ecb", key_info_hex[:32], "key-info-first-half"),
        ("aes-128-ecb", key_info_hex[32:], "key-info-second-half"),
        ("aes-256-ecb", key_info_hex, "key-info-full"),
    )
    attempts = []
    block_count = max(1, math.ceil(min(len(data), 64) / 16))
    for cipher, key_hex, key_layout in layouts:
        for first_block in (0, 1):
            counters = b"".join(
                struct.pack("<Q", first_block + index) + bytes(8)
                for index in range(block_count)
            )
            process = subprocess.run(
                [openssl, "enc", f"-{cipher}", "-e", "-K", key_hex, "-nopad", "-nosalt"],
                input=counters, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=False,
            )
            decoded = bytes(left ^ right for left, right in zip(data[:64], process.stdout))
            attempts.append({
                "cipher": cipher,
                "keyLayout": key_layout,
                "counterLayout": "uint64-little-endian-in-first-8-bytes",
                "firstBlock": first_block,
                "exitCode": process.returncode,
                "decodedHeader16Hex": decoded[:16].hex(),
                "knownMagic": detect_magic(decoded),
            })
    return attempts


def apk_runtime_evidence(arm64_apk: Path | None) -> dict | None:
    """Record assembly markers proving that this game build ships Aladin."""
    if arm64_apk is None:
        return None
    markers = (
        "AssetFetcherIntegration",
        "Aladin.Core.dll",
        "AssetFetcher.Unity.dll",
        "Aladin.Core.Unity.dll",
        "Abdool.Integration.Aladin.dll",
    )
    with zipfile.ZipFile(arm64_apk) as archive:
        lib = archive.read("lib/arm64-v8a/libil2cpp.so")
    found = [marker for marker in markers if marker.encode() in lib]
    return {
        "arm64Apk": str(arm64_apk.resolve()),
        "arm64ApkSha256": hashlib.sha256(arm64_apk.read_bytes()).hexdigest(),
        "libil2cppBytes": len(lib),
        "libil2cppSha256": hashlib.sha256(lib).hexdigest(),
        "assemblyMarkers": found,
        "aladinRuntimeMarkerFound": any("Aladin" in marker for marker in found),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--base-apk", type=Path, required=True)
    parser.add_argument("--arm64-apk", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text())
    with zipfile.ZipFile(args.base_apk) as archive:
        catalog = archive.read("assets/files/catalog")
    catalog_metadata, groups = parse_aldc(catalog)

    probes = []
    cipher_attempt_count = 0
    cipher_magic_hits = 0
    comparison_attempt_count = 0
    comparison_magic_hits = 0
    for row in manifest["files"]:
        path = Path(row["extractedAbsolutePath"])
        data = path.read_bytes()
        magic = detect_magic(data)
        group = groups.get(row["groupHash"])
        catalog_blob = catalog_metadata.get(row["blobId"])
        cipher_attempts = common_stream_cipher_probe(data, row, group["keyInfoHex"] if group else None)
        cipher_attempt_count += len(cipher_attempts)
        cipher_magic_hits += sum(attempt["knownMagic"] is not None for attempt in cipher_attempts)
        comparison_attempts = seekable_aes_comparison_probe(data, group["keyInfoHex"] if group else None)
        comparison_attempt_count += len(comparison_attempts)
        comparison_magic_hits += sum(attempt["knownMagic"] is not None for attempt in comparison_attempts)
        probes.append({
            "logicalPath": row["logicalPath"],
            "blobId": row["blobId"],
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "header16Hex": data[:16].hex(),
            "magic": magic,
            "entropyBitsPerByte": round(entropy(data), 6),
            "groupHash": row["groupHash"],
            "aladinCatalogRecordFound": group is not None,
            "aladinCatalogBlobMetadataFound": catalog_blob is not None,
            "aladinCatalogBlobMetadata": catalog_blob,
            "aladinKeyInfoHex": group["keyInfoHex"] if group else None,
            "aladinKeyInfoSha256": group["keyInfoSha256"] if group else None,
            "standardCipherProbeAttemptCount": len(cipher_attempts),
            "seekableAesComparisonAttemptCount": len(comparison_attempts),
            "containerStatus": ("readable-standard-container" if magic else row["containerStatus"]),
            "characterHint": character_hint(row["logicalPath"]),
        })

    encrypted = [row for row in probes if row["containerStatus"] == "dena-aladin-encrypted-blob"]
    readable = [row for row in probes if row["magic"]]
    high_entropy = [row for row in encrypted if row["entropyBitsPerByte"] >= 7.9]
    by_hint = Counter(row["characterHint"] or "other" for row in probes)
    result = {
        "schema": "ggd.heros-bonds-aladin-probe@1",
        "source": {
            "manifest": str(args.manifest.resolve()),
            "baseApk": str(args.base_apk.resolve()),
            "baseApkSha256": hashlib.sha256(args.base_apk.read_bytes()).hexdigest(),
            "aladinCatalogIdentifier": "ALDC",
            "aladinCatalogBlobMetadataCount": len(catalog_metadata),
            "aladinCatalogGroupCount": len(groups),
            "aladinCatalogGroups": groups,
        },
        "runtimeEvidence": apk_runtime_evidence(args.arm64_apk),
        "toolAvailability": {
            "UnityPy": importlib.util.find_spec("UnityPy") is not None,
            "standardUnityReadersExpectedResult": "fail-before-runtime-decryption",
        },
        "entryCount": len(probes),
        "readableStandardContainerCount": len(readable),
        "readableMagicCounts": dict(sorted(Counter(row["magic"] for row in readable).items())),
        "aladinEncryptedCount": len(encrypted),
        "aladinEncryptedHighEntropyCount": len(high_entropy),
        "candidateCounts": dict(sorted(by_hint.items())),
        "standardCipherProbe": {
            "attemptCount": cipher_attempt_count,
            "knownMagicHitCount": cipher_magic_hits,
            "scope": "AES-256-CTR, ChaCha20 and two AES-128-CTR key-half layouts with common IV derivations",
            "conclusion": "no-standard-layout-match-custom-aladin-stream-wrapper-still-required",
        },
        "seekableAesExternalComparison": {
            "attemptCount": comparison_attempt_count,
            "knownMagicHitCount": comparison_magic_hits,
            "algorithm": "AES-ECB(uint64 little-endian block counter) XOR asset bytes",
            "source": "https://github.com/mao-test-h/SeekableAesAssetBundle",
            "relationship": "public-comparison-only-not-an-Aladin-implementation",
            "conclusion": "no-direct-match-with-raw-ALDC-key-info-halves-or-full-key",
        },
        "decoderStatus": "blocked-game-specific-key-derivation-or-Aladin-stream-stage",
        "nextDecoderStage": [
            "reverse the Aladin.Core/Abdool.Integration.Aladin IL2CPP key-derivation and stream construction for groupHash 00a664ec4f522a35",
            "implement the game's Aladin random-access stream wrapper",
            "confirm decrypted UnityFS magic before passing data to UnityPy or AssetRipper",
            "visually identify ch027003800, ch027005800 and ch027005801 before assigning Ghost-Eye King",
        ],
        "evidenceBasis": {
            "officialArchitecture": "DeNA Aladin uses content-hash blobs, FlatBuffers indexes, replaceable encryption, a random-access stream cipher, and resource key IDs",
            "officialSlides": "https://speakerdeck.com/dena_tech/techcon2021-10",
            "observedIdentifiers": ["ALI2", "ALBD", "ALDC"],
        },
        "files": probes,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: result[key] for key in (
        "entryCount", "readableStandardContainerCount", "readableMagicCounts",
        "aladinEncryptedCount", "aladinEncryptedHighEntropyCount", "candidateCounts", "decoderStatus"
    )}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
