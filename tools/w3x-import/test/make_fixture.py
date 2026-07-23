#!/usr/bin/env python3
"""Build a TINY synthetic .w3x fixture for the importer test suite.

Contains (all hand-crafted, no Blizzard data):
  war3map.wts  — 3 strings (one Chinese) — stored uncompressed
  war3map.w3u  — 1 custom hero (base Hpal) — zlib compressed + ENCRYPTED
  war3map.w3a  — 1 custom ability (base AHtb) — zlib + encrypted + FIX_KEY
  war3map.w3t  — 1 custom item — uncompressed
  war3map.wpm  — 64x32 pathing grid with two open rooms
  war3map.doo  — empty doodad list
  fixhero.mdx  — minimal skinned model (5 sequences, 1 bone, 1 triangle)
  fixtex.blp   — 8x8 paletted BLP1
  implode.bin  — PKWARE DCL imploded blob (round-trips through explode())

Usage: make_fixture.py <out.w3x>
"""

from __future__ import annotations

import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import mpyq  # noqa: E402
from w3xlib.explode import _LENCODE, _DISTCODE, _LEN_BASE, _LEN_EXTRA  # noqa: E402

# ---------------------------------------------------------------- crypto ----

_ENC = mpyq.MPQArchive.__new__(mpyq.MPQArchive)
# encryption_table is built in __init__; rebuild it manually
seed = 0x00100001
table = {}
for i in range(256):
    index = i
    for _ in range(5):
        seed = (seed * 125 + 3) % 0x2AAAAB
        t1 = (seed & 0xFFFF) << 0x10
        seed = (seed * 125 + 3) % 0x2AAAAB
        t2 = seed & 0xFFFF
        table[index] = t1 | t2
        index += 0x100
ENC_TABLE = table


def mpq_hash(s: str, hash_type: int) -> int:
    seed1 = 0x7FED7FED
    seed2 = 0xEEEEEEEE
    for ch in s.upper():
        ch = ord(ch)
        value = ENC_TABLE[(hash_type << 8) + ch]
        seed1 = (value ^ (seed1 + seed2)) & 0xFFFFFFFF
        seed2 = (ch + seed1 + seed2 + (seed2 << 5) + 3) & 0xFFFFFFFF
    return seed1


def encrypt(data: bytes, key: int) -> bytes:
    seed1 = key & 0xFFFFFFFF
    seed2 = 0xEEEEEEEE
    n = len(data) // 4
    words = struct.unpack("<%dI" % n, data[: n * 4])
    out = bytearray()
    for value in words:
        seed2 = (seed2 + ENC_TABLE[0x400 + (seed1 & 0xFF)]) & 0xFFFFFFFF
        enc = (value ^ (seed1 + seed2)) & 0xFFFFFFFF
        seed1 = (((~seed1 << 0x15) + 0x11111111) | (seed1 >> 0x0B)) & 0xFFFFFFFF
        seed2 = (value + seed2 + (seed2 << 5) + 3) & 0xFFFFFFFF
        out += struct.pack("<I", enc)
    out += data[n * 4:]
    return bytes(out)


# ------------------------------------------------------- mini DCL implode ----

def _codes(huff):
    counts, symbols = huff
    out = {}
    code = first = index = 0
    for length in range(1, 16):
        count = counts[length]
        for k in range(count):
            out[symbols[index + k]] = (length, first + k)
        index += count
        first = (first + count) << 1
    return out


class _BitWriter:
    def __init__(self):
        self.bits: list[int] = []

    def raw(self, value: int, n: int):  # LSB-first
        for i in range(n):
            self.bits.append((value >> i) & 1)

    def huff(self, length: int, code: int):  # MSB-first, inverted
        for i in range(length - 1, -1, -1):
            self.bits.append(((code >> i) & 1) ^ 1)

    def bytes(self) -> bytes:
        out = bytearray()
        for i in range(0, len(self.bits), 8):
            b = 0
            for j, bit in enumerate(self.bits[i : i + 8]):
                b |= bit << j
            out.append(b)
        return bytes(out)


