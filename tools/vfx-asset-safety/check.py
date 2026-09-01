#!/usr/bin/env python3
"""Fail closed when a shipped VFX/model texture can paint a rectangular backdrop.

This is the build-time counterpart of the VFX Forge ``AssetSafetyGate``.  The
editor prevents an author from saving a newly selected unsafe asset; this tool
checks the complete shipped collections so an old/default binding cannot bypass
that UI seam and appear in an actual match.

The decision is made under the authored blend equation.  Additive sprites need
black/transparent carrier edges, alpha sprites need transparent edges, and
modulate sprites need white/transparent edges.  GLB materials with a transparent
atlas must not be OPAQUE; bright pixels hidden under alpha are also rejected on
emissive materials because emission can reveal the matte in Babylon.
"""
from __future__ import annotations

import argparse
import io
import json
import struct
import sys
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops

try:  # vectorised fast path; the exact scalar fallback remains the oracle
    import numpy as np
except ImportError:  # pragma: no cover - CI image normally includes numpy
    np = None

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"

MIN_NEUTRAL_SHARE = 0.001
MIN_NEUTRAL_EDGE_SHARE = 0.25
NEUTRAL_CODE_VALUE = 1 / 255
ALPHA_BACKGROUND_MAX = 5
BRIGHT_MATTE_MIN = 8
MIN_BACKGROUND_SHARE = 0.02
MAX_BRIGHT_BACKGROUND_SHARE = 0.001
OPAQUE_CARRIER_EDGE_SHARE = 0.60
OPAQUE_CARRIER_TOTAL_SHARE = 0.10
PLANAR_THICKNESS_RATIO = 0.02
CARRIER_COLOR_SHIFT = 5


def rgba_pixels(image: Image.Image):
    rgba = image.convert("RGBA")
    if np is not None:
        return rgba.width, rgba.height, np.asarray(rgba, dtype=np.uint8)
    return rgba.width, rgba.height, list(rgba.get_flattened_data())


def colors_of(doc: dict) -> list[list[float]]:
    if doc.get("colorStops"):
        return [stop[1] for stop in doc["colorStops"]]
    color = doc.get("color")
    if isinstance(color, list):
        return [color]
    if isinstance(color, dict) and "start" in color:
        return [color["start"], color["end"]]
    return [[1, 1, 1, 1]]


def compositing_neutral(mode: str, colors: list[list[float]], pixel: tuple[int, int, int, int]) -> bool:
    tex = [channel / 255 for channel in pixel]
    contribution = 0.0
    for color in colors:
        if mode == "additive":
            contribution = max(contribution, tex[0] * color[0], tex[1] * color[1], tex[2] * color[2])
        elif mode in ("alpha", "alphaKey"):
            contribution = max(contribution, tex[3] * color[3])
        elif mode == "modulate":
            for channel in range(3):
                contribution = max(contribution, tex[3] * color[3] * (1 - tex[channel] * color[channel]))
        else:
            raise ValueError(f"unknown blendMode {mode!r}")
    return contribution < NEUTRAL_CODE_VALUE


def neutral_shares(width: int, height: int, pixels, mode: str,
                   colors: list[list[float]]) -> tuple[float, float]:
    if np is not None and isinstance(pixels, np.ndarray):
        tex = pixels.astype(np.float32) / 255.0
        palette = np.asarray(colors, dtype=np.float32)
        if mode == "additive":
            contribution = np.max(tex[..., None, :3] * palette[None, None, :, :3], axis=(2, 3))
        elif mode in ("alpha", "alphaKey"):
            contribution = tex[..., 3] * float(np.max(palette[:, 3]))
        elif mode == "modulate":
            delta = (
                tex[..., 3, None, None] * palette[None, None, :, 3, None]
                * (1 - tex[..., None, :3] * palette[None, None, :, :3])
            )
            contribution = np.max(delta, axis=(2, 3))
        else:
            raise ValueError(f"unknown blendMode {mode!r}")
        neutral = contribution < NEUTRAL_CODE_VALUE
        edge = np.zeros((height, width), dtype=bool)
        edge[0, :] = edge[-1, :] = True
        edge[:, 0] = edge[:, -1] = True
        return float(np.mean(neutral)), float(np.mean(neutral[edge]))

    neutral = 0
    neutral_edge = 0
    edge_pixels = 0
    for index, pixel in enumerate(pixels):
        x, y = index % width, index // width
        is_neutral = compositing_neutral(mode, colors, pixel)
        neutral += int(is_neutral)
        if x == 0 or y == 0 or x == width - 1 or y == height - 1:
            edge_pixels += 1
            neutral_edge += int(is_neutral)
    return neutral / len(pixels), neutral_edge / edge_pixels if edge_pixels else 0


