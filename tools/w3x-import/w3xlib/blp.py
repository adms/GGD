"""BLP1 → PNG decoder (Warcraft III 1.26 textures).

Two BLP1 variants exist:
  compression 0 — JPEG content: shared JPEG header + per-mip payload. The JPEG
    encodes channels in B,G,R(,A) order, so decoded output needs an R/B swap.
  compression 1 — 256-color palette (BGRA entries) + index plane, plus an
    8-bit alpha plane when pictureType is 3 or 4.
Uses Pillow for JPEG decode + PNG encode.
"""

from __future__ import annotations

import io
import struct

from PIL import Image


def decode_blp(data: bytes) -> Image.Image:
    magic = data[:4]
    if magic != b"BLP1":
        if magic == b"BLP2":
            raise ValueError("BLP2 not supported (unexpected for wc3 1.26)")
        raise ValueError(f"not a BLP file ({magic!r})")
    compression, alpha_bits, width, height, pic_type, _sub = struct.unpack_from(
        "<6I", data, 4
    )
    mip_offsets = struct.unpack_from("<16I", data, 28)
    mip_sizes = struct.unpack_from("<16I", data, 92)

    if compression == 0:  # JPEG
        header_size = struct.unpack_from("<I", data, 156)[0]
        jpeg_header = data[160 : 160 + header_size]
        mip0 = data[mip_offsets[0] : mip_offsets[0] + mip_sizes[0]]
        img = Image.open(io.BytesIO(jpeg_header + mip0))
        img.load()
        if img.mode == "CMYK":
            # Raw 4-component JPEG: bands are B,G,R,A stored inverted
            # (libjpeg/Pillow treats them as CMYK without un-inverting).
            # Verified empirically against known character art.
            from PIL import ImageOps

            b, g, r, a = (ImageOps.invert(band) for band in img.split())
            img = Image.merge("RGBA", (r, g, b, a))
        else:
            img = img.convert("RGB")
            r, g, b = img.split()
            img = Image.merge("RGB", (b, g, r))
        return img

    if compression == 1:  # paletted
        palette = []
        for i in range(256):
            b, g, r, a = struct.unpack_from("<4B", data, 156 + i * 4)
            palette.append((r, g, b))
        n = width * height
        idx = data[mip_offsets[0] : mip_offsets[0] + n]
        has_alpha = pic_type in (3, 4) and alpha_bits != 0
        px = bytearray()
        if has_alpha:
            alpha = data[mip_offsets[0] + n : mip_offsets[0] + 2 * n]
            for i in range(n):
                r, g, b = palette[idx[i]]
                px += bytes((r, g, b, alpha[i] if i < len(alpha) else 255))
            return Image.frombytes("RGBA", (width, height), bytes(px))
        for i in range(n):
            px += bytes(palette[idx[i]])
        return Image.frombytes("RGB", (width, height), bytes(px))

    raise ValueError(f"unknown BLP compression {compression}")


def blp_to_png(blp_data: bytes, png_path: str) -> tuple[int, int]:
    img = decode_blp(blp_data)
    img.save(png_path, "PNG")
    return img.size