def mini_implode(data: bytes) -> bytes:
    """Greedy LZ with binary literals — round-trips through explode().
    dict bits 4 → window 1024; copies of length >= 3 only (keeps it simple)."""
    len_codes = _codes(_LENCODE)
    dist_codes = _codes(_DISTCODE)
    LOW = 4  # dict bits
    w = _BitWriter()
    w.raw(0, 8)  # binary literals
    w.raw(LOW, 8)
    i = 0
    n = len(data)
    while i < n:
        best_len = 0
        best_dist = 0
        for j in range(max(0, i - 1024), i):
            k = 0
            while i + k < n and data[j + k] == data[i + k] and k < 518:
                k += 1
            if k > best_len:
                best_len, best_dist = k, i - j
        # cap to a representable length (the base table has gaps)
        rep = [
            (s, min(best_len, _LEN_BASE[s] + (1 << _LEN_EXTRA[s]) - 1))
            for s in range(16)
            if _LEN_BASE[s] <= best_len
        ]
        if best_len >= 3 and rep:
            sym, copy = max(rep, key=lambda sc: sc[1])
            w.raw(1, 1)
            w.huff(*len_codes[sym])
            w.raw(copy - _LEN_BASE[sym], _LEN_EXTRA[sym])
            low = 2 if copy == 2 else LOW
            d = best_dist - 1
            w.huff(*dist_codes[d >> low])
            w.raw(d & ((1 << low) - 1), low)
            i += copy
        else:
            w.raw(0, 1)
            w.raw(data[i], 8)
            i += 1
    w.raw(1, 1)  # end-of-stream: length 519 = sym 15 + extra 7
    w.huff(*len_codes[15])
    w.raw(7, 8)
    return w.bytes()


# ----------------------------------------------------------- MPQ writing ----

F_EXISTS = 0x80000000
F_COMPRESS = 0x00000200
F_ENCRYPTED = 0x00010000
F_FIX_KEY = 0x00020000


def build_mpq(files: list[tuple[str, bytes, int, int | None]]) -> bytes:
    """files: (name, raw_data, flags, force_mask) — single-sector files only.
    force_mask: compression mask byte (0x02 zlib / 0x08 pkware) or None."""
    HEADER = 32
    body = bytearray()
    blocks = []
    sector_shift = 12  # sector 2MB → everything is single-sector
    for name, data, flags, mask in files:
        offset = HEADER + len(body)
        if mask is not None:
            comp = zlib.compress(data, 9) if mask == 0x02 else mini_implode(data)
            stored = bytes([mask]) + comp
            assert len(stored) < len(data), f"{name}: fixture must compress"
            payload = struct.pack("<II", 8, 8 + len(stored)) + stored
            flags |= F_COMPRESS
        else:
            payload = data
        if flags & F_ENCRYPTED:
            key = mpq_hash(name.rsplit("\\", 1)[-1], 3)
            if flags & F_FIX_KEY:
                key = ((key + offset) & 0xFFFFFFFF) ^ (len(data) & 0xFFFFFFFF)
            if flags & F_COMPRESS:
                table_raw = payload[:8]
                sector = payload[8:]
                payload = encrypt(table_raw, (key - 1) & 0xFFFFFFFF) + encrypt(
                    sector, key
                )
            else:
                payload = encrypt(payload, key)
        body += payload
        blocks.append((offset, len(payload), len(data), flags | F_EXISTS))

    n = 1
    while n < len(files):
        n *= 2
    n *= 2  # headroom against collisions
    hash_entries = [(0xFFFFFFFF, 0xFFFFFFFF, 0xFFFF, 0xFFFF, 0xFFFFFFFF)] * n
    for bi, (name, *_rest) in enumerate(files):
        idx = mpq_hash(name, 0) & (n - 1)
        while hash_entries[idx][4] != 0xFFFFFFFF:
            idx = (idx + 1) & (n - 1)
        hash_entries[idx] = (mpq_hash(name, 1), mpq_hash(name, 2), 0, 0, bi)

    hash_off = HEADER + len(body)
    hash_raw = b"".join(struct.pack("<IIHHI", *e) for e in hash_entries)
    block_off = hash_off + len(hash_raw)
    block_raw = b"".join(struct.pack("<IIII", *b) for b in blocks)
    archive_size = block_off + len(block_raw)
    header = struct.pack(
        "<4sIIHHIIII", b"MPQ\x1a", HEADER, archive_size, 0, sector_shift,
        hash_off, block_off, n, len(blocks),
    )
    return (
        header + bytes(body)
        + encrypt(hash_raw, mpq_hash("(hash table)", 3))
        + encrypt(block_raw, mpq_hash("(block table)", 3))
    )


