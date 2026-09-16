#!/usr/bin/env python3
"""Catalog and visually sample Popp VFX reconstruction support textures.

This workflow inspects every exported TGA/HDR occurrence, verifies the byte pin
from the source manifest, groups byte-identical images without losing package
relationships, and emits a small Git index plus a deterministic contact sheet.
It does not convert Niagara systems or create GGD VFX.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageStat, __version__ as PILLOW_VERSION


REPO = Path(__file__).resolve().parents[4]
LIBRARY = REPO.parent / "GGD-Asset-Library"
EXPORT_ROOT = LIBRARY / "conversions/infinity-strash-popp-vfx-dependency-export-v1"
OUTPUT = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1"
CATALOG_NAME = "dependency-support-catalog.json"
RECEIPT_NAME = "dependency-support-catalog-receipt.json"
SHEET_NAME = "dependency-support-contact-sheet.png"
SCHEMA = "ggd.infinity-strash-popp-vfx-support-catalog@1"
RECEIPT_SCHEMA = "ggd.infinity-strash-popp-vfx-support-catalog-receipt@1"
GROUP_ORDER = ("Alpha", "Color", "Normal", "HDR", "Flow", "Utility", "Other")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pin(path: Path, relative_to: Path | None = None) -> dict:
    result = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    if relative_to is None:
        result["absolutePath"] = str(path.resolve())
    else:
        result["path"] = path.relative_to(relative_to).as_posix()
    return result


def parse_hdr(path: Path) -> tuple[dict, Image.Image]:
    """Fully decode the flat or modern-RLE RGBE forms produced by UModel."""
    data = path.read_bytes()
    separator = data.find(b"\n\n")
    if separator < 0:
        raise ValueError("missing Radiance header terminator")
    header = data[:separator].decode("ascii", errors="strict").splitlines()
    if not header or header[0] not in ("#?RADIANCE", "#?RGBE"):
        raise ValueError("missing Radiance magic")
    if "FORMAT=32-bit_rle_rgbe" not in header:
        raise ValueError("unsupported Radiance pixel format")
    resolution_end = data.find(b"\n", separator + 2)
    if resolution_end < 0:
        raise ValueError("missing Radiance resolution line")
    resolution = data[separator + 2 : resolution_end].decode("ascii", errors="strict")
    match = re.fullmatch(r"-Y\s+(\d+)\s+\+X\s+(\d+)", resolution)
    if not match:
        raise ValueError(f"unsupported Radiance orientation: {resolution}")
    height, width = map(int, match.groups())
    payload = memoryview(data)[resolution_end + 1 :]
    pixels: list[tuple[int, int, int, int]] = []

    # UModel currently emits flat RGBE for narrow images. Keep a decoder for
    # standard Radiance scanline RLE so this remains useful when inputs change.
    if len(payload) == width * height * 4:
        pixels = [tuple(payload[index : index + 4]) for index in range(0, len(payload), 4)]
    else:
        offset = 0
        for _ in range(height):
            if offset + 4 > len(payload):
                raise ValueError("truncated Radiance scanline header")
            marker = bytes(payload[offset : offset + 4])
            offset += 4
            if marker[:2] != b"\x02\x02" or ((marker[2] << 8) | marker[3]) != width:
                raise ValueError("unsupported or malformed Radiance scanline")
            channels: list[list[int]] = []
            for _channel in range(4):
                values: list[int] = []
                while len(values) < width:
                    if offset >= len(payload):
                        raise ValueError("truncated Radiance RLE packet")
                    code = payload[offset]
                    offset += 1
                    if code > 128:
                        count = code - 128
                        if count == 0 or offset >= len(payload):
                            raise ValueError("invalid Radiance RLE repeat")
                        value = payload[offset]
                        offset += 1
                        values.extend([value] * count)
                    else:
                        count = code
                        if count == 0 or offset + count > len(payload):
                            raise ValueError("invalid Radiance RLE literal")
                        values.extend(payload[offset : offset + count])
                        offset += count
                if len(values) != width:
                    raise ValueError("Radiance scanline width mismatch")
                channels.append(values)
            pixels.extend(zip(*channels))
        if offset != len(payload):
            raise ValueError("trailing bytes after Radiance scanlines")

    if len(pixels) != width * height:
        raise ValueError("Radiance decoded pixel count mismatch")
    floats: list[tuple[float, float, float]] = []
    for red, green, blue, exponent in pixels:
        scale = math.ldexp(1.0, exponent - (128 + 8)) if exponent else 0.0
        floats.append((red * scale, green * scale, blue * scale))
    flattened = [value for pixel in floats for value in pixel]
    maximum = max(flattened, default=0.0)
    minimum = min(flattened, default=0.0)
    mean = statistics.fmean(flattened) if flattened else 0.0
    luminance = [0.2126 * red + 0.7152 * green + 0.0722 * blue for red, green, blue in floats]
    luma_stddev = statistics.pstdev(luminance) if len(luminance) > 1 else 0.0
    scale = maximum or 1.0
    preview = bytearray()
    for pixel in floats:
        for value in pixel:
            preview.append(round(255 * pow(max(0.0, value / scale), 1 / 2.2)))
    image = Image.frombytes("RGB", (width, height), bytes(preview))
    return (
        {
            "format": "Radiance HDR",
            "width": width,
            "height": height,
            "mode": "RGBE",
            "channels": 3,
            "channelNames": ["R", "G", "B"],
            "hasAlphaChannel": False,
            "alpha": None,
            "valueRange": [minimum, maximum],
            "meanValue": mean,
            "lumaStdDev": luma_stddev,
            "readable": True,
        },
        image,
    )


def inspect_image(path: Path) -> tuple[dict, Image.Image]:
    if path.suffix.lower() == ".hdr":
        return parse_hdr(path)
    if path.suffix.lower() != ".tga":
        raise ValueError(f"unsupported exported image type: {path.suffix}")
    with Image.open(path) as source:
        source.load()  # Full decode, rather than header-only verification.
        bands = list(source.getbands())
        extrema = source.getextrema()
        alpha = None
        if "A" in bands:
            alpha_channel = source.getchannel("A")
            histogram = alpha_channel.histogram()
            total = source.width * source.height
            alpha = {
                "min": extrema[bands.index("A")][0],
                "max": extrema[bands.index("A")][1],
                "transparentPixels": histogram[0],
                "nonOpaquePixels": total - histogram[255],
                "opaquePixels": histogram[255],
            }
        rgb = source.convert("RGB")
        luma_stddev = ImageStat.Stat(rgb.convert("L")).stddev[0]
        return (
            {
                "format": source.format,
                "width": source.width,
                "height": source.height,
                "mode": source.mode,
                "channels": len(bands),
                "channelNames": bands,
                "hasAlphaChannel": "A" in bands,
                "alpha": alpha,
                "valueRange": None,
                "meanValue": None,
                "lumaStdDev": luma_stddev,
                "readable": True,
            },
            source.convert("RGBA"),
        )


def semantic_group(paths: list[str], references: list[str], suffix: str) -> tuple[str, str]:
    evidence = " ".join(paths + references).lower()
    if suffix == ".hdr" or "/texture/hdr/" in evidence:
        return "HDR", "file extension or source path identifies HDR data"
    if "flowmap" in evidence or "flownoise" in evidence or "/flow/" in evidence:
        return "Flow", "source name identifies a flow map or flow noise"
    if "/texture/normal/" in evidence or "normal" in evidence:
        return "Normal", "source path or name identifies normal data"
    if "/texture/color/" in evidence or "/texture/dq11/" in evidence:
        return "Color", "source path identifies color data"
    if "/texture/alpha/" in evidence or any(
        token in evidence
        for token in ("mask", "gradient", "gradation", "noise", "vanish", "smoke", "aura", "flare", "flash", "radial")
    ):
        return "Alpha", "source path or name identifies mask/alpha shaping data"
    if "/engine/" in evidence or "debugnumber" in evidence or "flipbook" in evidence or "defaultdiffuse" in evidence:
        return "Utility", "engine/debug support texture"
    return "Other", "no stronger semantic category is proven by source naming"


def checkerboard(size: tuple[int, int], block: int = 12) -> Image.Image:
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], block):
        for x in range(0, size[0], block):
            shade = 72 if (x // block + y // block) % 2 else 112
            draw.rectangle((x, y, x + block - 1, y + block - 1), fill=(shade, shade, shade))
    return image


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    background = checkerboard(size)
    x = (size[0] - copy.width) // 2
    y = (size[1] - copy.height) // 2
    if copy.mode == "RGBA":
        background.paste(copy, (x, y), copy)
    else:
        background.paste(copy.convert("RGB"), (x, y))
    return background


def make_contact_sheet(unique_assets: list[dict], previews: dict[str, Image.Image]) -> bytes:
    font = ImageFont.load_default()
    selected: list[dict] = []
    for group in GROUP_ORDER:
        candidates = [asset for asset in unique_assets if asset["semanticGroup"] == group]
        candidates.sort(
            key=lambda asset: (
                asset["inspection"]["width"] * asset["inspection"]["height"] > 4,
                asset["inspection"]["lumaStdDev"],
                asset["occurrenceCount"],
                asset["sha256"],
            ),
            reverse=True,
        )
        selected.extend(candidates[:6])
    columns, tile_width, tile_height = 6, 240, 190
    rows = max(1, math.ceil(len(selected) / columns))
    sheet = Image.new("RGB", (columns * tile_width, 54 + rows * tile_height), (25, 28, 34))
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 12), "Popp VFX dependency support textures", fill=(245, 245, 245), font=font)
    draw.text((16, 31), "Reconstruction inputs only; no Niagara/GGD VFX binding or deployment", fill=(255, 190, 90), font=font)
    for index, asset in enumerate(selected):
        column, row = index % columns, index // columns
        left, top = column * tile_width, 54 + row * tile_height
        preview = contain(previews[asset["sha256"]], (220, 132))
        sheet.paste(preview, (left + 10, top + 8))
        name = Path(asset["representativePath"]).name
        if len(name) > 32:
            name = name[:29] + "..."
        draw.text((left + 10, top + 145), f"{asset['semanticGroup']} | {name}", fill=(235, 235, 235), font=font)
        inspection = asset["inspection"]
        draw.text(
            (left + 10, top + 162),
            f"{inspection['width']}x{inspection['height']} {inspection['channels']}ch | refs {asset['occurrenceCount']}",
            fill=(175, 185, 198),
            font=font,
        )
    output = io.BytesIO()
    sheet.save(output, format="PNG", optimize=False, compress_level=9)
    return output.getvalue()


def build_catalog(export_root: Path) -> tuple[dict, bytes]:
    manifest_path = export_root / "source-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("schema") != "ggd.infinity-strash-popp-vfx-dependency-export@1":
        raise ValueError("unexpected dependency-export manifest schema")
    if manifest.get("states", {}).get("ggdVfxConverted") is not False:
        raise ValueError("source manifest no longer has the expected unconverted VFX state")

    package_by_file: dict[str, dict] = {}
    for package in manifest["rows"]:
        for produced in package["producedFiles"]:
            path = produced["path"]
            if path in package_by_file:
                raise ValueError(f"duplicate source-manifest path relation: {path}")
            package_by_file[path] = package
    listed = {row["path"]: row for row in manifest["files"]}
    if set(listed) != set(package_by_file):
        raise ValueError("source manifest file/package relationship drift")

    by_hash: dict[str, list[dict]] = defaultdict(list)
    previews: dict[str, Image.Image] = {}
    occurrence_rows: list[dict] = []
    for relative_path in sorted(listed):
        source_pin = listed[relative_path]
        path = export_root / relative_path
        if not path.is_file():
            raise ValueError(f"missing exported support file: {path}")
        current_sha = sha256(path)
        if path.stat().st_size != source_pin["bytes"] or current_sha != source_pin["sha256"]:
            raise ValueError(f"exported support file hash drift: {path}")
        inspection, preview = inspect_image(path)
        package = package_by_file[relative_path]
        occurrence = {
            "path": relative_path,
            "bytes": source_pin["bytes"],
            "sha256": current_sha,
            "packageReference": package["reference"],
            "pakStem": package["pakStem"],
            "inspection": inspection,
        }
        occurrence_rows.append(occurrence)
        by_hash[current_sha].append(occurrence)
        previews.setdefault(current_sha, preview)

    unique_assets: list[dict] = []
    for digest in sorted(by_hash):
        occurrences = by_hash[digest]
        paths = sorted(row["path"] for row in occurrences)
        references = sorted({row["packageReference"] for row in occurrences})
        representative = min(paths, key=lambda value: (len(value), value))
        suffix = Path(representative).suffix.lower()
        group, reason = semantic_group(paths, references, suffix)
        unique_assets.append(
            {
                "assetId": f"popp-vfx-support-{digest[:16]}",
                "sha256": digest,
                "bytes": occurrences[0]["bytes"],
                "extension": suffix,
                "semanticGroup": group,
                "semanticGroupBasis": reason,
                "representativePath": representative,
                "occurrenceCount": len(occurrences),
                "packageReferenceCount": len(references),
                "packageReferences": references,
                "paths": paths,
                "inspection": occurrences[0]["inspection"],
            }
        )
    group_counts = Counter(row["semanticGroup"] for row in unique_assets)
    format_counts = Counter(row["inspection"]["format"] for row in occurrence_rows)
    channel_counts = Counter(str(row["inspection"]["channels"]) for row in occurrence_rows)
    alpha_occurrences = [row for row in occurrence_rows if row["inspection"]["hasAlphaChannel"]]
    catalog = {
        "schema": SCHEMA,
        "sourceId": "steam-infinity-strash-popp-vfx-dependency-support-catalog-local-20240328",
        "sourceManifest": pin(manifest_path),
        "exportRoot": str(export_root.resolve()),
        "analyzer": {
            **pin(Path(__file__).resolve()),
            "python": "3.10+",
            "Pillow": PILLOW_VERSION,
        },
        "summary": {
            "fileOccurrencesInspected": len(occurrence_rows),
            "fileOccurrencesReadable": sum(row["inspection"]["readable"] for row in occurrence_rows),
            "uniqueByteAssets": len(unique_assets),
            "duplicateOccurrencesCollapsed": len(occurrence_rows) - len(unique_assets),
            "uniqueSemanticGroupCounts": {group: group_counts[group] for group in GROUP_ORDER if group_counts[group]},
            "occurrenceFormatCounts": dict(sorted(format_counts.items())),
            "occurrenceChannelCounts": dict(sorted(channel_counts.items())),
            "occurrencesWithPhysicalAlphaChannel": len(alpha_occurrences),
            "occurrencesWithAnyNonOpaquePixels": sum(
                row["inspection"]["alpha"]["nonOpaquePixels"] > 0 for row in alpha_occurrences
            ),
            "sourcePackageRelationsPreserved": len(package_by_file),
        },
        "states": {
            "supportTexturesCataloged": True,
            "allExportedTgaHdrReadable": all(row["inspection"]["readable"] for row in occurrence_rows),
            "byteDuplicatesGrouped": True,
            "packageAndSourcePathRelationsPreserved": True,
            "reconstructionSupportOnly": True,
            "niagaraSystemsConverted": False,
            "ggdVfxConverted": False,
            "skillBound": False,
            "runtimeSelectable": False,
            "deployed": False,
        },
        "classificationNote": "Semantic groups come from source package paths and filenames. Alpha is a usage class and does not imply that the decoded file physically contains an alpha channel.",
        "claim": "This index proves byte-pinned image readability and cataloging of reconstruction support textures only. It does not prove Niagara conversion, a GGD VFX asset, visual equivalence, skill binding, runtime availability, or deployment.",
        "uniqueAssets": unique_assets,
        "occurrences": occurrence_rows,
        "generatedFromSourceManifestCreatedAt": manifest.get("createdAt"),
    }
    sheet = make_contact_sheet(unique_assets, previews)
    return catalog, sheet


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def build_receipt(catalog_bytes: bytes, sheet_bytes: bytes, catalog: dict) -> dict:
    return {
        "schema": RECEIPT_SCHEMA,
        "sourceId": catalog["sourceId"],
        "catalog": {"path": CATALOG_NAME, "bytes": len(catalog_bytes), "sha256": sha256_bytes(catalog_bytes)},
        "contactSheet": {"path": SHEET_NAME, "bytes": len(sheet_bytes), "sha256": sha256_bytes(sheet_bytes)},
        "sourceManifest": catalog["sourceManifest"],
        "analyzer": catalog["analyzer"],
        "summary": catalog["summary"],
        "states": catalog["states"],
        "claim": catalog["claim"],
    }


def write_or_check(export_root: Path, output: Path, check: bool) -> dict:
    catalog, sheet_bytes = build_catalog(export_root)
    catalog_bytes = json_bytes(catalog)
    receipt_bytes = json_bytes(build_receipt(catalog_bytes, sheet_bytes, catalog))
    expected = {
        CATALOG_NAME: catalog_bytes,
        SHEET_NAME: sheet_bytes,
        RECEIPT_NAME: receipt_bytes,
    }
    if check:
        for name, data in expected.items():
            path = output / name
            if not path.is_file() or path.read_bytes() != data:
                raise ValueError(f"generated support catalog output is stale: {path}")
    else:
        output.mkdir(parents=True, exist_ok=True)
        for name, data in expected.items():
            (output / name).write_bytes(data)
    return catalog["summary"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-root", type=Path, default=EXPORT_ROOT)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    summary = write_or_check(args.export_root.resolve(), args.output.resolve(), args.check)
    print(json.dumps({"status": "current" if args.check else "written", **summary}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
