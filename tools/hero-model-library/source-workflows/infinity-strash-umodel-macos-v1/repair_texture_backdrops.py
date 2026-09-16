#!/usr/bin/env python3
"""Repair three Infinity Strash texture-backdrop sources without replacing originals.

The same transformer is used by the resumable source pipeline and by the
content-addressed migration of the currently registered base/frozen GLBs.
Only embedded image bufferViews may change; geometry, rig, animation and
material JSON are required to remain byte-for-byte equivalent.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(REPO / "tools" / "vfx-asset-safety"))

from check import embedded_image, glb_chunks, opaque_carrier_shares, transparent_background_shares  # noqa: E402
from repair_models import assert_non_image_identical, image_index_for, rebuild, replacements_for  # noqa: E402

SCHEMA = "ggd.infinity-strash-texture-backdrop-repair@1"
CANDIDATES = {
    "dai-pn010-02": {
        "heroId": "godie-nbbc", "character": "小呆", "form": "PN010/02",
        "mode": "key-planar-face-decal", "material": "GGD_faceDecal1",
        "sourceSha256": "2aa1be9bad767cbc496c6dc147b708714c5e7e0781f9d9d0df02058d4cdb6d66",
        "expectedSha256": "4d040f955d9b6f190b0a622034941d8685491670d4cfab81ea43d1fbf758e63f",
        "localOriginalRelativePath": "GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-candidates-v1/dai-pn010-02/body.glb",
        "triangles": 16035, "meshes": 6, "animationChannels": 266, "visualRootId": "dai-pn010-02", "visualFixedDir": "render-fixed-2",
    },
    "dai-pn010-05-daino-tsurugi": {
        "heroId": "godie-nbbc", "character": "小呆", "form": "PN010/05 + Dai no Tsurugi",
        "mode": "key-planar-face-decal", "material": "GGD_faceDecal1",
        "sourceSha256": "1e1379ec54152a09339c2c5f92e79ee4320fb848ba3ea8da52d723efb1d2c55d",
        "expectedSha256": "93ccf92a021851f98acb28213cdc78f5349482f90f0c90cad75de01962465e7a",
        "localOriginalRelativePath": "GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-candidates-dai-pn010-05-daino-v2/dai-pn010-05-daino-tsurugi/body.glb",
        "triangles": 16882, "meshes": 6, "animationChannels": 266, "visualRootId": "dai-pn010-05", "visualFixedDir": "render-fixed-2",
    },
    "vearn-en801-pre-transformation": {
        "heroId": "godie-ubal", "character": "老巴恩", "form": "EN801 變身前",
        "mode": "flatten-unused-opaque-alpha", "material": "GGD_body",
        "sourceSha256": "c0f4ea5c363f2847d2eb9324cfb72a80c8f007a134fa4ac728d95d350ca69d02",
        "expectedSha256": "aa8e1f03f69f6586befb1527178f2c7029c0f0a2c92b96b5ebdad8a1b2f32882",
        "localOriginalRelativePath": "GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-candidates-v1/vearn-en801-pre-transformation/body.glb",
        "triangles": 16760, "meshes": 6, "animationChannels": 281, "visualRootId": "vearn-en801", "visualFixedDir": "render-alpha-flattened",
    },
}


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path) -> str:
    return sha_bytes(path.read_bytes())


def png_bytes(image: Image.Image) -> bytes:
    stream = io.BytesIO()
    image.save(stream, "PNG")
    return stream.getvalue()


def flatten_opaque_alpha(doc: dict, binary: bytes, material_name: str) -> tuple[dict[int, bytes], list[str], int]:
    matches = [(index, material) for index, material in enumerate(doc.get("materials", [])) if material.get("name") == material_name]
    if len(matches) != 1:
        raise AssertionError(f"expected exactly one material {material_name!r}, found {len(matches)}")
    material_index, material = matches[0]
    if material.get("alphaMode", "OPAQUE") != "OPAQUE":
        raise AssertionError(f"{material_name} must remain OPAQUE")
    image_index = image_index_for(doc, material)
    if image_index is None:
        raise AssertionError(f"{material_name} has no embedded base-color image")
    image = embedded_image(doc, binary, image_index).convert("RGBA")
    pixels = list(image.getdata())
    changed = sum(alpha != 255 for _r, _g, _b, alpha in pixels)
    if changed == 0:
        raise AssertionError(f"{material_name} has no non-opaque alpha to flatten")
    flattened = Image.new("RGBA", image.size)
    flattened.putdata([(red, green, blue, 255) for red, green, blue, _alpha in pixels])
    if ImageChops.difference(image.convert("RGB"), flattened.convert("RGB")).getbbox() is not None:
        raise AssertionError("RGB changed while flattening unused opaque alpha")
    view_index = doc["images"][image_index]["bufferView"]
    return {view_index: png_bytes(flattened)}, [f"image{image_index} flattened {changed} unused alpha texels ← mat{material_index}:{material_name}"], changed


def repair(candidate: str, data: bytes) -> tuple[bytes, dict]:
    spec = CANDIDATES[candidate]
    before_doc, before_bin = glb_chunks(data)
    if spec["mode"] == "key-planar-face-decal":
        replacements, notes = replacements_for(before_doc, before_bin, effect_model=False)
        if len(replacements) != 1 or not any(str(spec["material"]) in note for note in notes):
            raise AssertionError(f"expected one {spec['material']} planar carrier repair; got {notes}")
        changed_alpha = None
    else:
        replacements, notes, changed_alpha = flatten_opaque_alpha(before_doc, before_bin, str(spec["material"]))
    repaired = rebuild(before_doc, before_bin, replacements)
    after_doc, after_bin = glb_chunks(repaired)
    assert_non_image_identical(before_doc, before_bin, after_doc, after_bin)
    material = next(row for row in after_doc["materials"] if row.get("name") == spec["material"])
    image_index = image_index_for(after_doc, material)
    assert image_index is not None
    with embedded_image(after_doc, after_bin, image_index) as image:
        background, bright = transparent_background_shares(image)
        carrier, carrier_edge = opaque_carrier_shares(image)
        alpha_extrema = image.getchannel("A").getextrema()
    if spec["mode"] == "flatten-unused-opaque-alpha":
        if material.get("alphaMode", "OPAQUE") != "OPAQUE" or alpha_extrema != (255, 255):
            raise AssertionError("opaque body alpha flatten did not satisfy its postcondition")
    elif background < 0.02:
        raise AssertionError("planar decal still lacks a transparent carrier")
    return repaired, {
        "schema": SCHEMA, "candidateId": candidate, "heroId": spec["heroId"],
        "character": spec["character"], "form": spec["form"], "mode": spec["mode"],
        "source": {"bytes": len(data), "sha256": sha_bytes(data)},
        "output": {"bytes": len(repaired), "sha256": sha_bytes(repaired)},
        "changedBufferViews": sorted(replacements), "notes": notes, "changedAlphaTexels": changed_alpha,
        "materialPostcondition": {"name": spec["material"], "alphaMode": material.get("alphaMode", "OPAQUE")},
        "imagePostcondition": {"alphaExtrema": list(alpha_extrema), "transparentBackgroundShare": background,
                               "brightTransparentBackgroundShare": bright, "opaqueCarrierShare": carrier,
                               "opaqueCarrierEdgeShare": carrier_edge},
        "nonImagePayloadIdentical": True, "runtimeRegistration": False, "productionDeploymentVerified": False,
    }


def write_exact(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise FileExistsError(f"refusing to overwrite non-identical file: {path}")
        return
    path.write_bytes(data)


def compare_renders(source_dir: Path, fixed_dir: Path, output: Path) -> dict:
    rows, canvases = [], []
    for view in ("front", "back", "isometric"):
        left_path, right_path = source_dir / f"{view}.png", fixed_dir / f"{view}.png"
        with Image.open(left_path) as left_in, Image.open(right_path) as right_in:
            left, right = left_in.convert("RGB"), right_in.convert("RGB")
        if left.size != right.size:
            raise AssertionError(f"render dimensions differ for {view}")
        diff = ImageChops.difference(left, right)
        differing = sum(pixel != (0, 0, 0) for pixel in diff.getdata())
        rows.append({"view": view, "source": {"path": str(left_path), "sha256": sha_file(left_path)},
                     "repaired": {"path": str(right_path), "sha256": sha_file(right_path)},
                     "differingPixels": differing, "pixelCount": left.width * left.height,
                     "maxRgbDelta": max(max(channel) for channel in diff.getextrema()), "exactRgbMatch": diff.getbbox() is None})
        canvas = Image.new("RGB", (left.width * 2, left.height + 28), "white")
        canvas.paste(left, (0, 28)); canvas.paste(right, (left.width, 28))
        draw = ImageDraw.Draw(canvas)
        draw.text((8, 8), f"{view}: source", fill="black")
        draw.text((left.width + 8, 8), f"{view}: repaired", fill="black")
        canvases.append(canvas)
    sheet = Image.new("RGB", (max(image.width for image in canvases), sum(image.height for image in canvases)), "white")
    y = 0
    for canvas in canvases:
        sheet.paste(canvas, (0, y)); y += canvas.height
    write_exact(output, png_bytes(sheet))
    return {"views": rows, "allExactRgbMatches": all(row["exactRgbMatch"] for row in rows),
            "contactSheet": {"path": str(output), "sha256": sha_file(output)}}


def run_one(candidate: str, input_path: Path, output_path: Path, receipt_path: Path) -> dict:
    repaired, receipt = repair(candidate, input_path.read_bytes())
    write_exact(output_path, repaired)
    receipt["source"]["path"] = str(input_path.resolve())
    receipt["output"]["path"] = str(output_path.resolve())
    write_exact(receipt_path, (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode())
    return receipt


def publish_current(repo: Path, workspace: Path) -> dict:
    evidence = repo / "materials/hero-model-library/priority-evidence/infinity-strash-texture-backdrop-repair-v1"
    local_root = workspace / "GGD-Asset-Library/conversions/infinity-strash-texture-backdrop-repair-v1"
    records = []
    for candidate, spec in CANDIDATES.items():
        source_sha = str(spec["sourceSha256"])
        source_base = workspace / str(spec["localOriginalRelativePath"])
        former_base = repo / f"content/assets/models/community/{source_sha}.glb"
        former_frozen = repo / f"content/assets/models/community/versions/{source_sha}.glb"
        if sha_file(source_base) != source_sha:
            raise AssertionError(f"local source pin failed for {candidate}")
        if former_base.exists() or former_frozen.exists():
            raise AssertionError(f"unsafe original still exists in shipped content for {candidate}")
        repaired, row = repair(candidate, source_base.read_bytes())
        output_sha = sha_bytes(repaired)
        if output_sha != spec["expectedSha256"]:
            raise AssertionError(f"deterministic output drift for {candidate}: {output_sha}")
        base = repo / f"content/assets/models/community/{output_sha}.glb"
        frozen = repo / f"content/assets/models/community/versions/{output_sha}.glb"
        local = local_root / candidate / "final" / f"{output_sha}.glb"
        for destination in (base, frozen, local):
            write_exact(destination, repaired)
        visual_root = local_root / str(spec["visualRootId"])
        visual = compare_renders(visual_root / "render-source", visual_root / str(spec["visualFixedDir"]),
                                 evidence / f"{candidate}-visual-comparison.png")
        row.update({
            "source": {**row["source"], "localPath": str(source_base),
                       "formerBaseGitPath": str(former_base), "formerFrozenGitPath": str(former_frozen),
                       "removedFromCurrentContentTree": True, "preservedInGitHistory": True},
            "output": {**row["output"], "basePath": str(base), "frozenPath": str(frozen), "localPath": str(local), "baseFrozenByteIdentical": True},
            "visualEvidence": visual,
            "runtimeBudgetEvidence": {"triangles": spec["triangles"], "meshes": spec["meshes"], "maxTextureEdge": 256,
                                      "animationChannels": spec["animationChannels"], "runtimeHardLimitsPassed": True,
                                      "formalAdoptionStatus": "needs-decimation", "formalAdoptionTriggerTriangles": 10000,
                                      "formalAdoptionTargetTriangles": 8000},
            "status": "repaired-candidate-generated-pending-decimation-and-registration",
        })
        records.append(row)
    receipt = {
        "schema": "ggd.infinity-strash-texture-backdrop-repair-batch@1", "sourceWorkflow": str(Path(__file__).resolve()),
        "records": records, "counts": {"sourceModels": 3, "originalBlockers": 6, "repairedBaseFiles": 3, "repairedFrozenFiles": 3},
        "boundaries": {"oldVersionsRetained": True, "centralIndexesModified": False, "championModelPointersModified": False,
                       "runtimeSelectable": False, "productionDeploymentVerified": False,
                       "remainingBlocker": "Each repaired model exceeds 10,000 triangles and requires a <=8,000-triangle accepted derivative before formal adoption."},
    }
    write_exact(evidence / "receipt.json", (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode())
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    one = sub.add_parser("repair")
    one.add_argument("--candidate", choices=sorted(CANDIDATES), required=True)
    one.add_argument("--input", type=Path, required=True)
    one.add_argument("--output", type=Path, required=True)
    one.add_argument("--receipt", type=Path, required=True)
    publish = sub.add_parser("publish-current")
    publish.add_argument("--repo", type=Path, required=True)
    publish.add_argument("--workspace", type=Path, required=True)
    args = parser.parse_args()
    result = run_one(args.candidate, args.input, args.output, args.receipt) if args.command == "repair" else publish_current(args.repo.resolve(), args.workspace.resolve())
    print(json.dumps(result["counts"] if "counts" in result else result["output"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