# ------------------------------------------------------- fixture payloads ----

def obj_file(entries, has_levels, original=()):
    """entries: (base, new, [(code, vtype, level, col, value)]).
    `original` entries use new_id \\0\\0\\0\\0 (modified-in-place standard)."""

    def table(rows, force_empty_new):
        out = struct.pack("<i", len(rows))
        for base, new, mods in rows:
            new_raw = b"\x00\x00\x00\x00" if force_empty_new else new.encode()
            out += base.encode() + new_raw + struct.pack("<i", len(mods))
            for code, vt, lv, col, val in mods:
                out += code.encode() + struct.pack("<i", vt)
                if has_levels:
                    out += struct.pack("<ii", lv, col)
                if vt == 0:
                    out += struct.pack("<i", val)
                elif vt in (1, 2):
                    out += struct.pack("<f", val)
                else:
                    out += val.encode("utf-8") + b"\x00"
                out += b"\x00\x00\x00\x00"
        return out

    return (struct.pack("<i", 2) + table(original, True)
            + table(entries, False))


def fixture_mdx() -> bytes:
    def chunk(tag, body):
        return tag + struct.pack("<I", len(body)) + body

    def cstr(s, size):
        b = s.encode()[: size - 1]
        return b + b"\x00" * (size - len(b))

    seqs = b""
    for name, s, e in [("Stand", 0, 1000), ("Walk", 1100, 2000),
                       ("Attack", 2100, 3000), ("Death", 3100, 4000),
                       ("Stand Hit", 4100, 5000)]:
        seqs += cstr(name, 80) + struct.pack("<II", s, e)
        seqs += struct.pack("<fIfIf", 0, 0, 0, 0, 1.0) + struct.pack("<6f", *([0] * 6))
    texs = struct.pack("<I", 0) + cstr("fixtex.blp", 260) + struct.pack("<I", 0)
    layer = struct.pack("<IIIiif", 28, 0, 0, 0, -1, 1.0)
    mtls = struct.pack("<III", 12 + 8 + len(layer), 0, 0) + b"LAYS" + \
        struct.pack("<I", 1) + layer
    geo = b"VRTX" + struct.pack("<I", 3) + struct.pack(
        "<9f", 0, 0, 0, 10, 0, 0, 0, 10, 60)
    geo += b"NRMS" + struct.pack("<I", 3) + struct.pack("<9f", *([0, 0, 1] * 3))
    geo += b"PTYP" + struct.pack("<II", 1, 4)
    geo += b"PCNT" + struct.pack("<II", 1, 3)
    geo += b"PVTX" + struct.pack("<I", 3) + struct.pack("<3H", 0, 1, 2)
    geo += b"GNDX" + struct.pack("<I", 3) + b"\x00\x00\x00"
    geo += b"MTGC" + struct.pack("<II", 1, 1)
    geo += b"MATS" + struct.pack("<II", 1, 0)
    geo += struct.pack("<III", 0, 0, 0) + struct.pack("<7f", *([0] * 7))
    geo += struct.pack("<I", 0)
    geo += b"UVAS" + struct.pack("<I", 1)
    geo += b"UVBS" + struct.pack("<I", 3) + struct.pack("<6f", 0, 0, 1, 0, 0, 1)
    geos = struct.pack("<I", len(geo) + 4) + geo
    kgtr = b"KGTR" + struct.pack("<IiI", 2, 1, 0xFFFFFFFF)
    kgtr += struct.pack("<i3f", 0, 0, 0, 0) + struct.pack("<i3f", 1000, 0, 0, 5)
    # rotation track spanning several sequences on the GLOBAL timeline, with
    # a duplicate frame (1500 twice) — exercises the exporter's per-sequence
    # clamping/rebasing + duplicate-time collapse (w3x-anim-timing). Death
    # [3100..4000] has NO rotation keys → exporter emits a 1-key hold.
    rot_keys = [
        (0, (0, 0, 0, 1)), (1000, (0, 0.7071, 0, 0.7071)),   # Stand
        (1100, (0, 0, 0, 1)), (1500, (0, 0.7071, 0, 0.7071)),
        (1500, (0, 1, 0, 0)), (2000, (0, 0, 0, 1)),          # Walk (dup @1500)
        (2100, (0, 0.7071, 0, 0.7071)), (3000, (0, 0, 0, 1)),  # Attack
    ]
    kgrt = b"KGRT" + struct.pack("<IiI", len(rot_keys), 1, 0xFFFFFFFF)
    for f, q in rot_keys:
        kgrt += struct.pack("<i4f", f, *q)
    node = struct.pack("<I", 96 + len(kgtr) + len(kgrt)) + cstr("root", 80) + \
        struct.pack("<iii", 0, -1, 0) + kgtr + kgrt
    bone = node + struct.pack("<ii", 0, -1)
    # ATCH node (objId 1) referencing a SEPARATE weapon model to bake in.
    anode = struct.pack("<I", 96) + cstr("Weapon Ref", 80) + \
        struct.pack("<iii", 1, -1, 0)          # objId 1, no parent
    apath = b"weapon.mdx" + b"\x00" * (256 - 10)
    atch_entry = anode + apath + struct.pack("<I", 0)  # + attachmentId
    atch = struct.pack("<I", 4 + len(atch_entry)) + atch_entry
    pivt = struct.pack("<3f", 0, 0, 0) + struct.pack("<3f", 0, 0, 40)  # bone, weapon
    return (b"MDLX" + chunk(b"VERS", struct.pack("<I", 800))
            + chunk(b"MODL", cstr("fixhero", 80) + b"\x00" * 292)
            + chunk(b"SEQS", seqs) + chunk(b"TEXS", texs)
            + chunk(b"MTLS", mtls) + chunk(b"GEOS", geos)
            + chunk(b"BONE", bone) + chunk(b"ATCH", atch)
            + chunk(b"PIVT", pivt))


