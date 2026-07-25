"""MPQ audio-sector decompression: StormLib huffman (huff.cpp) + ADPCM
(adpcm.cpp) ported to Python, plus a W3XArchive subclass whose
_decompress_sector handles masks 0x01 (huffman), 0x40 (ADPCM mono),
0x80 (ADPCM stereo) in StormLib order (huffman first, then ADPCM).

The retail MPQs compress every stock .wav this way, so the base
W3XArchive.read_file raises ExplodeError on them — use AudioArchive for
anything under Sound\\, Units\\, Buildings\\ or Abilities\\ audio. This is
the decoder that produced the 511 data/blizzard-overlay/sounds clips (the
batch reports name it as "scratchpad/mpqaudio.py"; it now lives here so the
extraction is reproducible).

Ported 1:1 from StormLib master (Ladislav Zezula), files
src/huffman/huff.cpp + src/adpcm/adpcm.cpp fetched 2026-07-22.
"""

from __future__ import annotations

import bz2
import zlib

from .mpq import W3XArchive
from .explode import explode, ExplodeError

# ---------------------------------------------------------------- huffman ----

# Weight tables (DataDistributions) for compression types 0x00-0x08.
# Only the first 256 entries matter (per-byte weights).
_D = {}
_D[0] = bytes([0x0A] + [0] * 254 + [0x02])  # sparse
_D[1] = bytes([  # binary
    0x54, 0x16, 0x16, 0x0D, 0x0C, 0x08, 0x06, 0x05, 0x06, 0x05, 0x06, 0x03, 0x04, 0x04, 0x03, 0x05,
    0x0E, 0x0B, 0x14, 0x13, 0x13, 0x09, 0x0B, 0x06, 0x05, 0x04, 0x03, 0x02, 0x03, 0x02, 0x02, 0x02,
    0x0D, 0x07, 0x09, 0x06, 0x06, 0x04, 0x03, 0x02, 0x04, 0x03, 0x03, 0x03, 0x03, 0x03, 0x02, 0x02,
    0x09, 0x06, 0x04, 0x04, 0x04, 0x04, 0x03, 0x02, 0x03, 0x02, 0x02, 0x02, 0x02, 0x03, 0x02, 0x04,
    0x08, 0x03, 0x04, 0x07, 0x09, 0x05, 0x03, 0x03, 0x03, 0x03, 0x02, 0x02, 0x02, 0x03, 0x02, 0x02,
    0x03, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x01, 0x01, 0x01, 0x02, 0x01, 0x02, 0x02,
    0x06, 0x0A, 0x08, 0x08, 0x06, 0x07, 0x04, 0x03, 0x04, 0x04, 0x02, 0x02, 0x04, 0x02, 0x03, 0x03,
    0x04, 0x03, 0x07, 0x07, 0x09, 0x06, 0x04, 0x03, 0x03, 0x02, 0x01, 0x02, 0x02, 0x02, 0x02, 0x02,
    0x0A, 0x02, 0x02, 0x03, 0x02, 0x02, 0x01, 0x01, 0x02, 0x02, 0x02, 0x06, 0x03, 0x05, 0x02, 0x03,
    0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x03, 0x01, 0x01, 0x01,
    0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x04, 0x04, 0x04, 0x07, 0x09, 0x08, 0x0C, 0x02,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x01, 0x01, 0x03,
    0x04, 0x01, 0x02, 0x04, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01,
    0x04, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x03, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x02, 0x01, 0x01, 0x02, 0x02, 0x02, 0x06, 0x4B,
])
_D[2] = bytes([  # text
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x27, 0x00, 0x00, 0x23, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xFF, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x02, 0x01, 0x01, 0x06, 0x0E, 0x10, 0x04,
    0x06, 0x08, 0x05, 0x04, 0x04, 0x03, 0x03, 0x02, 0x02, 0x03, 0x03, 0x01, 0x01, 0x02, 0x01, 0x01,
    0x01, 0x04, 0x02, 0x04, 0x02, 0x02, 0x02, 0x01, 0x01, 0x04, 0x01, 0x01, 0x02, 0x03, 0x03, 0x02,
    0x03, 0x01, 0x03, 0x06, 0x04, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x01, 0x02, 0x01, 0x01,
    0x01, 0x29, 0x07, 0x16, 0x12, 0x40, 0x0A, 0x0A, 0x11, 0x25, 0x01, 0x03, 0x17, 0x10, 0x26, 0x2A,
    0x10, 0x01, 0x23, 0x23, 0x2F, 0x10, 0x06, 0x07, 0x02, 0x09, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00,
] + [0] * 128)
_D[3] = bytes([  # general
    0xFF, 0x0B, 0x07, 0x05, 0x0B, 0x02, 0x02, 0x02, 0x06, 0x02, 0x02, 0x01, 0x04, 0x02, 0x01, 0x03,
    0x09, 0x01, 0x01, 0x01, 0x03, 0x04, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01,
    0x05, 0x01, 0x01, 0x01, 0x0D, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x02, 0x01, 0x01, 0x03, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01,
    0x0A, 0x04, 0x02, 0x01, 0x06, 0x03, 0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x03, 0x01, 0x01, 0x01,
    0x05, 0x02, 0x03, 0x04, 0x03, 0x03, 0x03, 0x02, 0x01, 0x01, 0x01, 0x02, 0x01, 0x02, 0x03, 0x03,
    0x01, 0x03, 0x01, 0x01, 0x02, 0x05, 0x01, 0x01, 0x04, 0x03, 0x05, 0x01, 0x03, 0x01, 0x03, 0x03,
    0x02, 0x01, 0x04, 0x03, 0x0A, 0x06, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x02, 0x02, 0x01, 0x0A, 0x02, 0x05, 0x01, 0x01, 0x02, 0x07, 0x02, 0x17, 0x01, 0x05, 0x01, 0x01,
    0x0E, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x06, 0x02, 0x01, 0x04, 0x05, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x07, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01,
    0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x11,
])
_D[4] = bytes([  # 4-bit ADPCM mono
    0xFF, 0xFB, 0x98, 0x9A, 0x84, 0x85, 0x63, 0x64, 0x3E, 0x3E, 0x22, 0x22, 0x13, 0x13, 0x18, 0x17,
] + [0] * 240)
_D[5] = bytes([  # 6-bit ADPCM mono
    0xFF, 0xF1, 0x9D, 0x9E, 0x9A, 0x9B, 0x9A, 0x97, 0x93, 0x93, 0x8C, 0x8E, 0x86, 0x88, 0x80, 0x82,
    0x7C, 0x7C, 0x72, 0x73, 0x69, 0x6B, 0x5F, 0x60, 0x55, 0x56, 0x4A, 0x4B, 0x40, 0x41, 0x37, 0x37,
    0x2F, 0x2F, 0x27, 0x27, 0x21, 0x21, 0x1B, 0x1C, 0x17, 0x17, 0x13, 0x13, 0x10, 0x10, 0x0D, 0x0D,
    0x0B, 0x0B, 0x09, 0x09, 0x08, 0x08, 0x07, 0x07, 0x06, 0x05, 0x05, 0x04, 0x04, 0x04, 0x19, 0x18,
] + [0] * 192)
_D[6] = bytes([  # 3-bit stereo
    0xC3, 0xCB, 0xF5, 0x41, 0xFF, 0x7B, 0xF7, 0x21] + [0] * 56 + [
    0xBF, 0xCC, 0xF2, 0x40, 0xFD, 0x7C, 0xF7, 0x22] + [0] * 56 + [
    0x7A, 0x46] + [0] * 126)