def audit_vfx() -> list[tuple[Path | None, str]]:
    """Return ``(texture_path, message)``; missing/invalid docs use ``None``."""
    findings: list[tuple[Path | None, str]] = []
    decoded: dict[Path, tuple[int, int, object]] = {}
    measured: dict[tuple[Path, str, tuple[tuple[float, ...], ...]], tuple[float, float]] = {}
    for path in sorted((CONTENT / "vfx").glob("*.json")):
        if path.name.startswith("_"):
            continue
        doc = json.loads(path.read_text())
        texture = doc.get("texture")
        if not texture:
            continue
        blend = doc.get("blendMode")
        if not blend:
            findings.append((None, f"vfx:{doc.get('id', path.stem)}: missing blendMode"))
            continue
        texture_path = CONTENT / texture
        if not texture_path.is_file():
            findings.append((None, f"vfx:{doc.get('id', path.stem)}: missing {texture}"))
            continue
        colors = colors_of(doc)
        key = (texture_path, blend, tuple(tuple(color) for color in colors))
        cached_measure = measured.get(key)
        if cached_measure is None:
            try:
                if texture_path not in decoded:
                    with Image.open(texture_path) as source:
                        decoded[texture_path] = rgba_pixels(source)
                width, height, pixels = decoded[texture_path]
            except Exception as exc:  # fail closed on undecodable content
                findings.append((texture_path, f"vfx:{doc.get('id', path.stem)}: decode failed {texture}: {exc}"))
                continue
            cached_measure = neutral_shares(width, height, pixels, blend, colors)
            measured[key] = cached_measure
        share, edge_share = cached_measure
        if share < MIN_NEUTRAL_SHARE or edge_share < MIN_NEUTRAL_EDGE_SHARE:
            findings.append((
                texture_path,
                f"vfx:{doc.get('id', path.stem)}: TEXTURE_BACKDROP {texture} {blend} "
                f"neutral={share * 100:.3f}% edge={edge_share * 100:.1f}%",
            ))
    return findings


def check_vfx() -> list[str]:
    return [message for _path, message in audit_vfx()]


def glb_chunks(data: bytes) -> tuple[dict, bytes]:
    if len(data) < 20 or struct.unpack_from("<II", data, 0) != (0x46546C67, 2):
        raise ValueError("not GLB v2")
    offset, doc, binary = 12, None, None
    while offset + 8 <= len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        end = offset + 8 + size
        if end > len(data):
            raise ValueError("chunk outside file")
        body = data[offset + 8:end]
        if kind == 0x4E4F534A:
            doc = json.loads(body.rstrip(b" \0"))
        elif kind == 0x004E4942:
            binary = body
        offset = (end + 3) & ~3
    if doc is None or binary is None:
        raise ValueError("missing JSON/BIN chunk")
    return doc, binary


