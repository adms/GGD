#!/usr/bin/env python3
"""Rebuild a SourceIO raw JUMP FORCE Dai GLB's missing VMT-patch base maps.

This creates a *material-only* intermediate.  It never changes the original
Workshop VPK, the SourceIO raw GLB, Blender preferences, or a runtime model
option.  Each Source material slot is matched only to the same-named VTF in
the acquired Workshop extraction.  The VTF is decoded with the pinned SourceIO
checkout and downscaled to at most 256px before it is embedded in a fresh GLB.

The result deliberately retains the source 89,833 triangles.  It is evidence
for the next, separately reviewed topology-aware decimation stage, not an
accepted GGD model or an upload candidate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
WORKSPACE = REPO.parent
SOURCEIO_ROOT = WORKSPACE / "GGD-Asset-Library/source-tools/SourceIO-5.5.4"
RAW_ROOT = WORKSPACE / "GGD-Asset-Library/conversions/jump-force-dai-l4d2-sourceio-v1/lead-dai-jumpforce-l4d2-2298782931-2298782931/models_survivors_survivor_coach"
RAW_GLB = RAW_ROOT / "sourceio-raw.glb"
RAW_RECEIPT = RAW_ROOT / "conversion-receipt.json"
MATERIAL_ROOT = WORKSPACE / "GGD-Asset-Library/intake/public-sources/lead-dai-jumpforce-l4d2-2298782931-2298782931/extracted/materials/models/boltok/dai"
OUTPUT_ROOT = WORKSPACE / "GGD-Asset-Library/conversions/jump-force-dai-l4d2-material-rebuild-v3"
BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")
EXPECTED_RAW_SHA = "511663435c85d72d0dea1f713c73bbde2ce275552fc4a1648e83fd7347bfb1ce"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_glb(path: Path) -> dict:
    data = path.read_bytes()
    if data[:4] != b"glTF" or int.from_bytes(data[4:8], "little") != 2:
        raise ValueError("not a GLB v2: " + str(path))
    json_length = int.from_bytes(data[12:16], "little")
    if data[16:20] != b"JSON":
        raise ValueError("missing GLB JSON chunk: " + str(path))
    return json.loads(data[20:20 + json_length])


def safe_vtf_name(material_name: str) -> str:
    # The source MTL table uses the same names as the VTFs, differing only in
    # case.  Keep spaces because `skin 1.vtf` is a genuine source filename.
    if not material_name or "/" in material_name or "\\" in material_name:
        raise ValueError("unsafe Source material name: " + repr(material_name))
    return material_name.lower() + ".vtf"


def manifest() -> dict:
    raw_receipt = json.loads(RAW_RECEIPT.read_text(encoding="utf-8"))
    if raw_receipt.get("output", {}).get("sha256") != EXPECTED_RAW_SHA:
        raise ValueError("raw SourceIO receipt SHA drift")
    if sha256(RAW_GLB) != EXPECTED_RAW_SHA:
        raise ValueError("raw SourceIO GLB SHA drift")
    if not SOURCEIO_ROOT.is_dir() or not (SOURCEIO_ROOT / ".git").is_dir():
        raise FileNotFoundError("pinned SourceIO checkout is unavailable")
    sourceio_commit = subprocess.check_output(
        ["git", "-C", str(SOURCEIO_ROOT), "rev-parse", "HEAD"], text=True
    ).strip()
    if sourceio_commit != "25b3978e366aeed1b4bdcf078394751b2d376c7a":
        raise ValueError("SourceIO commit drift: " + sourceio_commit)
    gltf = read_glb(RAW_GLB)
    materials = [item.get("name") for item in gltf.get("materials", [])]
    # Blender retained 26 material datablocks during raw import, but the GLB
    # serializes only the 22 slots actually used by the exported meshes.  The
    # frozen raw GLB is authoritative for the rebuild input.
    if len(materials) != 22 or any(not isinstance(name, str) for name in materials) or len(set(materials)) != len(materials):
        raise ValueError("unexpected SourceIO raw GLB material table")
    rows = []
    for name in materials:
        vtf = MATERIAL_ROOT / safe_vtf_name(name)
        if not vtf.is_file():
            raise FileNotFoundError("missing exact same-name source VTF: " + str(vtf))
        rows.append({"material": name, "vtf": str(vtf), "bytes": vtf.stat().st_size, "sha256": sha256(vtf)})
    return {
        "schema": "ggd.jump-force-dai-material-rebuild-input@1",
        "rawGlb": {"absolutePath": str(RAW_GLB), "bytes": RAW_GLB.stat().st_size, "sha256": EXPECTED_RAW_SHA},
        "rawReceipt": {"absolutePath": str(RAW_RECEIPT), "sha256": sha256(RAW_RECEIPT)},
        "sourceio": {"absolutePath": str(SOURCEIO_ROOT), "gitCommit": sourceio_commit},
        "materials": rows,
        "maxTextureEdge": 256,
        "policy": "material-only intermediate; topology, skin and actions are preserved; not runtime selectable",
    }


def decode_textures(frozen: dict, root: Path) -> list[dict]:
    """Decode/resize VTFs outside Blender, then pin every generated PNG."""
    sys.path.insert(0, str(SOURCEIO_ROOT.parent))
    from SourceIO.library.source1.vtf import load_texture

    decoded_root = root / "decoded-textures"
    decoded_root.mkdir()
    rows = []
    for index, row in enumerate(frozen["materials"]):
        with Path(row["vtf"]).open("rb") as stream:
            pixels, height, width = load_texture(stream)
        if pixels is None or not width or not height or pixels.shape != (height, width, 4):
            raise ValueError("could not decode VTF: " + row["vtf"])
        rgba = np.rint(np.clip(pixels, 0, 1) * 255).astype(np.uint8)
        image = Image.fromarray(rgba, mode="RGBA")
        edge = max(width, height)
        if edge > frozen["maxTextureEdge"]:
            scale = frozen["maxTextureEdge"] / edge
            image = image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.Resampling.LANCZOS)
        output = decoded_root / f"{index:02d}-{row['material'].replace(' ', '_')}.png"
        image.save(output, optimize=False, compress_level=9)
        rows.append({**row, "decodedPng": str(output), "decodedBytes": output.stat().st_size,
                     "decodedSha256": sha256(output), "sourceWidth": width, "sourceHeight": height,
                     "width": image.width, "height": image.height})
    if any(max(row["width"], row["height"]) > frozen["maxTextureEdge"] for row in rows):
        raise ValueError("decoded texture resize policy failed")
    return rows


DRIVER = r'''import json, sys
from pathlib import Path

config = json.loads(Path(sys.argv[-1]).read_text(encoding="utf-8"))
import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=config["rawGlb"]["absolutePath"])
materials = {item.name: item for item in bpy.data.materials}
if set(materials) != {row["material"] for row in config["materials"]}:
    raise RuntimeError("raw GLB material table differs from frozen input")

texture_rows = []
for row in config["materials"]:
    material = materials[row["material"]]
    image = bpy.data.images.load(row["decodedPng"], check_existing=False)
    image.pack()
    image.colorspace_settings.name = "sRGB"
    texture_rows.append({"material": row["material"], "sourceWidth": row["sourceWidth"], "sourceHeight": row["sourceHeight"],
                         "width": image.size[0], "height": image.size[1], "decodedSha256": row["decodedSha256"]})
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tree.links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    # Source eye/eyeshadow layers carry alpha.  Preserve it in GLB instead of
    # interpreting L4D2 damage-patch visibility rules as a GGD game mechanic.
    if row["material"].lower() in {"eyeshadow", "eyeshighlight", "eyes", "glass", "effect"}:
        tree.links.new(tex.outputs["Alpha"], shader.inputs["Alpha"])
        material.surface_render_method = "DITHERED"
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)

output = Path(config["output"])
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_materials="EXPORT", export_animations=True)
Path(config["driverResult"]).write_text(json.dumps({
    "materials": len(materials),
    "images": len(bpy.data.images),
    "textures": texture_rows,
    "maxTextureEdge": config["maxTextureEdge"],
    "blenderVersion": bpy.app.version_string,
}, indent=2) + "\n", encoding="utf-8")
'''


def output_metrics(path: Path, blender_result: dict) -> dict:
    gltf = read_glb(path)
    for image in gltf.get("images", []):
        # GLB does not retain image dimensions.  The corresponding VTF decode
        # receipt is authoritative for the 256px resize, so only prove image
        # references here.
        if "bufferView" not in image:
            raise ValueError("rebuild output contains external or absent image data")
    textured = sum(
        1 for material in gltf.get("materials", [])
        if material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
    )
    texture_rows = blender_result.get("textures", [])
    if len(texture_rows) != len(gltf.get("materials", [])) or any(max(row["width"], row["height"]) > 256 for row in texture_rows):
        raise ValueError("material rebuild texture size policy failed")
    return {"materialCount": len(gltf.get("materials", [])), "imageCount": len(gltf.get("images", [])),
            "texturedMaterialCount": textured, "allImagesEmbedded": True,
            "textureMaxEdge": max(max(row["width"], row["height"]) for row in texture_rows)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path, default=OUTPUT_ROOT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    frozen = manifest()
    root = args.output_root.resolve()
    output = root / "candidate-material-rebuilt-89833.glb"
    config_path = root / "input-manifest.json"
    result_path = root / "blender-result.json"
    receipt_path = root / "receipt.json"
    if args.check:
        if not receipt_path.is_file() or not output.is_file():
            raise SystemExit("missing material rebuild output")
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if receipt.get("input") != frozen or receipt.get("output", {}).get("sha256") != sha256(output):
            raise SystemExit("material rebuild output drift")
        if any(not Path(row["decodedPng"]).is_file() or sha256(Path(row["decodedPng"])) != row["decodedSha256"] for row in receipt.get("decodedTextures", [])):
            raise SystemExit("decoded material texture drift")
        if receipt.get("status") != "material-rebuilt-topology-unchanged-pending-decimation-and-visual-review":
            raise SystemExit("unexpected material rebuild status")
        print(json.dumps({"output": str(output), "check": True, "status": receipt["status"]}))
        return
    if root.exists():
        raise SystemExit("preserve existing output root: " + str(root))
    root.mkdir(parents=True)
    decoded = decode_textures(frozen, root)
    config = {**frozen, "materials": decoded, "output": str(output), "driverResult": str(result_path)}
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    driver = root / "blender-driver.py"
    driver.write_text(DRIVER, encoding="utf-8")
    completed = subprocess.run(
        [str(BLENDER), "--background", "--factory-startup", "--python", str(driver), "--", str(config_path)],
        text=True, capture_output=True, check=False,
    )
    (root / "blender.log").write_text(completed.stdout + completed.stderr, encoding="utf-8")
    if completed.returncode != 0 or not output.is_file():
        raise SystemExit("Blender material rebuild failed; inspect " + str(root / "blender.log"))
    blender_result = json.loads(result_path.read_text(encoding="utf-8"))
    receipt = {
        "schema": "ggd.jump-force-dai-material-rebuild-receipt@1", "input": frozen,
        "decodedTextures": decoded,
        "output": {"absolutePath": str(output), "bytes": output.stat().st_size, "sha256": sha256(output), **output_metrics(output, blender_result)},
        "driver": {"absolutePath": str(driver), "sha256": sha256(driver)},
        "blender": blender_result,
        "status": "material-rebuilt-topology-unchanged-pending-decimation-and-visual-review",
        "limitations": ["89,833 source triangles are intentionally preserved in this stage.", "VMT patch damage rules are not recreated as GGD mechanics.", "No visual acceptance, six-state semantics, backend registration, dropdown option, or deployment is implied."],
    }
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": receipt["output"], "status": receipt["status"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