_D[7] = bytes([  # 4-bit stereo
    0xC3, 0xD9, 0xEF, 0x3D, 0xF9, 0x7C, 0xE9, 0x1E, 0xFD, 0xAB, 0xF1, 0x2C, 0xFC, 0x5B, 0xFE, 0x17,
] + [0] * 48 + [
    0xBD, 0xD9, 0xEC, 0x3D, 0xF5, 0x7D, 0xE8, 0x1D, 0xFB, 0xAE, 0xF0, 0x2C, 0xFB, 0x5C, 0xFF, 0x18,
] + [0] * 48 + [0x70, 0x6C] + [0] * 126)
_D[8] = bytes([  # 5-bit stereo
    0xBA, 0xC5, 0xDA, 0x33, 0xE3, 0x6D, 0xD8, 0x18, 0xE5, 0x94, 0xDA, 0x23, 0xDF, 0x4A, 0xD1, 0x10,
    0xEE, 0xAF, 0xE4, 0x2C, 0xEA, 0x5A, 0xDE, 0x15, 0xF4, 0x87, 0xE9, 0x21, 0xF6, 0x43, 0xFC, 0x12,
] + [0] * 32 + [
    0xB0, 0xC7, 0xD8, 0x33, 0xE3, 0x6B, 0xD6, 0x18, 0xE7, 0x95, 0xD8, 0x23, 0xDB, 0x49, 0xD0, 0x11,
    0xE9, 0xB2, 0xE2, 0x2B, 0xE8, 0x5C, 0xDD, 0x15, 0xF1, 0x87, 0xE7, 0x20, 0xF7, 0x44, 0xFF, 0x13,
] + [0] * 32 + [0x5F, 0x9E] + [0] * 126)