def embedded_image(doc: dict, binary: bytes, image_index: int) -> Image.Image:
    image = doc.get("images", [])[image_index]
    if image.get("uri"):
        raise ValueError("external image URI cannot prove package safety")
    view = doc.get("bufferViews", [])[image["bufferView"]]
    start = view.get("byteOffset", 0)
    raw = binary[start:start + view["byteLength"]]
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def material_is_planar_card(doc: dict, material_index: int) -> bool:
    """True only when every primitive using the material is effectively flat.

    An opaque colour atlas on a real 3D body is normal. The backdrop failure is
    specifically a camera-facing/card-like primitive whose rectangular image
    carrier remains visible, so geometry is part of the proof.
    """
    found = False
    for mesh in doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if primitive.get("material") != material_index:
                continue
            found = True
            position = primitive.get("attributes", {}).get("POSITION")
            if not isinstance(position, int):
                return False
            accessors = doc.get("accessors", [])
            if position >= len(accessors):
                return False
            accessor = accessors[position]
            lo, hi = accessor.get("min"), accessor.get("max")
            if not (isinstance(lo, list) and isinstance(hi, list) and len(lo) >= 3 and len(hi) >= 3):
                return False
            extents = sorted(abs(float(hi[i]) - float(lo[i])) for i in range(3))
            if extents[2] <= 1e-6 or extents[0] > extents[2] * PLANAR_THICKNESS_RATIO:
                return False
    return found


def opaque_carrier_shares(image: Image.Image) -> tuple[float, float]:
    """Share of the dominant opaque edge colour overall and on a 5% border."""
    rgba = image.convert("RGBA")
    if np is not None:
        px = np.asarray(rgba, dtype=np.uint8)
        rgb = px[..., :3].astype(np.uint16)
        buckets = ((rgb[..., 0] >> CARRIER_COLOR_SHIFT) << 6) | ((rgb[..., 1] >> CARRIER_COLOR_SHIFT) << 3) | (rgb[..., 2] >> CARRIER_COLOR_SHIFT)
        opaque = px[..., 3] >= 250
        border = max(1, round(min(rgba.width, rgba.height) * 0.05))
        edge = np.zeros((rgba.height, rgba.width), dtype=bool)
        edge[:border, :] = edge[-border:, :] = True
        edge[:, :border] = edge[:, -border:] = True
        edge_buckets = buckets[edge & opaque]
        if edge_buckets.size == 0:
            return 0.0, 0.0
        dominant = int(np.bincount(edge_buckets, minlength=512).argmax())
        carrier = opaque & (buckets == dominant)
        return float(carrier.mean()), float(carrier[edge].mean())
    pixels = list(rgba.get_flattened_data())
    border = max(1, round(min(rgba.width, rgba.height) * 0.05))
    total = edge_total = 0
    bins: dict[int, list[int]] = {}
    for index, (r, g, b, a) in enumerate(pixels):
        x, y = index % rgba.width, index // rgba.width
        is_edge = x < border or y < border or x >= rgba.width - border or y >= rgba.height - border
        total += 1
        if is_edge:
            edge_total += 1
        if a >= 250:
            key = ((r >> CARRIER_COLOR_SHIFT) << 6) | ((g >> CARRIER_COLOR_SHIFT) << 3) | (b >> CARRIER_COLOR_SHIFT)
            count = bins.setdefault(key, [0, 0])
            count[0] += 1
            count[1] += int(is_edge)
    carrier = max(bins.values(), key=lambda item: item[1], default=[0, 0])
    return carrier[0] / total, carrier[1] / edge_total if edge_total else 0


