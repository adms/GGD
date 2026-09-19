#!/usr/bin/env python3
"""Decrypt preserved Dragon Quest Dai: A Hero's Bonds Aladin blobs.

This is a read-only source workflow: the input cache and APK are never changed.
The implementation mirrors the game's ``ChaCha20BurstCryptProvider`` and
``Acpb`` IL2CPP code.  It intentionally derives the runtime key from the ALDC
catalog instead of embedding a title key in generated output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import zipfile
from pathlib import Path


ALADIN_SIGMA = b"A3AxwtfWD<PbxMx$"
ALADIN_TURNS = bytes.fromhex("06050605050605060606050505060605")
NONCE_FILL = 0x63686368
MAGICS = (
    (b"UnityFS\x00", "unityfs"),
    (b"UnityRaw", "unity-raw"),
    (b"UnityWeb", "unity-web"),
    (b"@UTF", "cri-acb"),
    (b"AFS2", "cri-awb"),
    (b"RIFF", "riff"),
    (b"OggS", "ogg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
)


class BoundsError(ValueError):
    pass


def _unpack(fmt: str, data: bytes, offset: int) -> tuple[int, ...]:
    size = struct.calcsize(fmt)
    if offset < 0 or offset + size > len(data):
        raise BoundsError(f"read outside buffer at {offset} (+{size}, size={len(data)})")
    return struct.unpack_from(fmt, data, offset)


def _field_address(data: bytes, table: int, field: int) -> int:
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


def parse_aldc_groups(catalog: bytes) -> dict[str, bytes]:
    """Return ``CryptKeyIdHash -> 32-byte RuntimeCryptKey body``."""
    if len(catalog) < 32 or catalog[4:8] != b"ALDC":
        raise ValueError("not an ALDC catalog")
    (root,) = _unpack("<I", catalog, 0)
    tables, count = _vector(catalog, _field_address(catalog, root, 1))
    result: dict[str, bytes] = {}
    for index in range(count):
        entry = tables + index * 4
        (relative,) = _unpack("<I", catalog, entry)
        table = entry + relative
        (group_hash,) = _unpack("<Q", catalog, _field_address(catalog, table, 0))
        payload, payload_bytes = _vector(catalog, _field_address(catalog, table, 1))
        body = catalog[payload:payload + payload_bytes]
        if len(body) != 32:
            raise ValueError(f"ALDC group {group_hash:016x} has {len(body)} key bytes, expected 32")
        result[f"{group_hash:016x}"] = body
    return result


def _rol32(value: int, bits: int) -> int:
    return ((value << bits) | (value >> (32 - bits))) & 0xFFFFFFFF


def _quarter_round(state: list[int], a: int, b: int, c: int, d: int) -> None:
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF
    state[d] = _rol32(state[d] ^ state[a], 16)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF
    state[b] = _rol32(state[b] ^ state[c], 12)
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF
    state[d] = _rol32(state[d] ^ state[a], 8)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF
    state[b] = _rol32(state[b] ^ state[c], 7)


def _turn_index(key: bytes, nonce: bytes) -> int:
    key_words = struct.unpack("<8I", key)
    nonce_words = struct.unpack("<3I", nonce)
    value = (
        ((key_words[5] + key_words[0]) & 0xFFFFFFFF) ^ key_words[7]
    ) + (
        ((nonce_words[1] + nonce_words[0]) & 0xFFFFFFFF) ^ nonce_words[2]
    )
    value &= 0xFFFFFFFF
    return ((value >> 2) & 1) | ((value >> 7) & 2) | ((value >> 13) & 4) | ((value >> 2) & 8)


def acpb_parameters(key: bytes, path_hash: str) -> tuple[bytes, int, int]:
    if len(key) != 32:
        raise ValueError("Acpb requires a 32-byte key")
    nonce = struct.pack("<Q", int(path_hash, 16)) + struct.pack("<I", NONCE_FILL)
    turn_index = _turn_index(key, nonce)
    return nonce, turn_index, ALADIN_TURNS[turn_index]


def acpb_block(key: bytes, nonce: bytes, counter: int, turns: int) -> bytes:
    initial = list(
        struct.unpack("<4I", ALADIN_SIGMA)
        + struct.unpack("<8I", key)
        + (counter & 0xFFFFFFFF,)
        + struct.unpack("<3I", nonce)
    )
    state = initial.copy()
    for _ in range(turns):
        _quarter_round(state, 0, 4, 8, 12)
        _quarter_round(state, 1, 5, 9, 13)
        _quarter_round(state, 2, 6, 10, 14)
        _quarter_round(state, 3, 7, 11, 15)
        _quarter_round(state, 0, 5, 10, 15)
        _quarter_round(state, 1, 6, 11, 12)
        _quarter_round(state, 2, 7, 8, 13)
        _quarter_round(state, 3, 4, 9, 14)
    return struct.pack("<16I", *((left + right) & 0xFFFFFFFF for left, right in zip(state, initial)))


def decrypt_bytes(data: bytes, key: bytes, path_hash: str, *, stream_offset: int = 0) -> tuple[bytes, int, int]:
    """Decrypt a byte range using Aladin's random-access ChaCha stream.

    Full-file conversion uses ``stream_offset=0``.  The offset support documents
    the game's 32 KiB sector wrapper while preserving the equivalent continuous
    64-byte counter sequence.
    """
    nonce, turn_index, turns = acpb_parameters(key, path_hash)
    output = bytearray(len(data))
    cursor = 0
    while cursor < len(data):
        absolute = stream_offset + cursor
        block_number, inner = divmod(absolute, 64)
        keystream = acpb_block(key, nonce, block_number + 1, turns)
        length = min(64 - inner, len(data) - cursor)
        for index in range(length):
            output[cursor + index] = data[cursor + index] ^ keystream[inner + index]
        cursor += length
    return bytes(output), turn_index, turns


def detect_magic(data: bytes) -> str | None:
    return next((name for magic, name in MAGICS if data.startswith(magic)), None)


def decrypt_manifest(manifest: dict, groups: dict[str, bytes], output_dir: Path) -> dict:
    files = []
    output_dir.mkdir(parents=True, exist_ok=True)
    for row in manifest["files"]:
        if row.get("containerStatus") != "dena-aladin-encrypted-blob":
            continue
        key = groups.get(row["groupHash"])
        if key is None:
            raise KeyError(f"ALDC has no key for groupHash {row['groupHash']}")
        source = Path(row["extractedAbsolutePath"])
        encrypted = source.read_bytes()
        decrypted, turn_index, turns = decrypt_bytes(encrypted, key, row["pathHash"])
        magic = detect_magic(decrypted)
        suffix = ".unityfs" if magic == "unityfs" else ".bin"
        destination = output_dir / row["blobId"][:2] / f"{row['blobId']}{suffix}"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(decrypted)
        files.append({
            "logicalPath": row["logicalPath"],
            "pathHash": row["pathHash"],
            "blobId": row["blobId"],
            "groupHash": row["groupHash"],
            "bytes": len(decrypted),
            "inputAbsolutePath": str(source.resolve()),
            "inputSha256": hashlib.sha256(encrypted).hexdigest(),
            "outputAbsolutePath": str(destination.resolve()),
            "outputSha256": hashlib.sha256(decrypted).hexdigest(),
            "container": magic or "unknown-decrypted-container",
            "header16Hex": decrypted[:16].hex(),
            "acpbTurnIndex": turn_index,
            "acpbTurns": turns,
        })
    counts: dict[str, int] = {}
    for row in files:
        counts[row["container"]] = counts.get(row["container"], 0) + 1
    return {
        "schema": "ggd.heros-bonds-aladin-decryption@1",
        "algorithm": {
            "provider": "Aladin.Core.Crypto.ChaCha20BurstCryptProvider",
            "cipher": "Acpb custom-sigma reduced-round ChaCha20",
            "sigmaAscii": ALADIN_SIGMA.decode("ascii"),
            "nonce": "little-endian ALI2 pathHash + little-endian 0x63686368",
            "initialCounter": 1,
            "sectorBytes": 32768,
            "turnTableHex": ALADIN_TURNS.hex(),
        },
        "sourceManifest": str(Path(manifest.get("manifestPath", "")).resolve()) if manifest.get("manifestPath") else None,
        "decryptedFileCount": len(files),
        "containerCounts": dict(sorted(counts.items())),
        "allRecognized": all(row["container"] != "unknown-decrypted-container" for row in files),
        "files": files,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--base-apk", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text())
    manifest["manifestPath"] = str(args.manifest.resolve())
    with zipfile.ZipFile(args.base_apk) as archive:
        catalog = archive.read("assets/files/catalog")
    groups = parse_aldc_groups(catalog)
    result = decrypt_manifest(manifest, groups, args.output_dir)
    result["source"] = {
        "baseApk": str(args.base_apk.resolve()),
        "baseApkSha256": hashlib.sha256(args.base_apk.read_bytes()).hexdigest(),
        "catalogSha256": hashlib.sha256(catalog).hexdigest(),
        "aladinKeyGroupCount": len(groups),
        "keyGroups": {
            group: {"keyBytes": len(body), "keySha256": hashlib.sha256(body).hexdigest()}
            for group, body in sorted(groups.items())
        },
    }
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "decryptedFileCount": result["decryptedFileCount"],
        "containerCounts": result["containerCounts"],
        "allRecognized": result["allRecognized"],
        "receipt": str(args.receipt.resolve()),
    }, ensure_ascii=False))
    return 0 if result["allRecognized"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