for _k, _v in _D.items():
    assert len(_v) == 256, (_k, len(_v))

_HUFF_ITEM_COUNT = 515
_ERR = 0x1FF


class HuffError(ExplodeError):
    pass


class _Item:
    __slots__ = ("next", "prev", "value", "weight", "parent", "child_lo")

    def __init__(self):
        self.next = None
        self.prev = None
        self.value = 0
        self.weight = 0
        self.parent = None
        self.child_lo = None

    def remove(self):
        if self.next is not None:
            self.prev.next = self.next
            self.next.prev = self.prev
            self.next = self.prev = None


class _BitIn:
    """TInputStream: LSB-first bit reader with StormLib's exact semantics."""

    __slots__ = ("data", "pos", "end", "bitbuf", "bitcnt")

    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0
        self.end = len(data)
        self.bitbuf = 0
        self.bitcnt = 0

    def get1(self):
        if self.bitcnt == 0:
            if self.pos >= self.end:
                return None
            self.bitbuf = self.data[self.pos]
            self.pos += 1
            self.bitcnt = 8
        v = self.bitbuf & 1
        self.bitbuf >>= 1
        self.bitcnt -= 1
        return v

    def get8(self):
        if self.bitcnt < 8:
            if self.pos >= self.end:
                return None
            self.bitbuf |= self.data[self.pos] << self.bitcnt
            self.pos += 1
            self.bitcnt += 8
        v = self.bitbuf & 0xFF
        self.bitbuf >>= 8
        self.bitcnt -= 8
        return v


