#!/usr/bin/env python3
"""Publish verified runtime-v2 candidates and previews into Git-tracked paths."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import struct
from pathlib import Path
from typing import Any


SCHEMA = "ggd.heros-bonds-published-candidates@1"
CHARACTER_IDS = ("ch027005800", "ch027005801")
PREVIEW_VIEWS = ("front", "side", "back")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError(f"truncated GLB: {path}")
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or total_length != len(data):
        raise ValueError(f"invalid GLB 2 header: {path}")
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise ValueError(f"first GLB chunk is not JSON: {path}")
    document = json.loads(data[20 : 20 + json_length].decode("utf-8"))
    offset = 20 + json_length
    binary = b""
    if offset + 8 <= len(data):
        binary_length, binary_type = struct.unpack_from("<I4s", data, offset)
        if binary_type == b"BIN\0":
            binary = data[offset + 8 : offset + 8 + binary_length]
    return document, binary


def png_dimensions(data: bytes) -> tuple[int, int]:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("embedded image is not a PNG with IHDR")
    return struct.unpack(">II", data[16:24])


def glb_metrics(path: Path) -> dict[str, int]:
    document, binary = read_glb(path)
    accessors = document.get("accessors", [])
    triangle_count = 0
    primitive_count = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            mode = primitive.get("mode", 4)
            if mode != 4:
                raise ValueError(f"unsupported non-triangle primitive mode {mode}: {path}")
            primitive_count += 1
            if "indices" in primitive:
                count = accessors[primitive["indices"]]["count"]
            else:
                count = accessors[primitive["attributes"]["POSITION"]]["count"]
            if count % 3:
                raise ValueError(f"triangle index count is not divisible by three: {path}")
            triangle_count += count // 3

    dimensions = []
    buffer_views = document.get("bufferViews", [])
    for image in document.get("images", []):
        if image.get("mimeType") != "image/png" or "bufferView" not in image:
            raise ValueError(f"candidate image is not an embedded PNG: {path}")
        view = buffer_views[image["bufferView"]]
        start = view.get("byteOffset", 0)
        end = start + view["byteLength"]
        dimensions.append(png_dimensions(binary[start:end]))
    return {
        "triangleCount": triangle_count,
        "meshCount": len(document.get("meshes", [])),
        "skinnedPrimitiveCount": primitive_count,
        "embeddedImageCount": len(dimensions),
        "maxTextureDimension": max((max(pair) for pair in dimensions), default=0),
        "skinCount": len(document.get("skins", [])),
        "animationCount": len(document.get("animations", [])),
    }


def git_path(path: Path, repo_root: Path) -> str:
    try:
        return path.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError as error:
        raise ValueError(f"published path is outside repository: {path}") from error


def copy_verified(source: Path, destination: Path, expected_sha256: str) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    actual = sha256_file(source)
    if actual != expected_sha256:
        raise ValueError(f"SHA-256 mismatch for {source}: expected {expected_sha256}, got {actual}")
    if destination.is_file() and sha256_file(destination) == actual:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    shutil.copyfile(source, temporary)
    if sha256_file(temporary) != actual:
        temporary.unlink(missing_ok=True)
        raise ValueError(f"copy verification failed for {destination}")
    os.replace(temporary, destination)


def load_by_character(paths: list[Path], path_field: str) -> dict[str, tuple[Path, dict]]:
    result = {}
    for receipt_path in paths:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        character_id = Path(receipt[path_field]).parent.name
        if character_id in result:
            raise ValueError(f"duplicate receipt for {character_id}")
        result[character_id] = (receipt_path, receipt)
    if set(result) != set(CHARACTER_IDS):
        raise ValueError(f"expected receipts for {CHARACTER_IDS}, got {tuple(sorted(result))}")
    return result


def publish(
    repo_root: Path,
    output_dir: Path,
    runtime_receipt_paths: list[Path],
    preview_receipt_paths: list[Path],
    validation_receipt_path: Path,
    *,
    check: bool = False,
) -> dict[str, Any]:
    runtime_receipts = load_by_character(runtime_receipt_paths, "outputRuntimeV2AbsolutePath")
    preview_receipts = load_by_character(preview_receipt_paths, "inputGlbAbsolutePath")
    validation = json.loads(validation_receipt_path.read_text(encoding="utf-8"))
    if validation["summary"]["errorCount"] != 0 or not validation["summary"]["passed"]:
        raise ValueError("Khronos aggregate validation did not pass with zero errors")
    validation_by_sha = {item["sha256"]: item for item in validation["assets"]}

    published = []
    planned_copies: list[tuple[Path, Path, str]] = []
    for character_id in CHARACTER_IDS:
        runtime_receipt_path, runtime = runtime_receipts[character_id]
        source_glb = Path(runtime["outputRuntimeV2AbsolutePath"])
        source_sha = runtime["outputRuntimeV2Sha256"]
        if source_glb.stat().st_size != runtime["outputRuntimeV2Bytes"]:
            raise ValueError(f"runtime receipt byte count mismatch: {source_glb}")
        if sha256_file(source_glb) != source_sha:
            raise ValueError(f"runtime receipt SHA-256 mismatch: {source_glb}")
        measured = glb_metrics(source_glb)
        receipt_fields = {
            key: runtime[key]
            for key in (
                "triangleCount",
                "meshCount",
                "skinnedPrimitiveCount",
                "embeddedImageCount",
                "maxTextureDimension",
                "skinCount",
                "animationCount",
            )
        }
        if measured != receipt_fields:
            raise ValueError(f"runtime receipt metrics differ from GLB bytes for {character_id}")
        if measured["triangleCount"] > 8000:
            raise ValueError(f"{character_id} exceeds 8000 triangles")
        if measured["skinnedPrimitiveCount"] > 6:
            raise ValueError(f"{character_id} exceeds six primitives")
        if measured["embeddedImageCount"] > 6:
            raise ValueError(f"{character_id} exceeds six images")
        if measured["maxTextureDimension"] > 256:
            raise ValueError(f"{character_id} exceeds 256px textures")
        if measured["skinCount"] < 1:
            raise ValueError(f"{character_id} has no skin")
        validation_asset = validation_by_sha.get(source_sha)
        if validation_asset is None:
            raise ValueError(f"no Khronos validation entry for {character_id}")
        if validation_asset["validatorReport"]["issues"]["numErrors"] != 0:
            raise ValueError(f"Khronos validation has errors for {character_id}")

        destination_glb = output_dir / "candidates" / f"{character_id}-runtime-v2.glb"
        planned_copies.append((source_glb, destination_glb, source_sha))

        preview_receipt_path, preview = preview_receipts[character_id]
        if preview["inputGlbSha256"] != source_sha:
            raise ValueError(f"preview receipt targets a different GLB for {character_id}")
        views = {item["view"]: item for item in preview["views"]}
        if set(views) != set(PREVIEW_VIEWS):
            raise ValueError(f"expected front/side/back previews for {character_id}")
        published_previews = []
        for view in PREVIEW_VIEWS:
            item = views[view]
            source_preview = Path(item["absolutePath"])
            if source_preview.stat().st_size != item["bytes"]:
                raise ValueError(f"preview receipt byte count mismatch: {source_preview}")
            destination_preview = output_dir / "previews" / f"{character_id}-{view}.png"
            planned_copies.append((source_preview, destination_preview, item["sha256"]))
            published_previews.append(
                {
                    "view": view,
                    "gitPath": git_path(destination_preview, repo_root),
                    "bytes": item["bytes"],
                    "sha256": item["sha256"],
                }
            )

        published.append(
            {
                "characterId": character_id,
                "candidate": {
                    "gitPath": git_path(destination_glb, repo_root),
                    "bytes": runtime["outputRuntimeV2Bytes"],
                    "sha256": source_sha,
                },
                "constraints": measured,
                "khronos": {
                    "validatorVersion": validation["validatorVersion"],
                    "errors": 0,
                    "warnings": validation_asset["validatorReport"]["issues"]["numWarnings"],
                },
                "previews": published_previews,
                "sourceReceipts": {
                    "runtimeV2": git_path(runtime_receipt_path, repo_root),
                    "preview": git_path(preview_receipt_path, repo_root),
                    "khronos": git_path(validation_receipt_path, repo_root),
                },
                "ownerVisualStatus": "pending",
                "registered": False,
                "deployed": False,
            }
        )

    manifest = {
        "schema": SCHEMA,
        "status": "published-to-git-candidates-owner-visual-pending-not-registered-not-deployed",
        "candidates": published,
    }
    manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    manifest_path = output_dir / "published-candidates.json"
    if check:
        stale = []
        for source, destination, expected_sha in planned_copies:
            if not destination.is_file() or sha256_file(destination) != expected_sha:
                stale.append(git_path(destination, repo_root))
        if not manifest_path.is_file() or manifest_path.read_text(encoding="utf-8") != manifest_text:
            stale.append(git_path(manifest_path, repo_root))
        if stale:
            raise SystemExit("stale published candidates: " + ", ".join(stale))
        return manifest

    for source, destination, expected_sha in planned_copies:
        copy_verified(source, destination, expected_sha)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(manifest_text, encoding="utf-8")
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--runtime-v2-receipt", action="append", type=Path, required=True)
    parser.add_argument("--preview-receipt", action="append", type=Path, required=True)
    parser.add_argument("--validation-receipt", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = publish(
        args.repo_root,
        args.output_dir,
        args.runtime_v2_receipt,
        args.preview_receipt,
        args.validation_receipt,
        check=args.check,
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