def fixture_weapon() -> bytes:
    """A separate attachment model (no bones): three geosets exercising the
    material paths — BLEND (fm2), team-colour (replaceableId 1) and additive
    glow (fm3) — merged into the hero at the ATCH node by the importer."""
    def chunk(tag, body):
        return tag + struct.pack("<I", len(body)) + body

    def cstr(s, size):
        b = s.encode()[: size - 1]
        return b + b"\x00" * (size - len(b))

    def geo_tri(mat_id):
        g = b"VRTX" + struct.pack("<I", 3) + struct.pack(
            "<9f", 0, 0, 0, 4, 0, 0, 0, 4, 20)
        g += b"NRMS" + struct.pack("<I", 3) + struct.pack("<9f", *([0, 0, 1] * 3))
        g += b"PTYP" + struct.pack("<II", 1, 4)
        g += b"PCNT" + struct.pack("<II", 1, 3)
        g += b"PVTX" + struct.pack("<I", 3) + struct.pack("<3H", 0, 1, 2)
        g += b"GNDX" + struct.pack("<I", 3) + b"\x00\x00\x00"
        g += b"MTGC" + struct.pack("<II", 1, 1)
        g += b"MATS" + struct.pack("<II", 1, 0)
        g += struct.pack("<III", mat_id, 0, 0) + struct.pack("<7f", *([0] * 7))
        g += struct.pack("<I", 0)  # nExtents
        g += b"UVAS" + struct.pack("<I", 1)
        g += b"UVBS" + struct.pack("<I", 3) + struct.pack("<6f", 0, 0, 1, 0, 0, 1)
        return struct.pack("<I", len(g) + 4) + g

    # tex0 = real texture (fixtex.blp), tex1 = replaceable team colour
    texs = struct.pack("<I", 0) + cstr("fixtex.blp", 260) + struct.pack("<I", 0)
    texs += struct.pack("<I", 1) + cstr("", 260) + struct.pack("<I", 0)

    def mtl(filter_mode, tex_id):
        layer = struct.pack("<IIIiif", 28, filter_mode, 0, tex_id, -1, 1.0)
        return struct.pack("<III", 12 + 8 + len(layer), 0, 0) + b"LAYS" + \
            struct.pack("<I", 1) + layer

    mtls = mtl(2, 0) + mtl(0, 1) + mtl(3, 0)   # BLEND, team-colour, additive
    geos = geo_tri(0) + geo_tri(1) + geo_tri(2)
    return (b"MDLX" + chunk(b"VERS", struct.pack("<I", 800))
            + chunk(b"MODL", cstr("weapon", 80) + b"\x00" * 292)
            + chunk(b"TEXS", texs) + chunk(b"MTLS", mtls)
            + chunk(b"GEOS", geos)
            + chunk(b"PIVT", struct.pack("<3f", 0, 0, 0)))