class _HuffTree:
    def __init__(self):
        head = _Item()
        head.next = head.prev = head
        self.head = head
        self.items_used = 0
        self.by_byte = [None] * 258
        self.sparse = False

    # -- linked-list primitives (1:1 with huff.cpp) ---------------------------
    def _link(self, p1: _Item, p2: _Item):
        p2.next = p1.next
        p2.prev = p1.next.prev
        p1.next.prev = p2
        p1.next = p2

    def _create(self, value: int, weight: int, after: bool):
        if self.items_used >= _HUFF_ITEM_COUNT:
            return None
        it = _Item()
        self.items_used += 1
        # InsertItem(new, point, LIST_HEAD)
        if after:
            self._link(self.head, it)
        else:
            self._link(self.head.prev, it)
        it.value = value
        it.weight = weight
        return it

    def _find_higher_or_equal(self, item, weight):
        head = self.head
        if item is not None:
            while item is not head:
                if item.weight >= weight:
                    return item
                item = item.prev
        return head

    def _fixup_pos(self, item: _Item, max_weight: int) -> int:
        if item.weight < max_weight:
            higher = self._find_higher_or_equal(self.head.prev, item.weight)
            item.remove()
            self._link(higher, item)
        else:
            max_weight = item.weight
        return max_weight

    # -- tree building --------------------------------------------------------
    def build(self, data_type: int) -> bool:
        self.by_byte = [None] * 258
        max_weight = 0
        data_type &= 0x0F
        if data_type >= 9:
            return False
        table = _D[data_type]
        for i in range(0x100):
            w = table[i]
            if w != 0:
                it = self._create(i, w, after=True)
                self.by_byte[i] = it
                max_weight = self._fixup_pos(it, max_weight)
        self.by_byte[0x100] = self._create(0x100, 1, after=False)
        self.by_byte[0x101] = self._create(0x101, 1, after=False)

        head = self.head
        child_lo = head.prev
        while child_lo is not head:
            child_hi = child_lo.prev
            if child_hi is head:
                break
            parent = self._create(0, child_hi.weight + child_lo.weight, after=True)
            if parent is None:
                return False
            child_lo.parent = parent
            child_hi.parent = parent
            parent.child_lo = child_lo
            max_weight = self._fixup_pos(parent, max_weight)
            child_lo = child_hi.prev
        return True

    def _inc_weights_and_rebalance(self, item: _Item):
        while item is not None:
            item.weight += 1
            higher = self._find_higher_or_equal(item.prev, item.weight)
            child_hi = higher.next
            if child_hi is not item:
                child_hi.remove()
                self._link(item, child_hi)
                item.remove()
                self._link(higher, item)

                child_lo = child_hi.parent.child_lo
                parent = item.parent
                if parent.child_lo is item:
                    parent.child_lo = child_hi
                if child_lo is child_hi:
                    child_hi.parent.child_lo = item
                parent = item.parent
                item.parent = child_hi.parent
                child_hi.parent = parent
            item = item.parent

    def _insert_new_branch(self, value1: int, value2: int) -> bool:
        last = self.head.prev
        child_hi = self._create(value1, last.weight, after=False)
        if child_hi is None:
            return False
        child_hi.parent = last
        self.by_byte[value1] = child_hi
        child_lo = self._create(value2, 0, after=False)
        if child_lo is None:
            return False
        child_lo.parent = last
        last.child_lo = child_lo
        self.by_byte[value2] = child_lo
        self._inc_weights_and_rebalance(child_lo)
        return True

    def _decode_one(self, bits: _BitIn) -> int:
        head = self.head
        if head.next is head:
            return _ERR
        item = head.next
        while item.child_lo is not None:
            b = bits.get1()
            if b is None:
                return _ERR
            item = item.child_lo.prev if b else item.child_lo
        return item.value

    def decompress(self, data: bytes, max_out: int) -> bytes:
        bits = _BitIn(data)
        data_type = bits.get8()
        if data_type is None:
            raise HuffError("huffman: empty input")
        self.sparse = data_type == 0
        if not self.build(data_type):
            raise HuffError(f"huffman: bad data type {data_type:#x}")
        out = bytearray()
        while True:
            v = self._decode_one(bits)
            if v == 0x100:
                break
            if v == _ERR:
                raise HuffError("huffman: decode error")
            if v == 0x101:
                v = bits.get8()
                if v is None:
                    raise HuffError("huffman: truncated escape")
                if not self._insert_new_branch(self.head.prev.value, v):
                    raise HuffError("huffman: tree overflow")
                if not self.sparse:
                    self._inc_weights_and_rebalance(self.by_byte[v])
            if len(out) >= max_out:
                break
            out.append(v)
            if self.sparse:
                self._inc_weights_and_rebalance(self.by_byte[v])
        return bytes(out)


