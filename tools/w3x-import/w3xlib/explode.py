"""PKWARE Data Compression Library "explode" (decompress) — pure Python.

Port of zlib/contrib/blast.c (Mark Adler, public-domain-style zlib license
algorithm description). Decompresses data produced by the PKWARE DCL
"implode" routine, which MPQ archives use for compression byte 0x08 and for
the MPQ_FILE_IMPLODE block flag.

Format recap (see blast.c):
  byte 0: literal coding — 0 = literals are raw 8-bit, 1 = Huffman coded
  byte 1: dictionary size log2 - 6 (4..6 → 1KB..4KB window)
  then an LSB-first bitstream of tokens:
    1 + lengthcode(+extra) + distcode(+low bits)  → copy
    0 + literal                                    → one byte
  length 519 terminates the stream.
"""

from __future__ import annotations


class ExplodeError(ValueError):
    pass


def _construct(rep: bytes) -> tuple[list[int], list[int]]:
    """Expand blast.c's compact code-length list into (count[], symbol[])."""
    lengths: list[int] = []
    for byte in rep:
        count = (byte >> 4) + 1
        length = byte & 15
        lengths.extend([length] * count)
    n = len(lengths)
    count = [0] * 16
    for l in lengths:
        count[l] += 1
    # canonical Huffman: sort symbols by (length, symbol)
    offs = [0] * 16
    for l in range(1, 15):
        offs[l + 1] = offs[l] + count[l]
    symbol = [0] * n
    for sym, l in enumerate(lengths):
        if l != 0:
            symbol[offs[l]] = sym
            offs[l] += 1
    return count, symbol


_LITCODE = _construct(bytes([
    11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8,
    9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11, 7, 9, 11, 12, 6, 7, 22, 5,
    7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12,
    8, 12, 5, 38, 5, 38, 5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27,
    44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12, 45,
    44, 173]))
_LENCODE = _construct(bytes([2, 35, 36, 53, 38, 23]))
_DISTCODE = _construct(bytes([2, 20, 53, 230, 247, 151, 248]))

_LEN_BASE = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 32, 64, 128, 256, 512]
_LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]


class _Bits:
    __slots__ = ("data", "pos", "bitbuf", "bitcnt")

    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0
        self.bitbuf = 0
        self.bitcnt = 0

    def bits(self, need: int) -> int:
        val = self.bitbuf
        while self.bitcnt < need:
            if self.pos >= len(self.data):
                raise ExplodeError("out of input")
            val |= self.data[self.pos] << self.bitcnt
            self.pos += 1
            self.bitcnt += 8
        self.bitbuf = val >> need
        self.bitcnt -= need
        return val & ((1 << need) - 1)

def explode(data: bytes, expected_size: int | None = None) -> bytes:
    """Decompress a PKWARE DCL imploded buffer."""
    if len(data) < 4:
        raise ExplodeError("input too short")
    s = _Bits(data)
    lit = s.bits(8)
    if lit > 1:
        raise ExplodeError(f"bad literal flag {lit}")
    dict_bits = s.bits(8)
    if dict_bits < 4 or dict_bits > 6:
        raise ExplodeError(f"bad dictionary size {dict_bits}")
    out = bytearray()
    while True:
        if s.bits(1):
            sym = _decode(s, _LENCODE)
            length = _LEN_BASE[sym] + s.bits(_LEN_EXTRA[sym])
            if length == 519:
                break  # end of stream
            low = 2 if length == 2 else dict_bits
            dist = _decode(s, _DISTCODE) << low
            dist += s.bits(low)
            dist += 1
            if dist > len(out):
                raise ExplodeError("distance too far back")
            for _ in range(length):
                out.append(out[-dist])
        else:
            out.append(_decode(s, _LITCODE) if lit else s.bits(8))
        if expected_size is not None and len(out) > expected_size:
            raise ExplodeError("output larger than expected")
    return bytes(out)


def _decode(s: _Bits, huff: tuple[list[int], list[int]]) -> int:
    """Decode one symbol; bits are read LSB-first and INVERTED (per blast.c)."""
    counts, symbols = huff
    code = first = index = 0
    length = 1
    while True:
        bit = (s.bits(1)) ^ 1
        code |= bit
        count = counts[length]
        if code - count < first:
            return symbols[index + (code - first)]
        index += count
        first = (first + count) << 1
        code <<= 1
        length += 1
        if length > 15:
            raise ExplodeError("bad huffman code")