def fixture_blp() -> bytes:
    head = b"BLP1" + struct.pack("<6I", 1, 0, 8, 8, 5, 0)
    offs = [0] * 16
    sizes = [0] * 16
    offs[0] = 156 + 1024
    sizes[0] = 64
    palette = b"".join(struct.pack("<4B", i, 128, 255 - i, 255) for i in range(256))
    return head + struct.pack("<16I", *offs) + struct.pack("<16I", *sizes) + \
        palette + bytes(range(64))


def fixture_wpm() -> bytes:
    w, h = 64, 32
    grid = bytearray([0x02] * (w * h))
    for cy in (16,):
        for cx in (16, 48):
            for y in range(h):
                for x in range(w):
                    if (x - cx) ** 2 + (y - cy) ** 2 <= 12 ** 2:
                        grid[y * w + x] = 0
    # a small unwalkable blob inside each room
    for cx in (16, 48):
        for y in range(14, 17):
            for x in range(cx + 3, cx + 6):
                grid[y * w + x] = 0x02
    return b"MP3W" + struct.pack("<iII", 0, w, h) + bytes(grid)


def main(out_path: str) -> None:
    wts = ("STRING 1\r\n{\r\n測試英雄\r\n}\r\n\r\n"
           "STRING 2\r\n{\r\n風暴之鎚\r\n}\r\n\r\n"
           "STRING 3\r\n{\r\n測試道具\r\n}\r\n\r\n"
           "STRING 4\r\n{\r\n測試原始英雄\r\n}\r\n\r\n"
           "STRING 5\r\n{\r\n小玉\r\n}\r\n").encode("utf-8")
    hero_mods = [
        ("unam", 3, 0, 0, "TRIGSTR_1"),        # title  (稱號)
        ("upro", 3, 0, 0, "TRIGSTR_5"),        # proper name (名字)
        ("usca", 2, 0, 0, 1.5),                # Scaling Value → model scale
        ("umdl", 3, 0, 0, "fixhero.mdx"),
        ("uhab", 3, 0, 0, "A001,Aamk"),
        ("uhpm", 0, 0, 0, 200), ("umpm", 0, 0, 0, 150),
        ("ustr", 0, 0, 0, 20), ("uagi", 0, 0, 0, 15),
        ("uint", 0, 0, 0, 18), ("umvs", 0, 0, 0, 300),
        ("ua1c", 2, 0, 0, 2.0), ("ua1d", 0, 0, 0, 4),
        ("ua1s", 0, 0, 0, 6), ("ua1r", 0, 0, 0, 128),
    ]
    # -- rawMods passthrough fixture (task #56) --------------------------------
    # The importer whitelists ~27 unit field codes; historically every OTHER
    # code was silently dropped (a real GoDie w3u object carries up to 70 codes,
    # the union across the map is 180). Pad this hero out to 180 DISTINCT codes,
    # all UNKNOWN to the whitelist, so the passthrough test can prove 180/180
    # survive (typed ∪ rawMods) instead of the old ~30/180. Codes are synthetic
    # 'xNNN' tags, disjoint from the whitelist and from the real codes above.
    _present = {m[0] for m in hero_mods}
    _i = 0
    while len(_present) < 180:
        _code = f"x{_i:03d}"
        _i += 1
        if _code in _present:
            continue
        hero_mods.append((_code, 0, 0, 0, 1000 + _i))
        _present.add(_code)
    w3u = obj_file([
        ("Hpal", "H001", hero_mods),
    ], False, original=[
        # ORIGINAL-table hero: standard rawcode modified in place (no new id,
        # no umdl → Blizzard stock model → stand-in path in the importer).
        ("Hblm", "", [
            ("unam", 3, 0, 0, "TRIGSTR_4"),
            ("uhab", 3, 0, 0, "A001,Aamk"),
            ("ustr", 0, 0, 0, 19),
            ("uhpm", 0, 0, 0, 250),
        ]),
    ])
    w3a = obj_file([
        ("AHtb", "A001", [
            ("anam", 3, 0, 0, "TRIGSTR_2"),
            ("alev", 0, 0, 0, 3),
            # Requirements (`areq`) reference the R00R research — this is the
            # per-hero "EX 技能" level-30 gate (extract_ex.py keys off exactly this).
            ("areq", 3, 0, 0, "R00R"),
            ("acdn", 2, 1, 0, 9.0), ("acdn", 2, 2, 0, 8.0), ("acdn", 2, 3, 0, 7.0),
            ("amcs", 0, 1, 0, 75), ("amcs", 0, 2, 0, 85), ("amcs", 0, 3, 0, 95),
            ("aran", 2, 1, 0, 600.0),
            ("Htb1", 2, 1, 1, 100.0), ("Htb1", 2, 2, 1, 180.0),
            ("Htb1", 2, 3, 1, 260.0),
        ]),
    ], True)
    w3t = obj_file([
        ("rat9", "I001", [
            ("unam", 3, 0, 0, "TRIGSTR_3"),
            ("igol", 0, 0, 0, 750),
            ("iabi", 3, 0, 0, ""),
            # 'ilev' has no typed field in the stats.py item reader → must be
            # carried through under the item's rawMods (task #56 passthrough).
            ("ilev", 0, 0, 0, 3),
        ]),
    ], False)
    doo = b"W3do" + struct.pack("<III", 8, 11, 0) + struct.pack("<I", 0)
    # random-hero pool in obfuscated-JASS style: size var + mixed decimal/hex
    # ($3 == 3) array indices, exactly like the protected GoDie script.
    jass = ("function main takes nothing returns nothing\n"
            "set Qq=3set qq[1]='H001'\n"
            "set qq[2]='Hblm'\n"
            "set qq[$3]='Hxyz'\n"
            "endfunction\n").encode("utf-8")

    files = [
        ("war3map.wts", wts, 0, None),
        ("war3map.j", jass, 0, None),
        ("war3map.w3u", w3u, F_ENCRYPTED, 0x02),
        ("war3map.w3a", w3a, F_ENCRYPTED | F_FIX_KEY, 0x02),
        ("war3map.w3t", w3t, 0, None),
        ("war3map.wpm", fixture_wpm(), 0, 0x02),
        ("war3map.doo", doo, 0, None),
        ("fixhero.mdx", fixture_mdx(), F_ENCRYPTED, 0x02),
        ("weapon.mdx", fixture_weapon(), F_ENCRYPTED, 0x02),
        ("fixtex.blp", fixture_blp(), 0, None),
        ("implode.bin", b"PKWARE explode round-trip! " * 40, 0, 0x08),
    ]
    mpq = build_mpq(files)
    with open(out_path, "wb") as f:
        f.write(b"HM3W" + b"\x00" * 4 + b"fixture\x00" + b"\x00" * (0x200 - 16))
        f.write(mpq)
    print(f"fixture written: {out_path} ({0x200 + len(mpq)} bytes)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "fixture.w3x")