def check_model_doc(path: Path, seen: set[Path]) -> list[str]:
    doc = json.loads(path.read_text())
    asset_id = doc.get("id", path.stem)
    glb_rel = doc.get("glbPath")
    if not glb_rel:
        return [f"model:{asset_id}: missing glbPath"]
    glb = (CONTENT / glb_rel).resolve()
    if glb in seen:
        return []
    seen.add(glb)
    if not glb.is_file():
        return [f"model:{asset_id}: missing {glb_rel}"]
    try:
        gltf, binary = glb_chunks(glb.read_bytes())
    except Exception as exc:
        return [f"model:{asset_id}: decode failed {glb_rel}: {exc}"]
    failures: list[str] = []
    effect_model = bool(doc.get("fxEmitters"))
    cache: dict[int, tuple[float, float, float, float]] = {}
    for material_index, material in enumerate(gltf.get("materials", [])):
        alpha_mode = material.get("alphaMode", "OPAQUE")
        emissive = max(material.get("emissiveFactor", [0]))
        # Opaque needs its alpha inspected; a transparent non-emissive material
        # cannot expose hidden bright RGB, so decoding it would spend most of
        # the gate's time proving an already-safe case.
        if alpha_mode != "OPAQUE" and emissive <= 0 and not effect_model:
            continue
        texture_index = (material.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("index"))
        if not isinstance(texture_index, int):
            continue
        try:
            image_index = gltf.get("textures", [])[texture_index]["source"]
            if image_index not in cache:
                image = embedded_image(gltf, binary, image_index)
                red, green, blue, alpha = image.split()
                pixels = image.width * image.height
                alpha_background = alpha.point(lambda value: 255 if value <= ALPHA_BACKGROUND_MAX else 0)
                brightest = ImageChops.lighter(ImageChops.lighter(red, green), blue)
                bright = brightest.point(lambda value: 255 if value > BRIGHT_MATTE_MIN else 0)
                bright_background = ImageChops.multiply(alpha_background, bright)
                background_share = alpha_background.histogram()[255] / pixels
                bright_share = bright_background.histogram()[255] / pixels
                carrier_share, carrier_edge_share = opaque_carrier_shares(image)
                cache[image_index] = (background_share, bright_share, carrier_share, carrier_edge_share)
                image.close()
            background_share, bright_share, carrier_share, carrier_edge_share = cache[image_index]
        except Exception as exc:
            failures.append(f"model:{asset_id}: mat{material_index} texture decode failed: {exc}")
            continue
        if background_share < MIN_BACKGROUND_SHARE:
            if (
                (material_is_planar_card(gltf, material_index) or emissive > 0 or effect_model)
                and carrier_share >= OPAQUE_CARRIER_TOTAL_SHARE
                and carrier_edge_share >= OPAQUE_CARRIER_EDGE_SHARE
            ):
                failures.append(
                    f"model:{asset_id}: MODEL_TEXTURE_BACKDROP mat{material_index}:{material.get('name', '?')} "
                    f"{alpha_mode} planar carrier={carrier_share * 100:.2f}% edge={carrier_edge_share * 100:.1f}%"
                )
            continue
        name = material.get("name", "?")
        if alpha_mode == "OPAQUE":
            failures.append(
                f"model:{asset_id}: MODEL_TEXTURE_BACKDROP mat{material_index}:{name} "
                f"transparent={background_share * 100:.2f}% alphaMode=OPAQUE"
            )
            continue
        if emissive <= 0:
            continue
        if bright_share >= MAX_BRIGHT_BACKGROUND_SHARE:
            failures.append(
                f"model:{asset_id}: MODEL_TEXTURE_BACKDROP mat{material_index}:{name} "
                f"emissive bright-matte={bright_share * 100:.2f}%"
            )
    return failures


def check_models() -> list[str]:
    failures: list[str] = []
    seen: set[Path] = set()
    for path in sorted((CONTENT / "models").glob("*.json")):
        if path.name.startswith("_"):
            continue
        failures.extend(check_model_doc(path, seen))
    return failures


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="machine-readable report")
    parser.add_argument("--scope", choices=("all", "vfx", "models"), default="all")
    args = parser.parse_args(argv)
    failures: list[str] = []
    if args.scope in ("all", "vfx"):
        failures.extend(check_vfx())
    if args.scope in ("all", "models"):
        failures.extend(check_models())
    if args.json:
        print(json.dumps({"ok": not failures, "failures": failures}, ensure_ascii=False, indent=2))
    else:
        for failure in failures:
            print(f"FAIL {failure}")
        print(f"vfx-asset-safety: {'PASS' if not failures else 'FAIL'} ({len(failures)} blocker(s))")
    return int(bool(failures))


if __name__ == "__main__":
    sys.exit(main())