def huff_decompress(data: bytes, max_out: int = 1 << 24) -> bytes:
    return _HuffTree().decompress(data, max_out)


# ----------------------------------------------------------------- adpcm ----

_NEXT_STEP = [
    -1, 0, -1, 4, -1, 2, -1, 6,
    -1, 1, -1, 5, -1, 3, -1, 7,
    -1, 1, -1, 5, -1, 3, -1, 7,
    -1, 2, -1, 4, -1, 6, -1, 8,
]
_STEP_SIZE = [
    7, 8, 9, 10, 11, 12, 13, 14,
    16, 17, 19, 21, 23, 25, 28, 31,
    34, 37, 41, 45, 50, 55, 60, 66,
    73, 80, 88, 97, 107, 118, 130, 143,
    157, 173, 190, 209, 230, 253, 279, 307,
    337, 371, 408, 449, 494, 544, 598, 658,
    724, 796, 876, 963, 1060, 1166, 1282, 1411,
    1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024,
    3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
    7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
    15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
    32767,
]
_INITIAL_STEP_INDEX = 0x2C


def adpcm_decompress(data: bytes, channels: int, max_out: int) -> bytes:
    """DecompressADPCM from StormLib adpcm.cpp; max_out caps output bytes."""
    out = bytearray()
    pos = 0
    n = len(data)
    pred = [0, 0]
    step_idx = [_INITIAL_STEP_INDEX, _INITIAL_STEP_INDEX]

    # first byte is zero, second is the bit shift
    if n < 2:
        return bytes(out)
    bit_shift = data[1]
    pos = 2

    for i in range(channels):
        if n - pos < 2:
            return bytes(out)
        s = data[pos] | (data[pos + 1] << 8)
        if s >= 0x8000:
            s -= 0x10000
        pos += 2
        pred[i] = s
        if max_out - len(out) < 2:
            return bytes(out)
        out += s.to_bytes(2, "little", signed=True)

    ch = channels - 1
    while pos < n:
        enc = data[pos]
        pos += 1
        ch = (ch + 1) % channels

        if enc == 0x80:
            if step_idx[ch] != 0:
                step_idx[ch] -= 1
            if max_out - len(out) < 2:
                return bytes(out)
            out += pred[ch].to_bytes(2, "little", signed=True)
        elif enc == 0x81:
            step_idx[ch] += 8
            if step_idx[ch] > 0x58:
                step_idx[ch] = 0x58
            ch = (ch + 1) % channels  # keep same channel next pass
        else:
            si = step_idx[ch]
            step = _STEP_SIZE[si]
            diff = step >> bit_shift
            if enc & 0x01:
                diff += step
            if enc & 0x02:
                diff += step >> 1
            if enc & 0x04:
                diff += step >> 2
            if enc & 0x08:
                diff += step >> 3
            if enc & 0x10:
                diff += step >> 4
            if enc & 0x20:
                diff += step >> 5
            p = pred[ch]
            if enc & 0x40:
                p -= diff
                if p <= -32768:
                    p = -32768
            else:
                p += diff
                if p >= 32767:
                    p = 32767
            pred[ch] = p
            if max_out - len(out) < 2:
                break
            out += p.to_bytes(2, "little", signed=True)
            si += _NEXT_STEP[enc & 0x1F]
            step_idx[ch] = 0 if si < 0 else (88 if si > 88 else si)

    return bytes(out)


# ------------------------------------------------------------- archive ------


class AudioArchive(W3XArchive):
    """W3XArchive with full audio sector decompression (huffman + ADPCM)."""

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
            data = huff_decompress(data, max_out=max(expected * 4, 1 << 20))
        if mask & 0x40:
            data = adpcm_decompress(data, 1, max_out=expected)
        if mask & 0x80:
            data = adpcm_decompress(data, 2, max_out=expected)
        return data[:expected]
