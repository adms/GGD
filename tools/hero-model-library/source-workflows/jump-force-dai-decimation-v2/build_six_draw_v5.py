#!/usr/bin/env python3
"""Build a material-faithful six-draw JUMP FORCE Dai candidate.

V3 proved that the binary merge can retain all geometry at six draws, but it
collapsed colour maps from different source materials into six representative
tiles.  V5 instead gives every merged opaque source material its own atlas
region.  The face receives 128x128; larger clothing, skin and weapon regions
receive 64x64; the remaining detail layers receive 32x32.  Eye, lens,
eyeshadow, glass and hair remain separate primitives exactly as V3.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from io import BytesIO
from pathlib import Path
import subprocess

from PIL import Image

import build_six_draw_candidate as merger


CANDIDATE_ID = "jump-force-native-dai-chr0430-material-faithful-six-draw-v5"
FINAL_NAME = "dai-chr0430-six-draw.glb"
INPUT_RELATIVE = Path("conversions/jump-force-dai-decimation-v2/run-a/dai-chr0430-review-v4.glb")
INPUT_SHA256 = "2b3030a97ff3add18e8addbc5d0ab39153e66d2da45a0d5ccf1dc10ff0fc55ba"

# Pixel coordinates use the established V3 orientation.  This preserves the
# source renderer's correct V convention while eliminating representative-map
# reuse.  Every material included in the opaque body merger is present once.
SLOTS = {
    "MI_chr0430_face": (0, 0, 128, 128),
    "MI_chr0430_oral": (128, 0, 64, 64),
    "MI_chr0430_face.001": (192, 0, 64, 64),
    "MI_chr0430_cloth": (128, 64, 64, 64),
    "MI_chr0430_pants": (192, 64, 64, 64),
    "MI_chr0430_skin": (0, 128, 64, 64),
    "MI_chr0430_weapon": (64, 128, 64, 64),
    "MI_chr0430_damage_blood": (128, 128, 32, 32),
    "MI_chr0430_pants.001": (160, 128, 32, 32),
    "MI_chr0430_cloth.001": (192, 128, 32, 32),
    "MI_chr0430_pants.002": (224, 128, 32, 32),
    "MI_chr0430_skin.001": (128, 160, 32, 32),
    "MI_chr0430_cloth.002": (160, 160, 32, 32),
    "MI_chr0430_pants.003": (192, 160, 32, 32),
    "MI_chr0430_weapon.001": (224, 160, 32, 32),
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_texture(model: dict, binary: bytes, material: dict, kind: str) -> Image.Image | None:
    if kind == "base":
        texture = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
    elif kind == "normal":
        texture = material.get("normalTexture")
    else:
        texture = material.get("pbrMetallicRoughness", {}).get("metallicRoughnessTexture")
    if texture is None:
        return None
    texture_index = texture["index"]
    image_index = model["textures"][texture_index]["source"]
    view = model["bufferViews"][model["images"][image_index]["bufferView"]]
    offset = view.get("byteOffset", 0)
    return Image.open(BytesIO(binary[offset:offset + view["byteLength"]])).convert("RGBA")


def build_atlases(source: Path, destination: Path) -> dict:
    model, binary = merger.read_glb(source)
    materials = {material["name"]: material for material in model["materials"]}
    destination.mkdir(parents=True)
    output = {}
    defaults = {"base": (255, 255, 255, 255), "normal": (128, 128, 255, 255), "orm": (255, 255, 0, 255)}
    for kind in ("base", "normal", "orm"):
        atlas = Image.new("RGBA", (256, 256), defaults[kind])
        for name, slot in SLOTS.items():
            image = source_texture(model, binary, materials[name], kind)
            if image is None:
                if kind == "base" and name == "MI_chr0430_damage_blood":
                    rgba = materials[name]["pbrMetallicRoughness"].get("baseColorFactor", defaults[kind])
                    tile = Image.new("RGBA", slot[2:], tuple(round(c * 255) for c in rgba))
                else:
                    tile = Image.new("RGBA", slot[2:], defaults[kind])
            else:
                # These are opaque-body maps; avoid invalid source alpha during
                # resampling exactly as the V3 implementation did.
                tile = image.convert("RGB").resize(slot[2:], Image.Resampling.LANCZOS).convert("RGBA")
            atlas.paste(tile, slot[:2])
        # The shared binary merger reads this stable filename contract; the
        # atlas-plan receipt records that this is the V5 per-material variant.
        path = destination / f"dai-body-{kind}-atlas.png"
        atlas.save(path, format="PNG", optimize=False, compress_level=9)
        output[kind] = merger.pin(path)
    plan = {
        "schema": "ggd.jump-force-dai-material-faithful-atlas-plan@1",
        "source": merger.pin(source), "atlasEdge": 256,
        "slots": {name: {"x": s[0], "y": s[1], "width": s[2], "height": s[3]} for name, s in SLOTS.items()},
        "perMaterialTileCount": len(SLOTS), "atlases": output,
    }
    (destination / "atlas-plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    return plan


def build(repo: Path, asset_root: Path, output: Path) -> None:
    if output.exists():
        raise ValueError(f"refusing to overwrite immutable stage {output}")
    source = asset_root / INPUT_RELATIVE
    if not source.is_file() or sha(source) != INPUT_SHA256:
        raise ValueError("frozen V2 source differs")
    output.mkdir(parents=True)
    atlas_dir = output / "atlas"
    plan = build_atlases(source, atlas_dir)
    # Reuse the independently tested binary merger but make its mapping one
    # source material per tile for this process only.
    old_slots, old_groups = merger.ATLAS_SLOTS, merger.MATERIAL_GROUPS
    merger.ATLAS_SLOTS = SLOTS
    merger.MATERIAL_GROUPS = {name: name for name in SLOTS}
    try:
        candidates = []
        merge_receipts = []
        for name in ("run-a", "run-b"):
            run_dir = output / name
            run_dir.mkdir()
            candidate = run_dir / FINAL_NAME
            receipt = run_dir / "merge-receipt.json"
            merger.merge_six_draw(source, atlas_dir, candidate, receipt)
            candidates.append(candidate)
            merge_receipts.append(merger.pin(receipt))
    finally:
        merger.ATLAS_SLOTS, merger.MATERIAL_GROUPS = old_slots, old_groups
    if candidates[0].read_bytes() != candidates[1].read_bytes():
        raise ValueError("independent builds differ")
    observed = merger.metrics(candidates[0])
    if observed["triangles"] > 8000 or observed["drawPrimitives"] > 6 or observed["maxTextureEdge"] > 256:
        raise ValueError(f"policy limits missed: {observed}")
    conversion = {
        "schema": "ggd.jump-force-dai-material-faithful-six-draw@1",
        "candidateId": CANDIDATE_ID,
        "sourceId": "steam-jump-force-priority-original-assets-build-8523149",
        "nativeCharacterId": "chr0430", "heroIds": ["godie-nbbc", "godie-n01c"],
        "input": merger.pin(source), "atlasPlan": merger.pin(atlas_dir / "atlas-plan.json"),
        "output": merger.pin(candidates[0]), "rebuild": merger.pin(candidates[1]), "byteIdenticalRebuild": True,
        "observed": observed,
        "tools": {"builder": merger.pin(Path(__file__).resolve(), repo), "pillow": Image.__version__},
        "preservation": {"sourceMeshObjects": 20, "mergedOpaqueMaterialPrimitives": 15, "preservedEyeLensHairGlassPrimitives": 5, "damageMeshesRemoved": False, "perMaterialAtlasTiles": 15, "representativeTextureReuse": False, "v3RejectedExperiment": "V4 V-shift produced visible full-body material corruption and is not a candidate"},
        "states": {"geometryTargetPassed": True, "drawCallLimitPassed": True, "textureEdgePassed": True, "visualReview": "pending-v5-render-review", "animationBinding": "blocked-no-reviewed-motion", "backendOptionRegistered": False, "runtimeSelectable": False, "productionDeployed": False},
    }
    (output / "conversion.json").write_text(json.dumps(conversion, ensure_ascii=False, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, root = args.repo.resolve(), args.asset_root.resolve()
    output = (args.output_root or root / "conversions/jump-force-dai-six-draw-v5").resolve()
    if args.write:
        build(repo, root, output)
    receipt = json.loads((output / "conversion.json").read_text())
    for key in ("input", "atlasPlan", "output", "rebuild"):
        path = Path(receipt[key]["absolutePath"])
        if not path.is_file() or merger.pin(path) != receipt[key]:
            raise ValueError(f"{key} pin differs")
    print(json.dumps(receipt["observed"] | {"candidateId": receipt["candidateId"], "sha256": receipt["output"]["sha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
