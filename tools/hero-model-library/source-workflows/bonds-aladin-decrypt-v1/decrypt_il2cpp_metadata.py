#!/usr/bin/env python3
"""Restore the title's IL2CPP metadata for reproducible static analysis."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


PREFIX_BYTES = 4
XOR_KEY = bytes.fromhex("716797a43b662365")
STANDARD_SANITY = 0xFAB11BAF


def decrypt_metadata(data: bytes) -> bytes:
    if len(data) < 0x104:
        raise ValueError("metadata is too short")
    if struct.unpack_from("<I", data, PREFIX_BYTES)[0] != STANDARD_SANITY:
        raise ValueError("metadata sanity marker not found after the four-byte title prefix")
    result = bytearray(data[PREFIX_BYTES:])
    for index in range(8, len(result)):
        result[index] ^= XOR_KEY[(index - 8) % len(XOR_KEY)]
    if struct.unpack_from("<I", result, 8)[0] != 0x100:
        raise ValueError("decrypted metadata header size is not the expected 0x100")
    return bytes(result)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--receipt", type=Path)
    args = parser.parse_args()
    source = args.input.read_bytes()
    output = decrypt_metadata(source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(output)
    if args.receipt:
        receipt = {
            "schema": "ggd.heros-bonds-il2cpp-metadata-decryption@1",
            "input": str(args.input.resolve()),
            "inputBytes": len(source),
            "inputSha256": hashlib.sha256(source).hexdigest(),
            "output": str(args.output.resolve()),
            "outputBytes": len(output),
            "outputSha256": hashlib.sha256(output).hexdigest(),
            "metadataVersion": struct.unpack_from("<I", output, 4)[0],
            "headerBytes": struct.unpack_from("<I", output, 8)[0],
        }
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
