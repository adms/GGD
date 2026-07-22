"""MPQ reader for Warcraft III .w3x maps — builds on mpyq, adding what it lacks:

- file DECRYPTION (MPQ_FILE_ENCRYPTED / MPQ_FILE_FIX_KEY)
- PKWARE DCL explode (compression byte 0x08 and MPQ_FILE_IMPLODE flag)
- multi-compression masks per StormLib order (bz2 -> pkware -> zlib -> huffman)
- w3x 'HM3W' user-data header slicing (MPQ proper starts at 0x200)

Only depends on mpyq for the archive/hash/block-table parsing + hashing.
"""

from __future__ import annotations

import bz2
import io
import os
import struct
import zlib

import mpyq

from .explode import explode, ExplodeError

MPQ_FILE_IMPLODE = 0x00000100
MPQ_FILE_COMPRESS = 0x00000200
MPQ_FILE_ENCRYPTED = 0x00010000
MPQ_FILE_FIX_KEY = 0x00020000
MPQ_FILE_SINGLE_UNIT = 0x01000000
MPQ_FILE_SECTOR_CRC = 0x04000000
MPQ_FILE_EXISTS = 0x80000000


class W3XArchive:
    def __init__(self, path: str):
        """Open a .w3x (HM3W header) or plain .mpq file."""
        with open(path, "rb") as f:
            magic = f.read(4)
        self._temp_path = None
        if magic == b"HM3W":
            # w3x wrapper: the real MPQ begins at 0x200
            import tempfile

            with open(path, "rb") as f:
                data = f.read()
            fd, tmp = tempfile.mkstemp(suffix=".mpq")
            with os.fdopen(fd, "wb") as out:
                out.write(data[0x200:])
            self._temp_path = tmp
            path = tmp
        self.a = mpyq.MPQArchive(path, listfile=False)
        self.header = self.a.header
        self.sector_size = 512 << self.header["sector_size_shift"]

    def close(self):
        try:
            self.a.file.close()
        finally:
            if self._temp_path:
                os.unlink(self._temp_path)

    # -- hashing / crypto (delegate to mpyq's tables) -------------------------
    def _hash(self, s: str, hash_type: str) -> int:
        return self.a._hash(s, hash_type)

    def _decrypt(self, data: bytes, key: int) -> bytes:
        """MPQ block decryption. Unlike mpyq's version, PRESERVES the trailing
        1-3 bytes that don't fill a DWORD (StormLib leaves them unencrypted)."""
        table = self.a.encryption_table
        seed1 = key & 0xFFFFFFFF
        seed2 = 0xEEEEEEEE
        n = len(data) // 4
        words = struct.unpack("<%dI" % n, data[: n * 4])
        out = bytearray(len(data))
        for i, value in enumerate(words):
            seed2 = (seed2 + table[0x400 + (seed1 & 0xFF)]) & 0xFFFFFFFF
            value = value ^ ((seed1 + seed2) & 0xFFFFFFFF)
            seed1 = (
                ((~seed1 << 0x15) + 0x11111111) | (seed1 >> 0x0B)
            ) & 0xFFFFFFFF
            seed2 = (value + seed2 + (seed2 << 5) + 3) & 0xFFFFFFFF
            struct.pack_into("<I", out, i * 4, value & 0xFFFFFFFF)
        out[n * 4 :] = data[n * 4 :]  # tail bytes stay as-is
        return bytes(out)

    def file_key(self, filename: str, block) -> int:
        base = filename.rsplit("\\", 1)[-1]
        key = self._hash(base, "TABLE")
        if block.flags & MPQ_FILE_FIX_KEY:
            key = ((key + block.archive_offset) & 0xFFFFFFFF) ^ (
                block.size & 0xFFFFFFFF
            )
        return key & 0xFFFFFFFF

    # -- lookup ---------------------------------------------------------------
    def get_block(self, filename: str):
        entry = self.a.get_hash_table_entry(filename)
        if entry is None:
            return None
        if entry.block_table_index >= len(self.a.block_table):
            return None
        return self.a.block_table[entry.block_table_index]

    def has_file(self, filename: str) -> bool:
        return self.get_block(filename) is not None

    # -- sector decompression -------------------------------------------------
    def _decompress_sector(self, raw: bytes, expected: int) -> bytes:
        if len(raw) >= expected:
            return raw[:expected]  # stored uncompressed
        mask = raw[0]
        data = raw[1:]
        # StormLib decompression order
        if mask & 0x10:
            data = bz2.decompress(data)
        if mask & 0x08:
            data = explode(data, expected)
        if mask & 0x02:
            data = zlib.decompress(data)
        if mask & 0x01:
            raise ExplodeError("huffman compression not supported (audio)")
        if mask & (0x40 | 0x80):
            raise ExplodeError("ADPCM compression not supported (audio)")
        if mask & ~0xDB and mask not in (0x02, 0x08, 0x10):
            # unknown bits set and not a known single method
            pass
        return data

    def read_file(self, filename: str) -> bytes | None:
        """Extract a file with full decryption + decompression. None if absent."""
        block = self.get_block(filename)
        if block is None:
            return None
        if not (block.flags & MPQ_FILE_EXISTS):
            return None
        if block.size == 0:
            return b""

        f = self.a.file
        f.seek(self.a.header["offset"] + block.offset)
        raw = f.read(block.archived_size)

        encrypted = bool(block.flags & MPQ_FILE_ENCRYPTED)
        key = self.file_key(filename, _BlockShim(block)) if encrypted else 0
        compressed = bool(block.flags & (MPQ_FILE_COMPRESS | MPQ_FILE_IMPLODE))
        imploded = bool(block.flags & MPQ_FILE_IMPLODE)

        if block.flags & MPQ_FILE_SINGLE_UNIT:
            data = self._decrypt(raw, key) if encrypted else raw
            if compressed and block.archived_size < block.size:
                if imploded:
                    return explode(data, block.size)
                return self._decompress_sector(data, block.size)
            return data[: block.size]

        if not compressed:
            data = self._decrypt(raw, key) if encrypted else raw
            return data[: block.size]

        # sectored + compressed
        num_sectors = (block.size + self.sector_size - 1) // self.sector_size
        num_offsets = num_sectors + 1
        if block.flags & MPQ_FILE_SECTOR_CRC:
            num_offsets += 1
        table_raw = raw[: 4 * num_offsets]
        if encrypted:
            table_raw = self._decrypt(table_raw, (key - 1) & 0xFFFFFFFF)
        offsets = struct.unpack("<%dI" % num_offsets, table_raw)
        out = bytearray()
        for i in range(num_sectors):
            start, end = offsets[i], offsets[i + 1]
            if end < start or end > len(raw):
                raise ExplodeError(
                    f"{filename}: bad sector bounds {start}..{end} (raw {len(raw)})"
                )
            sector = raw[start:end]
            if encrypted:
                sector = self._decrypt(sector, (key + i) & 0xFFFFFFFF)
            expected = min(self.sector_size, block.size - len(out))
            if imploded and len(sector) < expected:
                out += explode(sector, expected)
            else:
                out += self._decompress_sector(sector, expected)
        return bytes(out[: block.size])


class _BlockShim:
    """mpyq block entries name the offset field 'offset'; FIX_KEY math wants
    the file offset relative to the archive, which for w3x IS block.offset."""

    def __init__(self, block):
        self.archive_offset = block.offset
        self.size = block.size
        self.flags = block.flags
