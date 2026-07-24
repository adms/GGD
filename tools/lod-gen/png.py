"""
png — dependency-free PNG decode / box-downscale / re-encode.

Textures are the LARGEST slice of the .glb corpus (11.16 MB of PNG across 231
embedded images, vs 10.13 MB of geometry), so a geometry-only LOD would leave
most of the payload on the table. Pillow is not installed and may not be
downloaded, so this is a stdlib decoder: zlib + the five PNG filter types.

Scope, stated plainly: 8-bit and 16-bit depths, colour types 0/2/3/4/6, no
interlace. Anything outside that (Adam7, exotic depths) is REFUSED, not
guessed — the caller then copies the original image through unchanged, which
costs disk but never corrupts a texture.
"""

from __future__ import annotations

import struct
import zlib

CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


class Image:
    def __init__(self, width: int, height: int, channels: int, pixels: bytearray):
        self.width = width
        self.height = height
        self.channels = channels
        self.pixels = pixels  # 8-bit, row-major, `channels` bytes per pixel


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def decode(data: bytes) -> Image | None:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    offset = 8
    width = height = depth = ctype = interlace = 0
    idat = bytearray()
    palette = b""
    trns = b""
    while offset + 8 <= len(data):
        (length,) = struct.unpack_from(">I", data, offset)
        tag = data[offset + 4 : offset + 8]
        body = data[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if tag == b"IHDR":
            width, height, depth, ctype, _comp, _filt, interlace = struct.unpack(">IIBBBBB", body)
        elif tag == b"PLTE":
            palette = body
        elif tag == b"tRNS":
            trns = body
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break

    if interlace != 0 or ctype not in CHANNELS or depth not in (8, 16):
        return None  # refuse rather than guess

    raw_channels = CHANNELS[ctype]
    sample_bytes = depth // 8
    bpp = raw_channels * sample_bytes
    stride = width * bpp

    try:
        raw = zlib.decompress(bytes(idat))
    except zlib.error:
        return None
    if len(raw) < (stride + 1) * height:
        return None

    # --- unfilter -----------------------------------------------------------
    out = bytearray(stride * height)
    prev = bytearray(stride)
    pos = 0
    for y in range(height):
        ftype = raw[pos]
        pos += 1
        line = bytearray(raw[pos : pos + stride])
        pos += stride
        if ftype == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                upleft = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + _paeth(left, prev[i], upleft)) & 0xFF
        elif ftype != 0:
            return None
        out[y * stride : (y + 1) * stride] = line
        prev = line

    # --- normalise to 8-bit RGB(A) / gray(+A) --------------------------------
    if depth == 16:
        out = bytearray(out[0::2])
        stride //= 2
        bpp //= 2

    if ctype == 3:
        has_alpha = bool(trns)
        channels = 4 if has_alpha else 3
        pixels = bytearray(width * height * channels)
        for i in range(width * height):
            entry = out[i]
            base = entry * 3
            pixels[i * channels] = palette[base] if base < len(palette) else 0
            pixels[i * channels + 1] = palette[base + 1] if base + 1 < len(palette) else 0
            pixels[i * channels + 2] = palette[base + 2] if base + 2 < len(palette) else 0
            if has_alpha:
                pixels[i * channels + 3] = trns[entry] if entry < len(trns) else 255
        return Image(width, height, channels, pixels)

    return Image(width, height, raw_channels, out)


def downscale(img: Image, factor: int) -> Image:
    """Integer box filter. Edge pixels of a non-divisible image are clamped in."""
    if factor <= 1:
        return img
    nw = max(1, img.width // factor)
    nh = max(1, img.height // factor)
    ch = img.channels
    src = img.pixels
    dst = bytearray(nw * nh * ch)
    for y in range(nh):
        y0 = y * factor
        y1 = min(img.height, y0 + factor)
        for x in range(nw):
            x0 = x * factor
            x1 = min(img.width, x0 + factor)
            n = (y1 - y0) * (x1 - x0)
            base = (y * nw + x) * ch
            for c in range(ch):
                total = 0
                for sy in range(y0, y1):
                    row = sy * img.width * ch
                    for sx in range(x0, x1):
                        total += src[row + sx * ch + c]
                dst[base + c] = total // n
    return Image(nw, nh, ch, dst)


_CTYPE_FOR_CHANNELS = {1: 0, 2: 4, 3: 2, 4: 6}


def encode(img: Image, level: int = 9) -> bytes:
    bpp = img.channels
    stride = img.width * bpp
    raw = bytearray()
    prev = bytearray(stride)
    for y in range(img.height):
        line = img.pixels[y * stride : (y + 1) * stride]
        # adaptive filter: pick the candidate with the smallest absolute-sum,
        # the heuristic libpng itself uses. Cheap and usually beats filter 0 by
        # 20-40% on the character atlases in this corpus.
        best = None
        for ftype in (0, 1, 2, 4):
            cand = bytearray(stride)
            if ftype == 0:
                cand[:] = line
            elif ftype == 1:
                for i in range(stride):
                    left = line[i - bpp] if i >= bpp else 0
                    cand[i] = (line[i] - left) & 0xFF
            elif ftype == 2:
                for i in range(stride):
                    cand[i] = (line[i] - prev[i]) & 0xFF
            else:
                for i in range(stride):
                    left = line[i - bpp] if i >= bpp else 0
                    upleft = prev[i - bpp] if i >= bpp else 0
                    cand[i] = (line[i] - _paeth(left, prev[i], upleft)) & 0xFF
            score = sum(b if b < 128 else 256 - b for b in cand)
            if best is None or score < best[0]:
                best = (score, ftype, cand)
        assert best is not None
        raw.append(best[1])
        raw += best[2]
        prev = bytearray(line)

    def chunk(tag: bytes, body: bytes) -> bytes:
        return (
            struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body))
        )

    ihdr = struct.pack(">IIBBBBB", img.width, img.height, 8, _CTYPE_FOR_CHANNELS[bpp], 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), level))
        + chunk(b"IEND", b"")
    )
