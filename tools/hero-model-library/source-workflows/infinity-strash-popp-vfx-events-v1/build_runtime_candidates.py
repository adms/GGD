#!/usr/bin/env python3
"""Build unbound GGD VFX candidates from acquired Popp reconstruction inputs.

This is deliberately a candidate conversion.  It converts one byte-verified
source texture per recognised Niagara root into a browser-safe PNG and authors
a bounded ``vfx@1`` document.  It does not claim to recover Niagara timing,
mesh layers, skill bindings, visual acceptance, or production deployment.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageChops


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
ASSET_LIBRARY = WORKSPACE / "GGD-Asset-Library"
INPUT = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/vfx-reconstruction-candidates.json"
OUTPUT = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/runtime-candidates-v1"
EXPORT_ROOT = ASSET_LIBRARY / "conversions/infinity-strash-popp-vfx-dependency-export-v1"
TEXTURE_ROOT = REPO / "content/assets/textures/particles/strash/popp"
VFX_ROOT = REPO / "content/vfx"
MODEL_BUDGET = REPO / "packages/shared/src/content/modelUpload/budget.ts"

SCHEMA = "ggd.infinity-strash-popp-vfx-runtime-candidates@1"
SUPPORTED_FAMILIES = {"ice", "fire", "explosion", "lightning"}

FAMILY_TOKENS = {
    "ice": ("ice", "spike", "snow", "crystal", "radial"),
    "fire": ("fire", "flame", "burn", "smoke", "radial", "glow"),
    "explosion": ("bullet", "radial", "flash", "smoke", "mask", "glow"),
    "lightning": ("thunder", "lightning", "line", "spark", "glow"),
}

FAMILY_COLOURS = {
    "ice": ([0.88, 0.97, 1.0, 1.0], [0.12, 0.45, 0.72, 0.0]),
    "fire": ([1.0, 0.88, 0.42, 1.0], [0.68, 0.08, 0.015, 0.0]),
    "explosion": ([1.0, 0.76, 0.28, 1.0], [0.42, 0.08, 0.18, 0.0]),
    "lightning": ([0.9, 0.96, 1.0, 1.0], [0.2, 0.28, 0.9, 0.0]),
}


def current_texture_edge_limit() -> int:
    """Read the shipping texture cap from the same source used by the gate."""
    source = MODEL_BUDGET.read_text(encoding="utf-8")
    match = re.search(
        r"const\s+HERO_TEXTURE_EDGE\s*=\s*\{\s*warn:\s*(\d[\d_]*)\s*,\s*limit:\s*(\d[\d_]*)\s*\}",
        source,
    )
    if not match:
        raise ValueError(f"Cannot read HERO_TEXTURE_EDGE from {MODEL_BUDGET}")
    warn = int(match.group(1).replace("_", ""))
    limit = int(match.group(2).replace("_", ""))
    if warn > limit or limit <= 0:
        raise ValueError(f"Invalid HERO_TEXTURE_EDGE: warn={warn} limit={limit}")
    return limit


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evidence(path: Path) -> dict:
    return {
        "gitPath": path.relative_to(REPO).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def texture_score(asset: dict, family: str) -> tuple:
    rel = asset["representativePath"].lower()
    inspection = asset.get("inspection", {})
    width = int(inspection.get("width") or 0)
    height = int(inspection.get("height") or 0)
    token_score = sum(100 - i * 5 for i, token in enumerate(FAMILY_TOKENS[family]) if token in rel)
    semantic_score = 40 if asset.get("semanticGroup") == "Alpha" else 0
    readable_score = 20 if inspection.get("readable") else -10000
    bounded_score = 10 if 8 <= width <= 512 and 8 <= height <= 512 else -100
    alpha_score = 8 if inspection.get("hasAlphaChannel") else 0
    # The path is the deterministic final tie breaker; negative sizes avoid
    # selecting giant support textures when a compact mask is equally useful.
    return (token_score + semantic_score + readable_score + bounded_score + alpha_score, -max(width, height), rel)


def select_texture(recipe: dict) -> dict:
    family = recipe["inference"]["family"]
    assets = [a for a in recipe.get("previewTextureAssets", []) if a.get("inspection", {}).get("readable")]
    if not assets:
        raise ValueError(f"{recipe['candidateId']}: no readable texture candidate")
    return max(assets, key=lambda a: texture_score(a, family))


def convert_mask(source: Path, target: Path, max_edge: int) -> dict:
    with Image.open(source) as image:
        image.load()
        rgba = image.convert("RGBA")
        source_width, source_height = rgba.size
        alpha = rgba.getchannel("A")
        alpha_min, alpha_max = alpha.getextrema()
        transform = "preserve-source-rgba"
        if alpha_min == 255 and alpha_max == 255:
            rgb = rgba.convert("RGB")
            channels = rgb.split()
            mask = ImageChops.lighter(channels[0], ImageChops.lighter(channels[1], channels[2]))
            rgba = Image.merge("RGBA", channels + (mask,))
            transform = "rgb-maximum-to-alpha-preserve-rgb"
        # Additive blending ignores alpha.  Clear the outer texel in RGBA so
        # even a source mask with a bright carrier edge cannot draw a rectangle.
        pixels = rgba.load()
        for x in range(rgba.width):
            pixels[x, 0] = (0, 0, 0, 0)
            pixels[x, rgba.height - 1] = (0, 0, 0, 0)
        for y in range(rgba.height):
            pixels[0, y] = (0, 0, 0, 0)
            pixels[rgba.width - 1, y] = (0, 0, 0, 0)
        transform += "; outer-1px-rgba-zero"
        if max(rgba.size) > max_edge:
            rgba.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
            transform += f"; lanczos-fit-max-edge-{max_edge}"
        target.parent.mkdir(parents=True, exist_ok=True)
        rgba.save(target, format="PNG", optimize=True)
        return {
            "sourceMode": image.mode,
            "sourceWidth": source_width,
            "sourceHeight": source_height,
            "width": rgba.width,
            "height": rgba.height,
            "maxEdgeLimit": max_edge,
            "transform": transform,
        }


def make_vfx_doc(vfx_id: str, family: str, phase: str, texture_path: str) -> dict:
    start, end = FAMILY_COLOURS[family]
    directed = phase in {"projectile", "firetrail", "muzzle"}
    landing = phase == "landing"
    impact = phase in {"hit", "impact", "landing"}
    if landing:
        emitter = {"shape": "ring", "radius": 0.28, "thickness": 0.08, "spread": 0.12}
    elif directed:
        emitter = {"shape": "cone", "radius": 0.14, "angleDeg": 12}
    else:
        emitter = {"shape": "sphere", "radius": 0.24 if impact else 0.16}
    burst_count = 48 if impact else 30
    size_start = 0.26 if impact else 0.18
    doc = {
        "id": vfx_id,
        "schema": "vfx@1",
        "presentation": "billboard",
        "emitter": emitter,
        "mode": "burst",
        "burstCount": burst_count,
        "lifetimeSec": {"min": 0.18, "max": 0.72 if impact else 0.56},
        "size": {"start": size_start, "end": 0},
        "color": {"start": start, "end": end},
        "colorStops": [
            [0, start],
            [0.22, [start[0], start[1], start[2], 0.95]],
            [0.68, [end[0], end[1], end[2], 0.38]],
            [1, end],
        ],
        "sizeStops": [[0, size_start], [0.18, size_start * (2.5 if impact else 1.8)], [1, 0]],
        "blendMode": "additive",
        "gravityY": 0 if directed else (0.8 if family == "fire" else 0.2),
        "speed": {"min": 5.0, "max": 9.0} if directed else {"min": 1.0, "max": 3.8},
        "texture": texture_path,
    }
    if directed:
        doc["stretched"] = True
        doc["tailLength"] = 1.8
    return doc


def build(write: bool) -> dict:
    source = read_json(INPUT)
    if source.get("schema") != "ggd.infinity-strash-popp-vfx-reconstruction-candidates@1":
        raise ValueError("Unexpected reconstruction candidate schema")
    if source.get("summary", {}).get("niagaraSystemCandidates") != 14:
        raise ValueError("Expected the pinned 14 Niagara roots")

    max_texture_edge = current_texture_edge_limit()
    converted: list[dict] = []
    excluded: list[dict] = []
    expected_files: dict[Path, bytes] = {}
    for recipe in source["recipes"]:
        family = recipe["inference"]["family"]
        if family not in SUPPORTED_FAMILIES:
            excluded.append({
                "candidateId": recipe["candidateId"],
                "rootReference": recipe["rootReference"],
                "reason": "identity-boundary: PN030 character-special roots are not attributed to PN020 Popp",
            })
            continue
        selected = select_texture(recipe)
        source_texture = EXPORT_ROOT / selected["representativePath"]
        if not source_texture.is_file() or sha256(source_texture) != selected["sha256"]:
            raise ValueError(f"Missing or changed source texture: {source_texture}")
        texture_name = selected["sha256"] + ".png"
        texture_target = TEXTURE_ROOT / texture_name
        conversion = convert_mask(source_texture, texture_target, max_texture_edge) if write else None
        if not write:
            if not texture_target.is_file():
                raise ValueError(f"Refresh missing texture: {texture_target.relative_to(REPO)}")
            with Image.open(texture_target) as image:
                width, height = image.size
            if max(width, height) > max_texture_edge:
                raise ValueError(f"Runtime texture exceeds current {max_texture_edge}px cap: {texture_target}")
            source_width = selected["inspection"]["width"]
            source_height = selected["inspection"]["height"]
            transform = ("preserve-source-rgba" if selected["inspection"].get("hasAlphaChannel") else "rgb-maximum-to-alpha-preserve-rgb") + "; outer-1px-rgba-zero"
            if max(source_width, source_height) > max_texture_edge:
                transform += f"; lanczos-fit-max-edge-{max_texture_edge}"
            conversion = {
                "sourceMode": selected["inspection"]["mode"],
                "sourceWidth": source_width,
                "sourceHeight": source_height,
                "width": width,
                "height": height,
                "maxEdgeLimit": max_texture_edge,
                "transform": transform,
            }
        vfx_id = "fx.strash.popp." + slug(recipe["rootName"]) + ".candidate"
        texture_path = texture_target.relative_to(REPO / "content").as_posix()
        doc = make_vfx_doc(vfx_id, family, recipe["inference"]["phase"], texture_path)
        doc_path = VFX_ROOT / (vfx_id + ".json")
        encoded = (json.dumps(doc, ensure_ascii=False, indent=2) + "\n").encode()
        expected_files[doc_path] = encoded
        if write:
            doc_path.write_bytes(encoded)
        elif not doc_path.is_file() or doc_path.read_bytes() != encoded:
            raise ValueError(f"Refresh generated VFX document: {doc_path.relative_to(REPO)}")
        converted.append({
            "candidateId": recipe["candidateId"],
            "rootReference": recipe["rootReference"],
            "family": family,
            "phase": recipe["inference"]["phase"],
            "sourceTexture": {
                "absolutePath": str(source_texture),
                "bytes": source_texture.stat().st_size,
                "sha256": sha256(source_texture),
                "representativePath": selected["representativePath"],
            },
            "textureConversion": conversion,
            "runtimeTexture": evidence(texture_target),
            "vfxDocument": evidence(doc_path),
            "vfxId": vfx_id,
            "states": {
                "ggdVfxDocumentBuilt": True,
                "sourceTextureConverted": True,
                "niagaraTimingRecovered": False,
                "meshLayersReconstructed": False,
                "skillBound": False,
                "visuallyAccepted": False,
                "runtimeSelectable": False,
                "productionDeployed": False,
            },
        })

    manifest = {
        "schema": SCHEMA,
        "heroId": "b2-popp",
        "sourceId": "steam-infinity-strash-popp-vfx-runtime-candidates-local-20240328",
        "input": evidence(INPUT),
        "policy": {
            "source": evidence(MODEL_BUDGET),
            "textureMaxEdge": max_texture_edge,
        },
        "summary": {
            "niagaraRoots": 14,
            "ggdVfxDocumentsBuilt": len(converted),
            "sourceTexturesConverted": len({r["runtimeTexture"]["sha256"] for r in converted}),
            "identityExcludedRoots": len(excluded),
            "skillBindingsCreated": 0,
            "visuallyAccepted": 0,
            "runtimeSelectable": 0,
            "productionDeployed": 0,
        },
        "conversionBoundary": {
            "kind": "source-texture-based-GGD-reconstruction-candidate",
            "niagaraTimingRecovered": False,
            "meshLayersReconstructed": False,
            "originalEffectParityClaimed": False,
            "candidateDocumentsUseCurrentGgdVfxSchema": True,
            "audioBindingAllowed": False,
        },
        "candidates": converted,
        "excluded": excluded,
        "review": {
            "page": "apps/client/public/asset-review.html",
            "instruction": "Run the existing local asset review page; these unreviewed content/vfx documents enter its hash-pinned queue.",
            "approvalRequiredBeforeSkillBinding": True,
        },
    }
    manifest_encoded = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    manifest_path = OUTPUT / "manifest.json"
    if write:
        OUTPUT.mkdir(parents=True, exist_ok=True)
        manifest_path.write_bytes(manifest_encoded)
        lines = [
            "# 波普原作 VFX：GGD 重建候選 v1",
            "",
            "本批把可確認身分的 12 個 Niagara 根，各轉成一份使用原作來源貼圖的 `vfx@1` 候選。它們會進既有 `asset-review.html` 逐項審查；目前沒有綁到技能。",
            "",
            "- 14 個 Niagara 根中，12 個建立 GGD 候選；2 個 PN030 專屬根因角色邊界排除，沒有誤掛給 PN020。",
            f"- 每份候選都使用重新驗證 SHA 的來源 TGA，轉成瀏覽器可讀 PNG；尺寸上限直接讀正式 `HERO_TEXTURE_EDGE.limit`（本次 {max_texture_edge}px）。",
            "- Niagara 時序與 mesh layer 尚未還原，因此這批不能稱為原作效果完整重現。",
            "- 音效與語音仍由 36 項聽審佇列控制，本工具不建立任何音訊綁定。",
            "- 正式站部署：未驗證。",
            "",
            "## 重建",
            "",
            "```sh",
            "bash scripts/python-pillow.sh tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/build_runtime_candidates.py",
            "bash scripts/python-pillow.sh tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/build_runtime_candidates.py --check",
            "```",
            "",
            "## 候選",
            "",
            "| 原生根 | GGD VFX ID | 類型 | 狀態 |",
            "|---|---|---|---|",
        ]
        for row in converted:
            lines.append(f"| `{row['rootReference']}` | `{row['vfxId']}` | {row['family']} / {row['phase']} | 已轉換候選、待視覺審查、未綁定 |")
        lines += ["", "## 身分邊界排除", ""]
        for row in excluded:
            lines.append(f"- `{row['rootReference']}`：{row['reason']}")
        (OUTPUT / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    else:
        if not manifest_path.is_file() or manifest_path.read_bytes() != manifest_encoded:
            raise ValueError("Refresh runtime candidate manifest")
        expected_docs = {path for path in expected_files}
        actual_docs = set(VFX_ROOT.glob("fx.strash.popp.*.candidate.json"))
        if actual_docs != expected_docs:
            raise ValueError("Runtime candidate document set drifted")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = build(write=not args.check)
    print(
        "Popp VFX runtime candidates:",
        result["summary"]["ggdVfxDocumentsBuilt"],
        "built;",
        result["summary"]["identityExcludedRoots"],
        "identity-excluded; 0 bound",
    )


if __name__ == "__main__":
    main()
