#!/usr/bin/env python3
"""Dump J-Stars guest memory through RPCS3's read-only PINE IPC API.

The dumper never writes guest memory.  It accepts only the verified BLUS31519
title and carves table-valid STPK containers from the captured byte ranges.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
import struct
import sys
from pathlib import Path
from typing import Any, Iterable


TITLE_ID = "BLUS31519"
OP_READ8 = 0
OP_READ64 = 3
OP_VERSION = 8
OP_TITLE = 0x0B
OP_TITLE_ID = 0x0C
OP_GAME_VERSION = 0x0E
OP_STATUS = 0x0F
IPC_OK = 0
MAX_WORDS = 40_000
DEFAULT_RANGES = ((0x00010000, 0x10000000),)
PRIORITY_CHARACTERS = {
    "017": "gon",
    "041": "nube",
    "037": "luckyman",
    "012": "hiei",
}


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_range(value: str) -> tuple[int, int]:
    try:
        start_text, end_text = value.split(":", 1)
        start, end = int(start_text, 0), int(end_text, 0)
    except (ValueError, TypeError) as error:
        raise argparse.ArgumentTypeError("range must be START:END, for example 0x10000:0x10000000") from error
    if start < 0 or end > 0x1_0000_0000 or start >= end or start % 8 or end % 8:
        raise argparse.ArgumentTypeError("range bounds must be ordered, 8-byte aligned 32-bit guest addresses")
    return start, end


def default_socket() -> Path:
    runtime = os.environ.get("TMPDIR") or "/tmp"
    return Path(runtime) / "rpcs3.sock"


def recv_exact(connection: socket.socket, size: int) -> bytes:
    chunks = []
    remaining = size
    while remaining:
        chunk = connection.recv(remaining)
        if not chunk:
            raise ConnectionError("RPCS3 IPC socket closed before the complete reply arrived")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


class PineClient:
    def __init__(self, socket_path: Path, timeout_seconds: float = 30.0) -> None:
        self.socket_path = socket_path
        self.timeout_seconds = timeout_seconds
        self.connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.connection.settimeout(self.timeout_seconds)
        self.connection.connect(str(self.socket_path))

    def close(self) -> None:
        self.connection.close()

    def request(self, commands: bytes) -> bytes:
        packet = struct.pack("<I", 4 + len(commands)) + commands
        self.connection.sendall(packet)
        size = struct.unpack("<I", recv_exact(self.connection, 4))[0]
        if size < 5 or size > 450_000:
            raise ValueError(f"invalid RPCS3 IPC reply size: {size}")
        body = recv_exact(self.connection, size - 4)
        if body[0] != IPC_OK:
            raise ValueError("RPCS3 IPC rejected the read request; the guest range may be unmapped")
        return body[1:]

    def string(self, opcode: int) -> str:
        body = self.request(bytes((opcode,)))
        if len(body) < 5:
            raise ValueError("truncated RPCS3 IPC string reply")
        length = struct.unpack_from("<I", body, 0)[0]
        raw = body[4:4 + length]
        if len(raw) != length or not raw.endswith(b"\0"):
            raise ValueError("invalid RPCS3 IPC string reply")
        return raw[:-1].decode("utf-8")

    def status(self) -> int:
        body = self.request(bytes((OP_STATUS,)))
        if len(body) != 4:
            raise ValueError("invalid RPCS3 IPC status reply")
        return struct.unpack("<I", body)[0]

    def read_words(self, addresses: list[int]) -> bytes:
        if not addresses or len(addresses) > MAX_WORDS:
            raise ValueError("word read count is outside the safe PINE batch limit")
        commands = b"".join(bytes((OP_READ64,)) + struct.pack("<I", address) for address in addresses)
        body = self.request(commands)
        expected = len(addresses) * 8
        if len(body) != expected:
            raise ValueError(f"RPCS3 IPC returned {len(body)} bytes; expected {expected}")
        # PINE serializes integer values little-endian. RPCS3 reads PS3 guest
        # integers, so repacking each value big-endian reconstructs guest bytes.
        return b"".join(struct.pack(">Q", value) for value in struct.unpack(f"<{len(addresses)}Q", body))

def valid_member_name(raw: bytes) -> str | None:
    value = raw.split(b"\0", 1)[0]
    if not value or any(byte < 0x20 or byte > 0x7E for byte in value):
        return None
    name = value.decode("ascii")
    if "/" in name or "\\" in name or name in {".", ".."}:
        return None
    return name


def inspect_stpk(data: bytes, offset: int) -> dict[str, Any] | None:
    if offset < 0 or offset + 16 > len(data) or data[offset:offset + 4] != b"STPK":
        return None
    version, count, alignment = struct.unpack_from(">III", data, offset + 4)
    if version != 1 or count == 0 or count > 4096:
        return None
    table_end = offset + 16 + count * 48
    if table_end > len(data):
        return None
    rows = []
    container_end = table_end
    for index in range(count):
        cursor = offset + 16 + index * 48
        member_offset, member_size = struct.unpack_from(">II", data, cursor)
        name = valid_member_name(data[cursor + 16:cursor + 48])
        if name is None or member_offset < 16 + count * 48:
            return None
        end = member_offset + member_size
        if end < member_offset or offset + end > len(data):
            return None
        container_end = max(container_end, offset + end)
        rows.append({"index": index, "name": name, "offset": member_offset, "bytes": member_size})
    if alignment and alignment & (alignment - 1) == 0:
        relative = container_end - offset
        relative = (relative + alignment - 1) & ~(alignment - 1)
        container_end = min(offset + relative, len(data))
    return {
        "offset": offset,
        "bytes": container_end - offset,
        "version": version,
        "entryCount": count,
        "alignment": alignment,
        "entries": rows,
    }


def carve_stpk(data: bytes, guest_start: int, destination: Path) -> list[dict[str, Any]]:
    destination.mkdir(parents=True, exist_ok=True)
    outputs = []
    cursor = 0
    while True:
        offset = data.find(b"STPK", cursor)
        if offset < 0:
            break
        info = inspect_stpk(data, offset)
        cursor = offset + 4
        if info is None:
            continue
        payload = data[offset:offset + info["bytes"]]
        digest = hashlib.sha256(payload).hexdigest()
        guest_address = guest_start + offset
        output = destination / f"guest-{guest_address:08x}-{digest[:16]}.stpk"
        if output.exists() and output.read_bytes() != payload:
            raise ValueError(f"refusing to overwrite different STPK capture: {output}")
        output.write_bytes(payload)
        member_root = destination.parent / "stpk-members" / digest
        member_root.mkdir(parents=True, exist_ok=True)
        members = []
        for row in info["entries"]:
            member_payload = payload[row["offset"]:row["offset"] + row["bytes"]]
            member_digest = hashlib.sha256(member_payload).hexdigest()
            member_path = member_root / row["name"]
            if member_path.exists() and member_path.read_bytes() != member_payload:
                raise ValueError(f"refusing to overwrite different STPK member: {member_path}")
            member_path.write_bytes(member_payload)
            members.append({
                "name": row["name"],
                "absolutePath": str(member_path.resolve()),
                "bytes": len(member_payload),
                "sha256": member_digest,
            })
        outputs.append({
            **{key: info[key] for key in ("bytes", "version", "entryCount", "alignment")},
            "guestAddress": f"0x{guest_address:08x}",
            "absolutePath": str(output.resolve()),
            "sha256": digest,
            "memberNames": [row["name"] for row in info["entries"]],
            "splitMembers": members,
        })
    return outputs


def batch_ranges(start: int, end: int, words_per_batch: int) -> Iterable[tuple[int, int]]:
    step = words_per_batch * 8
    cursor = start
    while cursor < end:
        next_cursor = min(cursor + step, end)
        yield cursor, next_cursor
        cursor = next_cursor


def read_resilient(client: PineClient, start: int, end: int, minimum_bytes: int = 4096) -> tuple[bytes, list[dict[str, str]]]:
    addresses = list(range(start, end, 8))
    try:
        return client.read_words(addresses), []
    except ValueError as error:
        if end - start <= minimum_bytes:
            return b"\0" * (end - start), [{
                "start": f"0x{start:08x}",
                "end": f"0x{end:08x}",
                "reason": str(error),
            }]
        midpoint = start + ((end - start) // 16) * 8
        if midpoint <= start or midpoint >= end:
            raise
        left, left_failed = read_resilient(client, start, midpoint, minimum_bytes)
        right, right_failed = read_resilient(client, midpoint, end, minimum_bytes)
        return left + right, left_failed + right_failed


def dump_range(client: PineClient, start: int, end: int, output: Path, words_per_batch: int) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".partial")
    if output.exists() or temporary.exists():
        raise FileExistsError(f"refusing to overwrite existing memory capture: {output}")
    failed = []
    with temporary.open("xb") as stream:
        for batch_start, batch_end in batch_ranges(start, end, words_per_batch):
            payload, batch_failed = read_resilient(client, batch_start, batch_end)
            failed.extend(batch_failed)
            stream.write(payload)
    temporary.rename(output)
    data = output.read_bytes()
    carved = carve_stpk(data, start, output.parent / "stpk")
    return {
        "start": f"0x{start:08x}",
        "end": f"0x{end:08x}",
        "capture": {"absolutePath": str(output.resolve()), "bytes": len(data), "sha256": sha256_path(output)},
        "failedRanges": failed,
        "carvedStpk": carved,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--socket", type=Path, default=default_socket())
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--range", dest="ranges", action="append", type=parse_range)
    parser.add_argument("--words-per-batch", type=int, default=32_768)
    parser.add_argument("--expected-title-id", default=TITLE_ID)
    parser.add_argument("--character-native-id", choices=tuple(PRIORITY_CHARACTERS), help="set only after this exact fighter is fully loaded")
    args = parser.parse_args(argv)
    if not 1 <= args.words_per_batch <= MAX_WORDS:
        parser.error(f"--words-per-batch must be 1..{MAX_WORDS}")
    ranges = args.ranges or list(DEFAULT_RANGES)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    client = PineClient(args.socket.resolve())
    try:
        emulator = {
            "version": client.string(OP_VERSION),
            "title": client.string(OP_TITLE),
            "titleId": client.string(OP_TITLE_ID),
            "gameVersion": client.string(OP_GAME_VERSION),
            "status": client.status(),
        }
        if emulator["titleId"] != args.expected_title_id:
            raise ValueError(f"refusing to dump unexpected RPCS3 title {emulator['titleId']!r}; expected {args.expected_title_id}")
        captures = []
        for index, (start, end) in enumerate(ranges):
            captures.append(dump_range(client, start, end, output / f"range-{index}-{start:08x}-{end:08x}.bin", args.words_per_batch))
    finally:
        client.close()
    receipt = {
        "schema": "ggd.jstars-rpcs3-memory-capture@1",
        "sourceGame": "J-Stars Victory VS+",
        "platform": "PS3 via RPCS3",
        "readOnlyGuestMemory": True,
        "emulator": emulator,
        "socket": str(args.socket.resolve()),
        "characterNativeId": args.character_native_id,
        "characterSlug": PRIORITY_CHARACTERS.get(args.character_native_id),
        "captures": captures,
        "summary": {
            "ranges": len(captures),
            "bytes": sum(row["capture"]["bytes"] for row in captures),
            "failedRanges": sum(len(row["failedRanges"]) for row in captures),
            "carvedStpk": sum(len(row["carvedStpk"]) for row in captures),
        },
        "conversionStatus": "native-memory-captured-stpk-carved-srd-conversion-pending",
        "runtimeRegistered": False,
        "productionDeploymentVerified": False,
    }
    (output / "capture-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
