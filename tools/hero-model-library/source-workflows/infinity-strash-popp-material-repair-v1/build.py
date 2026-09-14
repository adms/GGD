#!/usr/bin/env python3
"""Build a review-only PN020 material repair from retained source texture layers.

This deliberately does one reproducible, limited reconstruction: source Base and
Shade layers are multiplied for the face and hair images already embedded in the
currently selected Kagayaki GGD model.  It does not claim to reproduce the
unrecovered Unreal Cel material, Bundle/Filter semantics, or game shader
parameters.  The result is a new candidate and must pass the normal model gate
and owner visual review before any model-option mutation.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import struct
from pathlib import Path

from PIL import Image, ImageChops


JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def evidence(path: Path) -> dict:
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}


def parse_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", data, 0)
    if (magic, version, total) != (b"glTF", 2, len(data)):
        raise ValueError("expected a complete glTF 2 GLB")
    offset = 12
    chunks: list[tuple[int, bytes]] = []
    while offset < len(data):
        length, chunk_type = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8:offset + 8 + length]
        if len(payload) != length:
            raise ValueError("truncated GLB chunk")
        chunks.append((chunk_type, payload))
        offset += 8 + length
    if len(chunks) != 2 or chunks[0][0] != JSON_CHUNK or chunks[1][0] != BIN_CHUNK:
        raise ValueError("repair expects exactly JSON and BIN GLB chunks")
    return json.loads(chunks[0][1].decode().rstrip(" \t\r\n\0")), chunks[1][1]


def encode_glb(document: dict, binary: bytes) -> bytes:
    json_bytes = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode()
    json_bytes += b" " * (-len(json_bytes) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    return b"".join((struct.pack("<4sII", b"glTF", 2, total), struct.pack("<II", len(json_bytes), JSON_CHUNK), json_bytes, struct.pack("<II", len(binary), BIN_CHUNK), binary))


def read_rgba(path: Path, size: tuple[int, int] | None = None) -> Image.Image:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
    if size and rgba.size != size:
        rgba = rgba.resize(size, Image.Resampling.LANCZOS)
    return rgba


def multiplied(base_path: Path, shade_path: Path, output_path: Path) -> dict:
    base = read_rgba(base_path)
    shade = read_rgba(shade_path, base.size)
    rgb = ImageChops.multiply(base.convert("RGB"), shade.convert("RGB"))
    repaired = Image.merge("RGBA", (*rgb.split(), base.getchannel("A")))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    repaired.save(output_path, format="PNG", optimize=True)
    return {
        "base": evidence(base_path),
        "shade": evidence(shade_path),
        "output": evidence(output_path),
        "operation": "RGBA base RGB multiplied by resized shade RGB; original base alpha retained",
        "size": list(base.size),
    }


def replace_images(document: dict, binary: bytes, replacements: dict[str, bytes]) -> bytes:
    images = document.get("images", [])
    view_to_replacement: dict[int, tuple[str, bytes]] = {}
    for image in images:
        name = image.get("name")
        if name not in replacements:
            continue
        if "bufferView" not in image or image.get("mimeType") != "image/png":
            raise ValueError(f"image is not an embedded PNG: {name}")
        view = image["bufferView"]
        if view in view_to_replacement:
            raise ValueError(f"two images share target buffer view {view}")
        view_to_replacement[view] = (name, replacements[name])
        image["name"] = name + "_source_base_x_shade"
    if set(replacements) != {name for name, _ in view_to_replacement.values()}:
        raise ValueError("target images were not found exactly once")
    views = document.get("bufferViews", [])
    ordered = sorted(enumerate(views), key=lambda row: row[1].get("byteOffset", 0))
    previous_end = 0
    rebuilt = bytearray()
    for index, view in ordered:
        if view.get("buffer", 0) != 0:
            raise ValueError("multiple GLB buffers are unsupported")
        start = view.get("byteOffset", 0)
        end = start + view["byteLength"]
        if start < previous_end or end > len(binary):
            raise ValueError("overlapping or out-of-range buffer view")
        rebuilt.extend(binary[previous_end:start])
        view["byteOffset"] = len(rebuilt)
        payload = view_to_replacement.get(index, (None, binary[start:end]))[1]
        rebuilt.extend(payload)
        view["byteLength"] = len(payload)
        previous_end = end
    rebuilt.extend(binary[previous_end:])
    document["buffers"][0]["byteLength"] = len(rebuilt)
    return bytes(rebuilt)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--face-base", type=Path, required=True)
    parser.add_argument("--face-shade", type=Path, required=True)
    parser.add_argument("--hair-base", type=Path, required=True)
    parser.add_argument("--hair-shade", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--check", action="store_true", help="verify a prior immutable repair stage")
    args = parser.parse_args()
    inputs = [args.input, args.face_base, args.face_shade, args.hair_base, args.hair_shade]
    if any(not path.is_file() for path in inputs):
        raise SystemExit("all input paths must be regular files")
    output = args.output_dir.resolve()
    if args.check:
        receipt_path = output / "receipt.json"
        if not receipt_path.is_file():
            raise SystemExit("repair receipt is missing: " + str(receipt_path))
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if receipt.get("schema") != "ggd.infinity-strash-popp-material-repair@1":
            raise SystemExit("unexpected repair receipt schema")
        expected_inputs = {
            "sourceModel": args.input.resolve(),
            "repair.face.base": args.face_base.resolve(),
            "repair.face.shade": args.face_shade.resolve(),
            "repair.hair.base": args.hair_base.resolve(),
            "repair.hair.shade": args.hair_shade.resolve(),
        }
        for label, path in expected_inputs.items():
            row = receipt
            for key in label.split("."):
                row = row[key]
            if row != evidence(path):
                raise SystemExit("stale repair evidence: " + label)
        model_path = output / "popp-pn020-02-kagayaki-material-repair.glb"
        if receipt.get("outputModel") != evidence(model_path):
            raise SystemExit("stale repaired GLB evidence")
        document, _ = parse_glb(model_path)
        names = {image.get("name") for image in document.get("images", [])}
        if not {"T_PN020_00_Face_Base_source_base_x_shade", "T_PN020_00_Hair_Base_source_base_x_shade"} <= names:
            raise SystemExit("repaired GLB lacks the two marked texture replacements")
        print(json.dumps({"checked": str(receipt_path), "model": receipt["outputModel"]}, ensure_ascii=False))
        return
    if output.exists():
        raise SystemExit("refusing to overwrite output directory: " + str(output))
    output.mkdir(parents=True)
    face = multiplied(args.face_base.resolve(), args.face_shade.resolve(), output / "T_PN020_00_Face_Base_x_Shade.png")
    hair = multiplied(args.hair_base.resolve(), args.hair_shade.resolve(), output / "T_PN020_00_Hair_Base_x_Shade.png")
    document, binary = parse_glb(args.input.resolve())
    with (output / "T_PN020_00_Face_Base_x_Shade.png").open("rb") as stream:
        face_bytes = stream.read()
    with (output / "T_PN020_00_Hair_Base_x_Shade.png").open("rb") as stream:
        hair_bytes = stream.read()
    rebuilt_binary = replace_images(document, binary, {
        "T_PN020_00_Face_Base": face_bytes,
        "T_PN020_00_Hair_Base": hair_bytes,
    })
    model_path = output / "popp-pn020-02-kagayaki-material-repair.glb"
    model_path.write_bytes(encode_glb(document, rebuilt_binary))
    receipt = {
        "schema": "ggd.infinity-strash-popp-material-repair@1",
        "candidateId": "popp-pn020-02-kagayaki-material-repair-v1",
        "sourceModel": evidence(args.input.resolve()),
        "repair": {"face": face, "hair": hair},
        "outputModel": evidence(model_path),
        "sourceMaterialCoverage": {
            "used": ["Face Base", "Face Shade", "Hair Base", "Hair Shade"],
            "retainedButNotInterpreted": ["Face Bundle", "Face Filter", "Hair Bundle"],
            "notClaimed": ["Unreal Cel material parameter recovery", "exact toon parity"],
        },
        "status": "review-candidate-only-not-runtime-registered-not-backend-selectable-not-deployed",
    }
    (output / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"model": evidence(model_path), "receipt": evidence(output / "receipt.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
